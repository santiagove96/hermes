import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { buildCanonicalPublicUrl, fetchPublishedEssayByPath, fetchPublishedEssayByShortId } from '@hermes/api';
import { getSingleCanvasPublishedContent } from '../../lib/singleCanvas';
import Navbar from '../../components/ui/Navbar';
import MarkdownText from '../../components/MarkdownText/MarkdownText';
import { shareSelectionStory } from '../../lib/shareSelection';
import { getPlainTextFromBlocks, getShareBlocksFromRange } from '../../lib/shareSelectionBlocks';
import GlobalLoader from '../../components/GlobalLoader/GlobalLoader';
import styles from './ReadPage.module.css';

function formatDate(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function hasRenderableEssayData(data) {
  if (!data) return false;
  const content = getSingleCanvasPublishedContent(data.pages, data.publishedTabs);
  return Boolean(
    (data.title || '').trim()
    || (data.subtitle || '').trim()
    || (data.authorName || '').trim()
    || (content || '').trim(),
  );
}

function isMobileSelectionSurface() {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
  const narrowViewport = window.matchMedia?.('(max-width: 900px)')?.matches;
  return !!(coarsePointer || narrowViewport);
}

export default function ReadPage() {
  const { shortId, slug, username } = useParams();
  const navigate = useNavigate();
  const [essay, setEssay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectionMenu, setSelectionMenu] = useState({
    visible: false,
    left: 0,
    top: 0,
    selectedText: '',
    selectedBlocks: [],
  });
  const [mobileSelectionOffset, setMobileSelectionOffset] = useState(12);
  const selectionActionPressRef = useRef(false);
  const bodyRef = useRef(null);
  const mobileSelectionUi = isMobileSelectionSurface();

  useEffect(() => {
    if (!shortId && !username) return;

    let cancelled = false;
    let retryTimer;

    // Keep skeleton visible until we get a stable payload for this article.
    // This avoids flashing an empty article shell on refresh.
    setLoading(true);
    setEssay(null);

    const loadEssay = async (attempt = 0) => {
      try {
        let data = null;
        let canonicalUrl = '';
        if (shortId) {
          data = await fetchPublishedEssayByShortId(shortId);
        } else if (username) {
          data = await fetchPublishedEssayByPath({ username, slug });
        }
        if (cancelled) return;

        if (!data) {
          setEssay(null);
          setLoading(false);
          return;
        }

        // Redirect to canonical URL
        if (data.ownerUsername && data.slug) {
          canonicalUrl = buildCanonicalPublicUrl({
            username: data.ownerUsername,
            slug: data.slug,
          });
        } else if (data.shortId && data.slug) {
          canonicalUrl = `${window.location.origin}/read/${data.shortId}/${data.slug}`;
        }

        if (canonicalUrl && window.location.href !== canonicalUrl) {
          navigate(new URL(canonicalUrl).pathname, { replace: true });
          return;
        }

        const hasVisibleData = hasRenderableEssayData(data);

        // Some refreshes briefly return an empty payload; retry instead of flashing empties.
        if (!hasVisibleData && attempt < 5) {
          retryTimer = window.setTimeout(() => {
            loadEssay(attempt + 1);
          }, 220);
          return;
        }

        setEssay(data);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setEssay(null);
          setLoading(false);
        }
      }
    };

    loadEssay();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [shortId, slug, username, navigate]);

  const hideSelectionMenu = useCallback(() => {
    setSelectionMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const updateSelectionMenu = useCallback(() => {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      hideSelectionMenu();
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedBlocks = getShareBlocksFromRange(range, bodyRef.current);
    const selectedText = getPlainTextFromBlocks(selectedBlocks) || selection.toString().trim();
    if (!selectedText) {
      hideSelectionMenu();
      return;
    }

    if (bodyRef.current && !bodyRef.current.contains(range.commonAncestorContainer)) {
      hideSelectionMenu();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideSelectionMenu();
      return;
    }

    const menuWidth = 120;
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - menuWidth / 2, window.innerWidth - menuWidth - 16));
    const top = Math.max(64, Math.min(rect.top - 52, window.innerHeight - 80));

    setSelectionMenu({
      visible: true,
      left,
      top,
      selectedText,
      selectedBlocks,
    });
  }, [hideSelectionMenu]);

  useEffect(() => {
    if (loading || !essay) return undefined;

    const onMouseUp = () => updateSelectionMenu();
    const onKeyUp = () => updateSelectionMenu();
    const onSelectionChange = () => {
      const sel = window.getSelection?.();
      if ((!sel || sel.isCollapsed) && selectionActionPressRef.current) {
        selectionActionPressRef.current = false;
        return;
      }
      if (!sel || sel.isCollapsed) hideSelectionMenu();
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('scroll', hideSelectionMenu, true);
    window.addEventListener('resize', hideSelectionMenu);

    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', hideSelectionMenu, true);
      window.removeEventListener('resize', hideSelectionMenu);
    };
  }, [essay, hideSelectionMenu, loading, updateSelectionMenu]);

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

  const handleShareSelection = useCallback(async () => {
    selectionActionPressRef.current = false;
    const quote = (selectionMenu.selectedText || '').trim();
    if (!quote || !essay) return;
    const payload = {
      quote,
      blocks: selectionMenu.selectedBlocks,
      title: essay.title || 'Diless',
      author: essay.authorName || '',
      locale: 'es-AR',
    };
    hideSelectionMenu();

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
  }, [essay, hideSelectionMenu, selectionMenu.selectedBlocks, selectionMenu.selectedText]);

  const preserveSelectionDuringAction = useCallback((e) => {
    selectionActionPressRef.current = true;
    e.preventDefault();
  }, []);

  if (loading) {
    return <GlobalLoader />;
  }

  if (essay && !hasRenderableEssayData(essay)) {
    return <GlobalLoader />;
  }

  if (!essay) {
    return (
      <div className={styles.centered}>
        <div className={styles.notFound}>
          <h1>Not Found</h1>
          <p>This post may have been unpublished or doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  const currentContent = getSingleCanvasPublishedContent(essay.pages, essay.publishedTabs);

  return (
    <div className={styles.page}>
      <div className={styles.navbarWrap}>
        <Navbar
          variant="homepage"
          showOnlyBrand
          logoTo="/"
        />
      </div>

      <article className={styles.article}>
        <header className={styles.header}>
          <h1 className={styles.title}>{essay.title}</h1>
          {essay.subtitle && (
            <p className={styles.subtitle}>{essay.subtitle}</p>
          )}
          <div className={styles.meta}>
            {essay.authorName && <span>{essay.authorName}</span>}
            {essay.publishedAt && <span>{formatDate(essay.publishedAt)}</span>}
          </div>
        </header>

        <div className={styles.body} ref={bodyRef}>
          <MarkdownText value={currentContent} />
        </div>

        <footer className={styles.footer}>
          Escrito en <Link to="/">Diles</Link>
        </footer>
      </article>

      {selectionMenu.visible && !mobileSelectionUi && (
        <div
          className={styles.selectionMenu}
          style={{ left: `${selectionMenu.left}px`, top: `${selectionMenu.top}px` }}
          role="dialog"
          aria-label="Acciones de selección"
        >
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
          aria-label="Acciones de selección"
        >
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

    </div>
  );
}
