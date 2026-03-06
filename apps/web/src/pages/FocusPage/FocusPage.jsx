import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import toast from 'react-hot-toast';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';
import { Slice } from '@tiptap/pm/model';
import { CardsThree, ChatCircleDots, GlobeSimple, TextAlignLeft } from '@phosphor-icons/react';
import { fetchWritingProject, HOME_SHORT_ID, saveProjectPagesWithOptions, saveProjectHighlights, updateWritingProject, updatePublishSettings, generateSlug, fetchCurrentUsage } from '@hermes/api';
import { IS_MOBILE } from '../../lib/platform';
import { normalizeLegacyPagesForSingleCanvas } from '../../lib/singleCanvas';
import useAuth from '../../hooks/useAuth';
import useLanguage from '../../hooks/useLanguage';
import useFocusMode from './useFocusMode';
import useHighlights, { getDocFlatText, flatOffsetToPos } from './useHighlights';
import useInlineLink from './useInlineLink';
import LinkTooltip from './LinkTooltip';
import HighlightPopover from './HighlightPopover';
import { EMPTY_PAGES } from './PageTabs';
import ProjectSwitcher from './ProjectSwitcher';
import ShareButton from './ShareButton';
import UserMenu from './UserMenu';
import AnalyzeMenu from '../../components/AnalyzeMenu/AnalyzeMenu';
import SignupToast from '../../components/SignupToast/SignupToast';
import Button from '../../components/ui/Button';
import Navbar from '../../components/ui/Navbar';
import { shareSelectionStory } from '../../lib/shareSelection';
import { getPlainTextFromBlocks, getShareBlocksFromEditorSelection } from '../../lib/shareSelectionBlocks';
import { track } from '../../lib/analytics';
import styles from './FocusPage.module.css';

const FocusChatWindow = lazy(() => import('./FocusChatWindow'));
const QASimulatorModal = lazy(() => import('../../components/QASimulatorModal/QASimulatorModal'));
const FlashcardsView = lazy(() => import('../../components/FlashcardsView/FlashcardsView'));

