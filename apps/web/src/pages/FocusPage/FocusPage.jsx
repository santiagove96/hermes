import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';
import { Slice } from '@tiptap/pm/model';
import { fetchWritingProject, saveProjectPages, saveProjectHighlights, updateWritingProject, updatePublishSettings, generateSlug, fetchCurrentUsage } from '@hermes/api';
import { IS_MOBILE } from '../../lib/platform';
import { normalizeLegacyPagesForSingleCanvas } from '../../lib/singleCanvas';
import useAuth from '../../hooks/useAuth';
import useLanguage from '../../hooks/useLanguage';
import useFocusMode from './useFocusMode';
import useHighlights, { getDocFlatText, flatOffsetToPos } from './useHighlights';
import useInlineLink from './useInlineLink';
import LinkTooltip from './LinkTooltip';
import FocusChatWindow from './FocusChatWindow';
import HighlightPopover from './HighlightPopover';
import { EMPTY_PAGES } from './PageTabs';
import ProjectSwitcher from './ProjectSwitcher';
import ShareButton from './ShareButton';
import UserMenu from './UserMenu';
import SignupToast from '../../components/SignupToast/SignupToast';
import styles from './FocusPage.module.css';

function looksLikeMarkdown(text) {
  return /(?:^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|---|\*\*|__|\[.+\]\()/.test(text);
}

function getWordCount(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export default function FocusPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const aiEnabled = import.meta.env.VITE_AI_ENABLED !== 'false';
  const [projectTitle, setProjectTitle] = useState('');
  const [projectSubtitle, setProjectSubtitle] = useState('');
  const [publishState, setPublishState] = useState({
    published: false,
    shortId: null,
    slug: null,
    authorName: '',
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsRef = useRef(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [postCopied, setPostCopied] = useState(false);
  const actionsRef = useRef(null);
  const [wordCount, setWordCount] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleEditValue, setTitleEditValue] = useState('');
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [subtitleEditValue, setSubtitleEditValue] = useState('');
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
          saveProjectPages(projectId, pagesRef.current).catch(() => {});
        }, 2000);
      }
    },
  });

  // Sync decorations when focus mode changes
  useEffect(() => {
    syncFocusMode(editor);
  }, [editor, focusMode, syncFocusMode]);

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
              saveProjectPages(projectId, loadedPages).catch(() => {});
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
          if (isLoggedIn && projectId) saveProjectPages(projectId, loadedPages).catch(() => {});
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
  }, [editor, projectId, isLoggedIn, storageKey, initialLoaded, activeTab, replaceHighlights]);

  // Reset when projectId changes
  useEffect(() => {
    setInitialLoaded(false);
    setActiveTab('coral');
    setPages({ ...EMPTY_PAGES });
    pagesRef.current = { ...EMPTY_PAGES };
    if (editor) {
      editor.commands.clearContent();
      setWordCount(0);
    }
    replaceHighlights([]);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist highlights to Supabase when they change
  useEffect(() => {
    if (!isLoggedIn || !projectId || !initialLoaded) return;
    if (highlightSaveTimerRef.current) clearTimeout(highlightSaveTimerRef.current);
    highlightSaveTimerRef.current = setTimeout(() => {
      saveProjectHighlights(projectId, highlights).catch(() => {});
    }, 1500);
  }, [highlights, projectId, isLoggedIn, initialLoaded]);

  // Handle new highlights from chat
  const handleHighlights = useCallback((newHighlights) => {
    addHighlights(newHighlights);
  }, [addHighlights]);

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

    posthog.capture('highlight_accepted', { type: highlight.type });
    dismissHighlight(highlight.id);
  }, [editor, dismissHighlight]);

  // Stable callback for HighlightPopover onDismiss
  const handleDismissHighlight = useCallback((id) => {
    if (id) {
      const h = highlights.find(hl => hl.id === id);
      posthog.capture('highlight_dismissed', { type: h?.type });
      dismissHighlight(id);
    } else {
      clearHighlight();
    }
  }, [highlights, dismissHighlight, clearHighlight]);

  // Reply from highlight: focus chat with context
  const handleReply = useCallback((highlight) => {
    posthog.capture('highlight_replied', { type: highlight.type });
    const prefill = `Re: "${highlight.matchText.slice(0, 50)}${highlight.matchText.length > 50 ? '...' : ''}" — `;
    window.__hermesChatFocus?.(prefill);
    clearHighlight();
  }, [clearHighlight]);

  // Tab switching
  const handleTabChange = useCallback((newTab) => {
    if (!editor || newTab === activeTab) return;

    // Flush pending saves immediately
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      try {
        localStorage.setItem(storageKey, JSON.stringify(pagesRef.current));
      } catch { /* */ }
    }
    if (supabaseSaveTimerRef.current) {
      clearTimeout(supabaseSaveTimerRef.current);
      if (isLoggedIn && projectId) {
        saveProjectPages(projectId, pagesRef.current).catch(() => {});
      }
    }

    // Save current content into pages (empty editor → empty string)
    const hasText = editor.getText().trim().length > 0;
    const currentMd = hasText ? editor.getMarkdown() : '';
    const updated = { ...pagesRef.current, [activeTab]: currentMd };
    setPages(updated);
    pagesRef.current = updated;

    // Switch tab
    switchingRef.current = true;
    setActiveTab(newTab);
    activeTabRef.current = newTab;
    editor.commands.setContent(updated[newTab] || '', { contentType: 'markdown' });
    switchingRef.current = false;

    setWordCount(getWordCount(editor.getText()));
    clearHighlight();

    const tabsUsed = Object.values(pagesRef.current).filter(v => v?.trim()).length;
    posthog.capture('tab_switched', {
      from_tab: activeTab,
      to_tab: newTab,
      tabs_with_content: tabsUsed,
    });
  }, [editor, activeTab, storageKey, isLoggedIn, projectId, clearHighlight]);

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
        await updatePublishSettings(projectId, { slug });
        handlePublishChange({ slug });
      }
    } catch {
      // Revert on failure
      setProjectTitle(projectTitle);
    }
  }, [projectId, projectTitle, publishState.published, handlePublishChange]);

  const handleTitleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTitle(titleEditValue); }
    if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false); }
  }, [commitTitle, titleEditValue]);

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
      posthog.capture('subtitle_updated', {
        action: projectSubtitle ? 'edited' : 'added',
        is_empty: !trimmed,
      });
    } catch {
      setProjectSubtitle(projectSubtitle);
    }
  }, [projectId, projectSubtitle]);

  const handleSubtitleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitSubtitle(subtitleEditValue); }
    if (e.key === 'Escape') { e.preventDefault(); setEditingSubtitle(false); }
  }, [commitSubtitle, subtitleEditValue]);

  const handleSubtitleBlur = useCallback(() => {
    commitSubtitle(subtitleEditValue);
  }, [commitSubtitle, subtitleEditValue]);

  // Stable callback for child components to read pages on-demand (avoids re-renders on every keystroke)
  const getPages = useCallback(() => pagesRef.current, []);

  // Close shortcuts popover on click outside
  useEffect(() => {
    if (!shortcutsOpen) return;
    function handleMouseDown(e) {
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target)) {
        setShortcutsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [shortcutsOpen]);

  // Close actions menu on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    function handleMouseDown(e) {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [actionsOpen]);

  // Escape key closes actions menu
  useEffect(() => {
    if (!actionsOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setActionsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actionsOpen]);

  const postCopiedTimerRef = useRef(null);
  useEffect(() => () => { if (postCopiedTimerRef.current) clearTimeout(postCopiedTimerRef.current); }, []);

  const handleCopyPost = useCallback(() => {
    if (!editor) return;
    const md = editor.getMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      setPostCopied(true);
      postCopiedTimerRef.current = setTimeout(() => setPostCopied(false), 2000);
    });
    setActionsOpen(false);
  }, [editor]);

  const wordLabel = wordCount === 1 ? t('focusPage.word') : t('focusPage.words');
  const nextLanguageCode = language === 'es' ? 'EN' : 'ES';
  const nextLanguageName = language === 'es' ? t('focusPage.english') : t('focusPage.spanish');

  return (
    <div className={styles.page}>
      {/* Settings bar */}
      <div className={styles.hoverZone}>
        <div
          className={`${styles.settingsBar} ${styles.settingsBarVisible}`}
        >
          {isLoggedIn && projectId ? (
            <ProjectSwitcher
              projectId={projectId}
              projectTitle={projectTitle}
              onDropdownOpen={() => setDropdownOpen(true)}
              onDropdownClose={() => setDropdownOpen(false)}
              onProjectRenamed={(id, newTitle) => {
                if (id === projectId) setProjectTitle(newTitle);
              }}
            />
          ) : (
            <span className={styles.brandLabel}>{projectTitle || 'Diless'}</span>
          )}

          <div className={styles.settingsRight}>
            {isOffline && <span className={styles.offlineBadge}>{t('focusPage.offline')}</span>}
            <span className={styles.wordCount}>
              {wordCount} {wordLabel}
            </span>
            {isLoggedIn && projectId && (
              <ShareButton
                projectId={projectId}
                projectTitle={projectTitle}
                getPages={getPages}
                published={publishState.published}
                shortId={publishState.shortId}
                slug={publishState.slug}
                authorName={publishState.authorName}
                publishedTabs={publishState.publishedTabs}
                onPublishChange={handlePublishChange}
                isOpen={shareOpen}
                onOpenChange={setShareOpen}
              />
            )}
            {/* Shortcuts reference — desktop only */}
            <div className={styles.shortcutsWrap} ref={shortcutsRef}>
              <button
                className={styles.shortcutsBtn}
                onClick={() => setShortcutsOpen((v) => !v)}
                title={t('focusPage.shortcutsAndFormatting')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>
              {shortcutsOpen && (
                <div className={styles.shortcutsPopover}>
                  <div className={styles.shortcutsSection}>
                    <div className={styles.shortcutsSectionTitle}>{t('focusPage.shortcuts')}</div>
                    <div className={styles.shortcutRow}><kbd>Cmd+K</kbd><span>{t('focusPage.insertLink')}</span></div>
                    <div className={styles.shortcutRow}><kbd>Cmd+B</kbd><span>{t('focusPage.bold')}</span></div>
                    <div className={styles.shortcutRow}><kbd>Cmd+I</kbd><span>{t('focusPage.italic')}</span></div>
                    <div className={styles.shortcutRow}><kbd>Cmd+Z</kbd><span>{t('focusPage.undo')}</span></div>
                    <div className={styles.shortcutRow}><kbd>Cmd+Shift+Z</kbd><span>{t('focusPage.redo')}</span></div>
                  </div>
                  <div className={styles.shortcutsSection}>
                    <div className={styles.shortcutsSectionTitle}>{t('focusPage.markdown')}</div>
                    <div className={styles.shortcutRow}><code># </code><span>{t('focusPage.heading')}</span></div>
                    <div className={styles.shortcutRow}><code>**text**</code><span>{t('focusPage.bold')}</span></div>
                    <div className={styles.shortcutRow}><code>*text*</code><span>{t('focusPage.italic')}</span></div>
                    <div className={styles.shortcutRow}><code>~~text~~</code><span>{t('focusPage.strikethrough')}</span></div>
                    <div className={styles.shortcutRow}><code>`code`</code><span>{t('focusPage.inlineCode')}</span></div>
                    <div className={styles.shortcutRow}><code>&gt; </code><span>{t('focusPage.blockquote')}</span></div>
                    <div className={styles.shortcutRow}><code>- </code><span>{t('focusPage.bulletList')}</span></div>
                    <div className={styles.shortcutRow}><code>1. </code><span>{t('focusPage.numberedList')}</span></div>
                    <div className={styles.shortcutRow}><code>---</code><span>{t('focusPage.divider')}</span></div>
                    <div className={styles.shortcutRow}><code>[text](url)</code><span>{t('focusPage.link')}</span></div>
                  </div>
                </div>
              )}
            </div>
            <button
              className={styles.langBtn}
              onClick={toggleLanguage}
              title={t('focusPage.languageSwitchTitle')}
              aria-label={t('focusPage.languageMenuItem', { next: nextLanguageName })}
            >
              {nextLanguageCode}
            </button>
            {/* Mobile actions menu */}
            <div className={styles.actionsWrap} ref={actionsRef}>
              <button
                className={styles.actionsBtn}
                onClick={() => setActionsOpen((v) => !v)}
                title={t('focusPage.actions')}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="3" cy="8" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="13" cy="8" r="1.5" />
                </svg>
              </button>
              {actionsOpen && (
                <div className={styles.actionsMenu}>
                  <div className={styles.actionsMenuInfo}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 13h12M2 9h8M2 5h12M2 1h5" />
                    </svg>
                    {wordCount} {wordLabel}
                  </div>
                  {isLoggedIn && projectId && (
                    <button
                      className={styles.actionsMenuItem}
                      onClick={() => {
                        setShareOpen(true);
                        setActionsOpen(false);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12V14H12V12" />
                        <path d="M8 10V2" />
                        <path d="M5 5L8 2L11 5" />
                      </svg>
                      {t('focusPage.sharePost')}
                    </button>
                  )}
                  <button
                    className={styles.actionsMenuItem}
                    onClick={() => {
                      toggleLanguage();
                      setActionsOpen(false);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13Z" />
                      <path d="M1.8 8h12.4" />
                      <path d="M8 1.8c1.6 1.4 2.6 3.7 2.6 6.2S9.6 12.8 8 14.2c-1.6-1.4-2.6-3.7-2.6-6.2S6.4 3.2 8 1.8Z" />
                    </svg>
                    {t('focusPage.languageMenuItem', { next: nextLanguageName })}
                  </button>
                  <button
                    className={styles.actionsMenuItem}
                    onClick={handleCopyPost}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="5" width="9" height="9" rx="1" />
                      <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
                    </svg>
                    {postCopied ? t('focusPage.copied') : t('focusPage.copyPost')}
                  </button>
                </div>
              )}
            </div>
            <UserMenu
              onDropdownOpen={() => setDropdownOpen(true)}
              onDropdownClose={() => setDropdownOpen(false)}
            />
          </div>
        </div>
      </div>

      {/* Scroll area — only this region scrolls */}
      <div className={styles.scrollArea}>
        {/* Editable project title */}
        <div className={styles.pageTitle}>
          {isLoggedIn && projectId && editingTitle ? (
            <input
              className={styles.pageTitleInput}
              value={titleEditValue}
              onChange={(e) => setTitleEditValue(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleBlur}
              autoFocus
            />
          ) : isLoggedIn && projectId ? (
            <button className={styles.pageTitleText} onClick={startEditingTitle}>
              {projectTitle || t('focusPage.untitled')}
            </button>
          ) : (
            <span className={styles.pageTitleText}>{projectTitle || t('focusPage.untitled')}</span>
          )}
        </div>
        {/* Single canvas mode (tabs removed in Diless MVP) */}
        {/* Optional subtitle */}
        <div className={styles.subtitle}>
          {isLoggedIn && projectId && editingSubtitle ? (
            <input
              className={styles.subtitleInput}
              value={subtitleEditValue}
              onChange={(e) => setSubtitleEditValue(e.target.value)}
              onKeyDown={handleSubtitleKeyDown}
              onBlur={handleSubtitleBlur}
              placeholder={t('focusPage.addSubtitlePlaceholder')}
              autoFocus
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
            <EditorContent editor={editor} />
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

      {/* Link tooltip */}
      <LinkTooltip tooltip={linkTooltip} isMac={isMac} />

      {/* Floating chat window (optional in MVP) */}
      {aiEnabled ? (
        <Sentry.ErrorBoundary fallback={<div style={{ position: 'fixed', bottom: 24, left: 24, color: 'var(--text-muted)', fontSize: 13 }}>{t('focusPage.chatUnavailable')}</div>}>
          <FocusChatWindow
            projectId={projectId}
            getPages={getPages}
            activeTab={activeTab}
            onHighlights={handleHighlights}
            session={session}
            isOffline={isOffline}
          />
        </Sentry.ErrorBoundary>
      ) : null}

      <SignupToast wordCount={wordCount} isLoggedIn={isLoggedIn} />
    </div>
  );
}
