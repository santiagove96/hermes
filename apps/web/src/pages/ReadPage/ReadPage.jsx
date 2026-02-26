import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchPublishedEssay } from '@hermes/api';
import { getSingleCanvasPublishedContent } from '../../lib/singleCanvas';
import MarkdownText from '../../components/MarkdownText/MarkdownText';
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

export default function ReadPage() {
  const { shortId, slug } = useParams();
  const navigate = useNavigate();
  const [essay, setEssay] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shortId) return;

    let cancelled = false;
    let retryTimer;

    // Keep skeleton visible until we get a stable payload for this article.
    // This avoids flashing an empty article shell on refresh.
    setLoading(true);
    setEssay(null);

    const loadEssay = async (attempt = 0) => {
      try {
        const data = await fetchPublishedEssay(shortId);
        if (cancelled) return;

        if (!data) {
          setEssay(null);
          setLoading(false);
          return;
        }

        // Redirect to canonical URL if slug doesn't match
        if (slug !== data.slug) {
          navigate(`/read/${data.shortId}/${data.slug}`, { replace: true });
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
  }, [shortId, slug, navigate]);

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className={styles.skeleton}>
          <div className={styles.skeletonLine} style={{ width: '60%', height: '24px' }} />
          <div className={styles.skeletonLine} style={{ width: '40%', height: '14px' }} />
          <div className={styles.skeletonLine} style={{ width: '100%', height: '14px' }} />
          <div className={styles.skeletonLine} style={{ width: '90%', height: '14px' }} />
          <div className={styles.skeletonLine} style={{ width: '75%', height: '14px' }} />
        </div>
      </div>
    );
  }

  if (essay && !hasRenderableEssayData(essay)) {
    return (
      <div className={styles.centered}>
        <div className={styles.skeleton}>
          <div className={styles.skeletonLine} style={{ width: '60%', height: '24px' }} />
          <div className={styles.skeletonLine} style={{ width: '40%', height: '14px' }} />
          <div className={styles.skeletonLine} style={{ width: '100%', height: '14px' }} />
          <div className={styles.skeletonLine} style={{ width: '90%', height: '14px' }} />
          <div className={styles.skeletonLine} style={{ width: '75%', height: '14px' }} />
        </div>
      </div>
    );
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

        <div className={styles.body}>
          <MarkdownText value={currentContent} />
        </div>

        <footer className={styles.footer}>
          Written with <a href="https://diless.vercel.app" target="_blank" rel="noopener noreferrer">Diless</a>
        </footer>
      </article>
    </div>
  );
}