function looksLikeMarkdown(text) {
  return /(?:^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|---|\*\*|__|\[.+\]\()/.test(text);
}

function getWordCount(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function autosizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function isMobileSelectionSurface() {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
  const narrowViewport = window.matchMedia?.('(max-width: 900px)')?.matches;
  return !!(coarsePointer || narrowViewport);
}

function getShareAuthorName(session, profileFullName, publishAuthorName) {
  const profileName = String(profileFullName || '').trim();
  if (profileName) return profileName;

  const published = String(publishAuthorName || '').trim();
  if (published) return published;

  const metadata = session?.user?.user_metadata || {};
  const fallback =
    metadata.full_name ||
    metadata.name ||
    session?.user?.email?.split('@')[0] ||
    '';

  return String(fallback).trim();
}

export default function FocusPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, profile } = useAuth();
  const { t } = useLanguage();
  const aiEnabled = import.meta.env.VITE_AI_ENABLED !== 'false';
  const [projectTitle, setProjectTitle] = useState('');
  const [projectSubtitle, setProjectSubtitle] = useState('');
  const [publishState, setPublishState] = useState({
    published: false,
    shortId: null,
    slug: null,
    authorName: '',
    ownerUsername: null,
    ownerFullName: null,
    publishedTabs: [],
    publishedAt: null,
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Track online/offline status
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  const [_dropdownOpen, setDropdownOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeUsage, setAnalyzeUsage] = useState(null);
  const [selectionMenu, setSelectionMenu] = useState({
    visible: false,
    left: 0,
    top: 0,
    isHighlighted: false,
    selectedText: '',
    selectedBlocks: [],
  });
  const [mobileSelectionOffset, setMobileSelectionOffset] = useState(12);
  const selectionActionPressRef = useRef(false);
  const [wordCount, setWordCount] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleEditValue, setTitleEditValue] = useState('');
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [subtitleEditValue, setSubtitleEditValue] = useState('');
  const titleInputRef = useRef(null);
  const subtitleInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('coral');
  const [pages, setPages] = useState({ ...EMPTY_PAGES });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const supabaseSaveTimerRef = useRef(null);
  const highlightSaveTimerRef = useRef(null);
  const switchingRef = useRef(false);
  const pagesRef = useRef(pages);
  const activeTabRef = useRef(activeTab);
  const storageKey = projectId ? `hermes-focus-pages-${projectId}` : 'hermes-welcome-pages';

  // Keep refs in sync for use in onUpdate callback
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const isLoggedIn = !!session;
  const mobileSelectionUi = isMobileSelectionSurface();
  const isHomeProject = publishState.shortId === HOME_SHORT_ID;

  // Title and publish state are now loaded from the single fetch in the content-loading effect below.

  const {
    focusMode,
    focusExtension,
    syncFocusMode,
  } = useFocusMode();

  const {
    highlights,
    activeHighlight,
    popoverRect,
    highlightExtension,
    addHighlights,
    dismissHighlight,
    clearHighlight,
    replaceHighlights,
    syncHighlights,
  } = useHighlights();

  const { inlineLinkExtension, linkTooltip, isMac } = useInlineLink();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Markdown,
      Highlight,
      Placeholder.configure({
        placeholder: t('focusPage.startWriting'),
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
      }),
      inlineLinkExtension,
      focusExtension,
      highlightExtension,
    ],
    editorProps: {
      clipboardTextParser(text, $context, plainText) {
        if (plainText || !looksLikeMarkdown(text)) {
          return null;
        }
        const parsed = editor?.markdown?.parse(text);
        if (!parsed?.content) return null;
        try {
          const doc = editor.schema.nodeFromJSON(parsed);
          return new Slice(doc.content, 0, 0);
        } catch {
          return null;
        }
      },
    },
    content: '',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      if (switchingRef.current) return;

      const text = ed.getText();
      setWordCount(getWordCount(text));

      const md = text.trim().length > 0 ? ed.getMarkdown() : '';
      const tab = activeTabRef.current;

      setPages((prev) => {
        const next = { ...prev, [tab]: md };
        pagesRef.current = next;
        return next;
      });

      // Debounced localStorage save (500ms)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(pagesRef.current));
        } catch {
          // localStorage full or unavailable
        }
      }, 500);

      // Debounced Supabase save (2s, authenticated only)
      if (isLoggedIn && projectId) {
        if (supabaseSaveTimerRef.current) clearTimeout(supabaseSaveTimerRef.current);
        supabaseSaveTimerRef.current = setTimeout(() => {
          saveProjectPagesWithOptions(projectId, pagesRef.current, { syncPublished: isHomeProject }).catch(() => {});
        }, 2000);
      }
    },
  });

  const updateSelectionMenu = useCallback(() => {
    if (!editor) return;

    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) {
      setSelectionMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const fromCoords = editor.view.coordsAtPos(from);
    const toCoords = editor.view.coordsAtPos(to);
    const menuWidth = 120;
    const centerX = (fromCoords.left + toCoords.right) / 2;
    const left = Math.max(16, Math.min(centerX - menuWidth / 2, window.innerWidth - menuWidth - 16));
    const top = Math.max(64, Math.min(fromCoords.top - 52, window.innerHeight - 80));

    const selectedBlocks = getShareBlocksFromEditorSelection(editor);
    const selectedText = getPlainTextFromBlocks(selectedBlocks)
      || editor.state.doc.textBetween(from, to, ' ', ' ').trim();
    if (!selectedText) {
      setSelectionMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    setSelectionMenu({
      visible: true,
      left,
      top,
      isHighlighted: editor.isActive('highlight'),
      selectedText,
      selectedBlocks,
    });
  }, [editor]);

  const handleToggleManualHighlight = useCallback(() => {
    selectionActionPressRef.current = false;
    if (!editor) return;
    if (editor.isActive('highlight')) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().toggleHighlight().run();
    }
    setSelectionMenu((prev) => ({ ...prev, visible: false }));
  }, [editor]);

  const handleShareSelection = useCallback(async () => {
    selectionActionPressRef.current = false;
    const quote = (selectionMenu.selectedText || '').trim();
    if (!quote) return;

    const payload = {
      quote,
      blocks: selectionMenu.selectedBlocks,
      title: projectTitle || 'Diless',
      author: getShareAuthorName(session, profile?.fullName, publishState.authorName),
      locale: 'es-AR',
    };
    setSelectionMenu((prev) => ({ ...prev, visible: false }));

    try {
      const result = await shareSelectionStory(payload);
      if (result.mode === 'copied-image') {
        toast.success('Imagen copiada al portapapeles');
      } else if (result.mode === 'copied-text') {
        toast.success('Texto copiado al portapapeles');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        toast.error(err?.message || 'No se pudo compartir la selección');
      }
    }
  }, [projectTitle, profile?.fullName, publishState.authorName, selectionMenu.selectedBlocks, selectionMenu.selectedText, session]);

  const preserveSelectionDuringAction = useCallback((e) => {
    selectionActionPressRef.current = true;
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!editor) return;
    const hide = () => {
      if (selectionActionPressRef.current) {
        selectionActionPressRef.current = false;
        return;
      }
      setSelectionMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };
    const update = () => updateSelectionMenu();

    editor.on('selectionUpdate', update);
    editor.on('blur', hide);
    const scrollOptions = { capture: true, passive: true };
    window.addEventListener('scroll', hide, scrollOptions);
    window.addEventListener('resize', hide, { passive: true });

    return () => {
      editor.off('selectionUpdate', update);
      editor.off('blur', hide);
      window.removeEventListener('scroll', hide, scrollOptions);
      window.removeEventListener('resize', hide);
    };
  }, [editor, updateSelectionMenu]);

  useEffect(() => {
    if (!mobileSelectionUi || !window.visualViewport) {
      setMobileSelectionOffset(12);
      return undefined;
    }

    const viewport = window.visualViewport;
    const recompute = () => {
      const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setMobileSelectionOffset(12 + keyboardInset);
    };

    recompute();
    viewport.addEventListener('resize', recompute);
    viewport.addEventListener('scroll', recompute);

    return () => {
      viewport.removeEventListener('resize', recompute);
      viewport.removeEventListener('scroll', recompute);
    };
  }, [mobileSelectionUi]);

  // Sync decorations when focus mode changes
  useEffect(() => {
    syncFocusMode(editor);
  }, [editor, focusMode, syncFocusMode]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isAnalyzing);
  }, [editor, isAnalyzing]);

  // Sync highlight decorations when highlights change
  useEffect(() => {
    syncHighlights(editor);
  }, [editor, highlights, syncHighlights]);

  // Init mobile keyboard handler for Tauri mobile
  useEffect(() => {
    if (!IS_MOBILE) return;
    let destroy;
    import('../../lib/mobileKeyboard.js').then(({ initMobileKeyboard }) => {
      destroy = initMobileKeyboard();
    });
    return () => { if (destroy) destroy(); };
  }, []);

  // Load content: Supabase first (if logged in), then localStorage fallback
  useEffect(() => {
    if (!editor) return;
    if (initialLoaded) return;

    let cancelled = false;

    async function loadContent() {
      let loadedPages = null;
      let shouldPersistMigratedPages = false;

      const finalizeLoadedPages = (candidatePages) => {
        if (!candidatePages) return null;
        const normalized = normalizeLegacyPagesForSingleCanvas(candidatePages, EMPTY_PAGES);
        if (normalized.migrated) shouldPersistMigratedPages = true;
        return normalized.pages;
      };

      // Try Supabase first if logged in
      if (isLoggedIn && projectId) {
        try {
          const project = await fetchWritingProject(projectId);
          if (cancelled) return;

          // Set title and publish state from the same fetch
          if (project) {
            if (project.title) setProjectTitle(project.title);
            setProjectSubtitle(project.subtitle || '');
            setPublishState({
              published: project.published,
              shortId: project.shortId,
              slug: project.slug,
              authorName: project.authorName,
              ownerUsername: project.ownerUsername,
              ownerFullName: project.ownerFullName,
              publishedTabs: project.publishedTabs,
              publishedAt: project.publishedAt,
            });
          }

          // Use pages if they have content, else migrate from content field
          const hasPages = project?.pages && Object.values(project.pages).some((v) => v);
          if (hasPages) {
            loadedPages = finalizeLoadedPages({ ...EMPTY_PAGES, ...project.pages });
          } else if (project?.content) {
            loadedPages = finalizeLoadedPages({ ...EMPTY_PAGES, coral: project.content });
          }

          // Load highlights from project
          if (project?.highlights && project.highlights.length > 0) {
            replaceHighlights(project.highlights);
          }

          if (loadedPages) {
            if (shouldPersistMigratedPages) {
              try {
                localStorage.setItem(storageKey, JSON.stringify(loadedPages));
              } catch { /* localStorage unavailable */ }
              saveProjectPagesWithOptions(projectId, loadedPages, { syncPublished: isHomeProject }).catch(() => {});
            }
            setPages(loadedPages);
            pagesRef.current = loadedPages;
            editor.commands.setContent(loadedPages[activeTab] || '', { contentType: 'markdown' });
            setWordCount(getWordCount(editor.getText()));
            setInitialLoaded(true);
            return;
          }
        } catch {
          // Fall through to localStorage
        }
      }

      if (cancelled) return;

      // localStorage fallback
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') {
            loadedPages = finalizeLoadedPages({ ...EMPTY_PAGES, ...parsed });
          }
        }
      } catch {
        // Try legacy single-content key
        try {
          const legacy = localStorage.getItem(`hermes-focus-${projectId}`);
          if (legacy) {
            loadedPages = finalizeLoadedPages({ ...EMPTY_PAGES, coral: legacy });
          }
        } catch {
          // localStorage unavailable
        }
      }

      // No localStorage found — seed with Welcome content for unauthenticated users
      if (!loadedPages && !isLoggedIn) {
        const { WELCOME_PAGES, WELCOME_HIGHLIGHTS } = await import('@hermes/api');
        loadedPages = finalizeLoadedPages({ ...EMPTY_PAGES, ...WELCOME_PAGES });
        if (WELCOME_HIGHLIGHTS) replaceHighlights(WELCOME_HIGHLIGHTS);
      }

      // Set title for unauth Welcome experience
      if (!isLoggedIn && !projectId) {
        setProjectTitle('Bienvenido');
      }

      if (loadedPages) {
        if (shouldPersistMigratedPages) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(loadedPages));
          } catch { /* localStorage unavailable */ }
          if (isLoggedIn && projectId) {
            saveProjectPagesWithOptions(projectId, loadedPages, { syncPublished: isHomeProject }).catch(() => {});
          }
        }
        setPages(loadedPages);
        pagesRef.current = loadedPages;
        editor.commands.setContent(loadedPages[activeTab] || '', { contentType: 'markdown' });
        setWordCount(getWordCount(editor.getText()));
      }

      setInitialLoaded(true);
    }

    loadContent();

    return () => { cancelled = true; };
  }, [editor, projectId, isLoggedIn, storageKey, initialLoaded, activeTab, replaceHighlights, isHomeProject]);

  // Reset when projectId changes
  useEffect(() => {
    setInitialLoaded(false);
    setProjectTitle('');
    setProjectSubtitle('');
    setPublishState({
      published: false,
      shortId: null,
      slug: null,
      authorName: '',
      ownerUsername: null,
      ownerFullName: null,
      publishedTabs: [],
      publishedAt: null,
    });
    setActiveTab('coral');
    setPages({ ...EMPTY_PAGES });
    pagesRef.current = { ...EMPTY_PAGES };
    setIsAnalyzing(false);
    if (editor) {
      editor.commands.clearContent();
      setWordCount(0);
    }
    replaceHighlights([]);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist highlights to Supabase when they change
  useEffect(() => {
    if (!isLoggedIn || !projectId || !initialLoaded || isAnalyzing) return;
    if (highlightSaveTimerRef.current) clearTimeout(highlightSaveTimerRef.current);
    highlightSaveTimerRef.current = setTimeout(() => {
      saveProjectHighlights(projectId, highlights).catch(() => {});
    }, 1500);
  }, [highlights, projectId, isLoggedIn, initialLoaded, isAnalyzing]);

  // Handle new highlights from chat
  const handleHighlights = useCallback((newHighlights) => {
    addHighlights(newHighlights);
  }, [addHighlights]);

  const handleAnalyzeStart = useCallback(() => {
    setIsAnalyzing(true);
    replaceHighlights([]);
    clearHighlight();
  }, [clearHighlight, replaceHighlights]);

  const handleAnalyzeHighlight = useCallback((highlight) => {
    addHighlights([highlight]);
  }, [addHighlights]);

  const handleAnalyzeDone = useCallback((payload) => {
    setIsAnalyzing(false);
    if (payload) {
      setAnalyzeUsage({
        hasActiveSubscription: !!payload.hasActiveSubscription,
        remainingFreeAnalyses: payload.remainingFreeAnalyses ?? 0,
      });
    }
  }, []);

  const handleAnalyzeUsage = useCallback((usage) => {
    setAnalyzeUsage(usage);
  }, []);

  const handleAnalyzeError = useCallback((error) => {
    setIsAnalyzing(false);
    replaceHighlights([]);
    toast.error(error?.serverMessage || error?.message || 'No se pudo completar el análisis');
  }, [replaceHighlights]);

  // Accept edit: replace matchText in editor with suggestedEdit
  const handleAcceptEdit = useCallback((highlight) => {
    if (!editor || !highlight.suggestedEdit) return;

    // Search in flat text (matches what the AI sees after stripMarkdown)
    const flatText = getDocFlatText(editor.state.doc);
    const idx = flatText.indexOf(highlight.matchText);
    if (idx !== -1) {
      const from = flatOffsetToPos(editor.state.doc, idx);
      const to = flatOffsetToPos(editor.state.doc, idx + highlight.matchText.length);
      if (from.found && to.found) {
        editor.chain().focus().insertContentAt({ from: from.pos, to: to.pos }, highlight.suggestedEdit).run();
      }
    }

    track('highlight_accepted', { type: highlight.type });
    dismissHighlight(highlight.id);
  }, [editor, dismissHighlight]);

  // Stable callback for HighlightPopover onDismiss
  const handleDismissHighlight = useCallback((id) => {
    if (id) {
      const h = highlights.find(hl => hl.id === id);
      track('highlight_dismissed', { type: h?.type });
      dismissHighlight(id);
    } else {
      clearHighlight();
    }
  }, [highlights, dismissHighlight, clearHighlight]);

  // Reply from highlight: focus chat with context
  const handleReply = useCallback((highlight) => {
    track('highlight_replied', { type: highlight.type });
    const prefill = `Re: "${highlight.matchText.slice(0, 50)}${highlight.matchText.length > 50 ? '...' : ''}" — `;
    window.__hermesChatFocus?.(prefill);
    clearHighlight();
  }, [clearHighlight]);

  const handlePublishChange = useCallback((updates) => {
    setPublishState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Poll for upgrade confirmation when returning from Stripe
  useEffect(() => {
    if (searchParams.get('upgraded') !== 'true' || !session?.access_token) return;

    let attempts = 0;
    const maxAttempts = 15;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const usage = await fetchCurrentUsage(session.access_token);
        if (usage.plan === 'pro') {
          clearInterval(interval);
          setSearchParams((prev) => { prev.delete('upgraded'); return prev; }, { replace: true });
        }
      } catch {
        // Ignore errors during polling
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setSearchParams((prev) => { prev.delete('upgraded'); return prev; }, { replace: true });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [searchParams, session?.access_token, setSearchParams]);

  // Inline title editing
  const startEditingTitle = useCallback(() => {
    setTitleEditValue(projectTitle);
    setEditingTitle(true);
  }, [projectTitle]);

  const commitTitle = useCallback(async (value) => {
    const trimmed = value.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === projectTitle) return;

    setProjectTitle(trimmed);
    try {
        await updateWritingProject(projectId, { title: trimmed });
        if (publishState.published) {
          const slug = generateSlug(trimmed);
          const updated = await updatePublishSettings(projectId, { slug });
          handlePublishChange({ slug: updated.slug });
        }
    } catch {
      // Revert on failure
      setProjectTitle(projectTitle);
    }
  }, [projectId, projectTitle, publishState.published, handlePublishChange]);

  const handleTitleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTitle(titleEditValue);
      setSubtitleEditValue(projectSubtitle || '');
      setEditingSubtitle(true);
      requestAnimationFrame(() => {
        const input = subtitleInputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    }
    if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false); }
  }, [commitTitle, projectSubtitle, titleEditValue]);

  const handleTitleBlur = useCallback(() => {
    commitTitle(titleEditValue);
  }, [commitTitle, titleEditValue]);

  // Inline subtitle editing
  const startEditingSubtitle = useCallback(() => {
    setSubtitleEditValue(projectSubtitle);
    setEditingSubtitle(true);
  }, [projectSubtitle]);

  const commitSubtitle = useCallback(async (value) => {
    const trimmed = value.trim();
    setEditingSubtitle(false);
    if (trimmed === projectSubtitle) return;

    setProjectSubtitle(trimmed);
    try {
      await updateWritingProject(projectId, { subtitle: trimmed });
      track('subtitle_updated', {
        action: projectSubtitle ? 'edited' : 'added',
        is_empty: !trimmed,
      });
    } catch {
      setProjectSubtitle(projectSubtitle);
    }
  }, [projectId, projectSubtitle]);

  const handleSubtitleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSubtitle(subtitleEditValue);
      requestAnimationFrame(() => {
        if (!editor) return;
        editor.chain().focus('end').run();
      });
    }
    if (e.key === 'Escape') { e.preventDefault(); setEditingSubtitle(false); }
  }, [commitSubtitle, editor, subtitleEditValue]);

  const handleSubtitleBlur = useCallback(() => {
    commitSubtitle(subtitleEditValue);
  }, [commitSubtitle, subtitleEditValue]);

  useEffect(() => {
    if (editingTitle) autosizeTextarea(titleInputRef.current);
  }, [editingTitle, titleEditValue]);

  useEffect(() => {
    if (editingSubtitle) autosizeTextarea(subtitleInputRef.current);
  }, [editingSubtitle, subtitleEditValue]);

  // Stable callback for child components to read pages on-demand (avoids re-renders on every keystroke)
  const getPages = useCallback(() => pagesRef.current, []);

  const wordLabel = wordCount === 1 ? t('focusPage.word') : t('focusPage.words');
  const isProjectLoading = isLoggedIn && !!projectId && !initialLoaded;
  const trainItems = [
    {
      label: 'Q&A',
      icon: <ChatCircleDots size={16} weight="regular" />,
      onSelect: () => setQaOpen(true),
    },
    {
      label: 'Tarjetas',
      icon: <CardsThree size={16} weight="regular" />,
      onSelect: () => setFlashcardsOpen(true),
    },
  ];

  const projectStartSlot = isLoggedIn && projectId ? (
    <ProjectSwitcher
      projectId={projectId}
      projectTitle={projectTitle}
      onDropdownOpen={() => setDropdownOpen(true)}
      onDropdownClose={() => setDropdownOpen(false)}
      onProjectRenamed={(id, newTitle) => {
        if (id === projectId) setProjectTitle(newTitle);
      }}
      renderTrigger={({ toggleDropdown, projectTitle: currentTitle }) => (
        <button
          type="button"
          className={styles.navProjectTrigger}
          onClick={toggleDropdown}
          aria-label="Abrir proyectos"
        >
          <span className={styles.navLogo}>Diles</span>
          <span className={styles.navSeparator}>/</span>
          <span className={styles.navProjectCurrent}>
            <TextAlignLeft size={16} weight="regular" />
            <span className={styles.navProjectLabel}>{currentTitle}</span>
          </span>
        </button>
      )}
    />
  ) : null;

  const desktopAnalyzeControl = isLoggedIn && projectId && aiEnabled ? (
    <AnalyzeMenu
      projectId={projectId}
      session={session}
      getPages={getPages}
      activeTab={activeTab}
      onStart={handleAnalyzeStart}
      onHighlight={handleAnalyzeHighlight}
      onDone={handleAnalyzeDone}
      onError={handleAnalyzeError}
      onUsage={handleAnalyzeUsage}
    />
  ) : null;

  const mobileAnalyzeControl = isLoggedIn && projectId && aiEnabled ? (
    <AnalyzeMenu
      projectId={projectId}
      session={session}
      getPages={getPages}
      activeTab={activeTab}
      onStart={handleAnalyzeStart}
      onHighlight={handleAnalyzeHighlight}
      onDone={handleAnalyzeDone}
      onError={handleAnalyzeError}
      onUsage={handleAnalyzeUsage}
      iconOnly
    />
  ) : null;

  const desktopPublishControl = isLoggedIn && projectId ? (
    <ShareButton
      projectId={projectId}
      projectTitle={projectTitle}
      getPages={getPages}
      published={publishState.published}
      shortId={publishState.shortId}
      slug={publishState.slug}
      authorName={publishState.authorName}
      ownerUsername={publishState.ownerUsername}
      publishedTabs={publishState.publishedTabs}
      onPublishChange={handlePublishChange}
      isOpen={shareOpen}
      onOpenChange={setShareOpen}
      renderTrigger={({ toggleOpen, title }) => (
        <Button
          variant="outline"
          size="sm"
          iconOnly
          aria-label={title}
          onClick={toggleOpen}
        >
          <GlobeSimple size={16} weight="regular" />
        </Button>
      )}
    />
  ) : null;

  const mobilePublishControl = isLoggedIn && projectId ? (
    <ShareButton
      projectId={projectId}
      projectTitle={projectTitle}
      getPages={getPages}
      published={publishState.published}
      shortId={publishState.shortId}
      slug={publishState.slug}
      authorName={publishState.authorName}
      ownerUsername={publishState.ownerUsername}
      publishedTabs={publishState.publishedTabs}
      onPublishChange={handlePublishChange}
      isOpen={shareOpen}
      onOpenChange={setShareOpen}
      renderTrigger={({ toggleOpen, title }) => (
        <Button
          variant="outline"
          size="sm"
          iconOnly
          aria-label={title}
          onClick={toggleOpen}
        >
          <GlobeSimple size={16} weight="regular" />
        </Button>
      )}
    />
  ) : null;

  const desktopAccountControl = (
    <UserMenu
      onDropdownOpen={() => setDropdownOpen(true)}
      onDropdownClose={() => setDropdownOpen(false)}
    />
  );

  const mobileAccountControl = (
    <UserMenu
      onDropdownOpen={() => setDropdownOpen(true)}
      onDropdownClose={() => setDropdownOpen(false)}
    />
  );

  return (
    <div className={styles.page}>
      <div className={styles.hoverZone}>
        <Navbar
          variant="project"
          title={projectTitle || 'Di algo...'}
          wordCount={wordCount}
          wordLabel={wordLabel}
          startSlot={projectStartSlot}
          analyzeControl={desktopAnalyzeControl}
          trainItems={aiEnabled ? trainItems : []}
          publishControl={desktopPublishControl}
          accountControl={desktopAccountControl}
          mobileAccountControl={mobileAccountControl}
          mobilePublishControl={mobilePublishControl}
          mobileAnalyzeControl={mobileAnalyzeControl}
        />
      </div>

      {/* Scroll area — only this region scrolls */}
      <div className={styles.scrollArea}>
        {/* Editable project title */}
        <div className={styles.pageTitle}>
          {isProjectLoading ? (
            <div className={styles.titleLoading}>
              <div className={styles.titleLoadingLine} style={{ width: '58%' }} />
            </div>
          ) : isLoggedIn && projectId && editingTitle ? (
            <textarea
              ref={titleInputRef}
              className={styles.pageTitleInput}
              value={titleEditValue}
              onChange={(e) => setTitleEditValue(e.target.value)}
              onInput={(e) => autosizeTextarea(e.currentTarget)}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleBlur}
              placeholder="Di algo..."
              autoFocus
              rows={1}
            />
          ) : isLoggedIn && projectId ? (
            <button className={styles.pageTitleText} onClick={startEditingTitle}>
              {projectTitle || 'Di algo...'}
            </button>
          ) : (
            <span className={styles.pageTitleText}>{projectTitle || t('focusPage.untitled')}</span>
          )}
        </div>
        {/* Single canvas mode (tabs removed in Diless MVP) */}
        {/* Optional subtitle */}
        <div className={styles.subtitle}>
          {isProjectLoading ? null : isLoggedIn && projectId && editingSubtitle ? (
            <textarea
              ref={subtitleInputRef}
              className={styles.subtitleInput}
              value={subtitleEditValue}
              onChange={(e) => setSubtitleEditValue(e.target.value)}
              onInput={(e) => autosizeTextarea(e.currentTarget)}
              onKeyDown={handleSubtitleKeyDown}
              onBlur={handleSubtitleBlur}
              placeholder={t('focusPage.addSubtitlePlaceholder')}
              autoFocus
              rows={1}
            />
          ) : projectSubtitle ? (
            isLoggedIn && projectId ? (
              <button className={styles.subtitleText} onClick={startEditingSubtitle}>
                {projectSubtitle}
              </button>
            ) : (
              <span className={styles.subtitleText}>{projectSubtitle}</span>
            )
          ) : isLoggedIn && projectId ? (
            <button className={styles.subtitleAdd} onClick={startEditingSubtitle}>
              {t('focusPage.addSubtitle')}
            </button>
          ) : null}
        </div>
        <div className={styles.content}>
          <div className={styles.editorWrap}>
            {isProjectLoading ? (
              <div className={styles.editorLoading} aria-label="Cargando artículo">
                <div className={styles.editorLoadingLine} style={{ width: '62%', height: '26px' }} />
                <div className={styles.editorLoadingLine} style={{ width: '92%' }} />
                <div className={styles.editorLoadingLine} style={{ width: '86%' }} />
                <div className={styles.editorLoadingLine} style={{ width: '78%' }} />
              </div>
            ) : (
              <EditorContent editor={editor} />
            )}
            {isAnalyzing ? (
              <div className={styles.analyzeOverlay} aria-live="polite" aria-label="Analizando">
                <div className={styles.dotGridLoader} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                {analyzeUsage && !analyzeUsage.hasActiveSubscription ? (
                  <div className={styles.analyzeUsage}>
                    Te quedan {analyzeUsage.remainingFreeAnalyses} análisis gratuitos
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Highlight popover */}
      <HighlightPopover
        highlight={activeHighlight}
        rect={popoverRect}
        onDismiss={handleDismissHighlight}
        onAcceptEdit={handleAcceptEdit}
        onReply={handleReply}
      />

      {selectionMenu.visible && !mobileSelectionUi && (
        <div
          className={styles.selectionMenu}
          style={{ left: `${selectionMenu.left}px`, top: `${selectionMenu.top}px` }}
          role="dialog"
          aria-label="Acciones de resaltado"
        >
          <button
            type="button"
            className={styles.selectionMenuButton}
            onPointerDown={preserveSelectionDuringAction}
            onClick={handleToggleManualHighlight}
          >
            {selectionMenu.isHighlighted ? 'Eliminar' : 'Destacar'}
          </button>
          <button
            type="button"
            className={styles.selectionMenuButton}
            onPointerDown={preserveSelectionDuringAction}
            onClick={handleShareSelection}
          >
            Compartir
          </button>
        </div>
      )}

      {selectionMenu.visible && mobileSelectionUi && (
        <div
          className={styles.mobileSelectionBar}
          style={{ bottom: `${mobileSelectionOffset}px` }}
          role="dialog"
          aria-label="Acciones de resaltado"
        >
          <button
            type="button"
            className={styles.mobileSelectionButton}
            onPointerDown={preserveSelectionDuringAction}
            onClick={handleToggleManualHighlight}
          >
            {selectionMenu.isHighlighted ? 'Eliminar' : 'Destacar'}
          </button>
          <button
            type="button"
            className={styles.mobileSelectionButton}
            onPointerDown={preserveSelectionDuringAction}
            onClick={handleShareSelection}
          >
            Compartir
          </button>
        </div>
      )}

      {/* Link tooltip */}
      <LinkTooltip tooltip={linkTooltip} isMac={isMac} />

      <Suspense fallback={null}>
        <FlashcardsView
          open={flashcardsOpen}
          onClose={() => setFlashcardsOpen(false)}
          projectId={projectId}
          session={session}
          isOffline={isOffline}
          getPages={getPages}
        />
      </Suspense>

      {/* Floating chat window (optional in MVP) */}
      {aiEnabled ? (
        <div className={styles.assistantHidden}>
          <Sentry.ErrorBoundary fallback={<div style={{ position: 'fixed', bottom: 24, left: 24, color: 'var(--text-muted)', fontSize: 13 }}>{t('focusPage.chatUnavailable')}</div>}>
            <Suspense fallback={null}>
              <FocusChatWindow
                projectId={projectId}
                getPages={getPages}
                activeTab={activeTab}
                onHighlights={handleHighlights}
                session={session}
                isOffline={isOffline}
              />
            </Suspense>
          </Sentry.ErrorBoundary>
        </div>
      ) : null}

      <Suspense fallback={null}>
        <QASimulatorModal
          open={qaOpen}
          onClose={() => setQaOpen(false)}
          projectId={projectId}
          session={session}
          isOffline={isOffline}
        />
      </Suspense>

      <SignupToast wordCount={wordCount} isLoggedIn={isLoggedIn} />
    </div>
  );
}
