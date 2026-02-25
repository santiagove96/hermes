import { useCallback, useEffect, useRef, useState } from 'react';
import posthog from 'posthog-js';
import { publishProject, unpublishProject, updatePublishSettings, generateSlug } from '@hermes/api';
import useLanguage from '../../hooks/useLanguage';
import styles from './ShareButton.module.css';

function useTimeoutRef() {
  const ref = useRef(null);
  useEffect(() => () => { if (ref.current) clearTimeout(ref.current); }, []);
  return ref;
}

const SINGLE_CANVAS_TAB = 'coral';

export default function ShareButton({
  projectId,
  projectTitle,
  getPages,
  published,
  shortId,
  slug,
  authorName: initialAuthorName,
  publishedTabs: _initialPublishedTabs,
  onPublishChange,
  isOpen,
  onOpenChange,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [authorName, setAuthorName] = useState(initialAuthorName || '');
  const [publishing, setPublishing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const wrapRef = useRef(null);
  const updatedTimerRef = useTimeoutRef();
  const copiedTimerRef = useTimeoutRef();

  // Sync external open control
  useEffect(() => {
    if (isOpen) setOpen(true);
  }, [isOpen]);

  // Sync with parent when props change
  useEffect(() => {
    setAuthorName(initialAuthorName || '');
  }, [initialAuthorName]);

  // Outside click close
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setConfirmUnpublish(false);
        onOpenChange?.(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onOpenChange]);

  // Escape key close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirmUnpublish(false);
        onOpenChange?.(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  // Single-canvas publish mode: always publish the primary canvas tab.
  const pages = getPages();
  const hasPublishableContent = !!pages[SINGLE_CANVAS_TAB]?.trim();
  const publishTabs = hasPublishableContent ? [SINGLE_CANVAS_TAB] : [];

  const handlePublish = useCallback(async () => {
    if (!projectId || publishing) return;
    setPublishing(true);
    try {
      const result = await publishProject(projectId, authorName, publishTabs);
      onPublishChange?.({
        published: true,
        shortId: result.shortId,
        slug: result.slug,
        authorName: result.authorName,
        publishedTabs: result.publishedTabs,
        publishedAt: result.publishedAt,
      });
      posthog.capture('project_published', {
        tabs_count: result.publishedTabs?.length || 0,
        has_author_name: !!authorName.trim(),
      });
    } catch (err) {
      console.error('Publish failed:', err);
    }
    setPublishing(false);
  }, [projectId, authorName, publishTabs, publishing, onPublishChange]);

  const handleUpdate = useCallback(async () => {
    if (!projectId || updating) return;
    setUpdating(true);
    try {
      const result = await publishProject(projectId, authorName, publishTabs);
      onPublishChange?.({
        published: true,
        shortId: result.shortId,
        slug: result.slug,
        authorName: result.authorName,
        publishedTabs: result.publishedTabs,
        publishedAt: result.publishedAt,
      });
      setUpdated(true);
      updatedTimerRef.current = setTimeout(() => setUpdated(false), 2000);
    } catch (err) {
      console.error('Update failed:', err);
    }
    setUpdating(false);
  }, [projectId, authorName, publishTabs, updating, onPublishChange, updatedTimerRef]);

  const handleUnpublish = useCallback(async () => {
    if (!projectId) return;
    try {
      await unpublishProject(projectId);
      onPublishChange?.({ published: false });
      setConfirmUnpublish(false);
    } catch (err) {
      console.error('Unpublish failed:', err);
    }
  }, [projectId, onPublishChange]);

  const handleAuthorBlur = useCallback(() => {
    if (published && projectId) {
      const newSlug = generateSlug(projectTitle || 'untitled');
      updatePublishSettings(projectId, { author_name: authorName, slug: newSlug }).catch((err) => console.error('Author update failed:', err));
      onPublishChange?.({ authorName, slug: newSlug });
    }
  }, [published, projectId, authorName, projectTitle, onPublishChange]);

  const readUrl = shortId && slug
    ? `${window.location.origin}/read/${shortId}/${slug}`
    : '';

  const handleCopy = useCallback(() => {
    if (!readUrl) return;
    navigator.clipboard.writeText(readUrl).then(() => {
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [readUrl, copiedTimerRef]);

  const shareIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12V14H12V12" />
      <path d="M8 10V2" />
      <path d="M5 5L8 2L11 5" />
    </svg>
  );

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={`${styles.trigger} ${published ? styles.triggerPublished : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={published ? t('shareButton.managePublishedPost') : t('shareButton.sharePost')}
      >
        {shareIcon}
      </button>

      {open && (
        <div className={styles.panel}>
          {published ? (
            <>
              <h3 className={styles.heading}>{t('shareButton.published')}</h3>

              <div className={styles.urlRow}>
                <span className={styles.urlDisplay}>{readUrl}</span>
                <button className={styles.copyBtn} onClick={handleCopy}>
                  {copied ? t('shareButton.copied') : t('shareButton.copy')}
                </button>
              </div>

              <a
                className={styles.openLink}
                href={readUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('shareButton.openInNewTab')}
              </a>

              <hr className={styles.separator} />

              <div className={styles.field}>
                <label className={styles.label}>{t('shareButton.authorName')}</label>
                <input
                  className={styles.input}
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  onBlur={handleAuthorBlur}
                  placeholder={t('shareButton.yourName')}
                />
              </div>

              <button
                className={styles.updateBtn}
                onClick={handleUpdate}
                disabled={updating}
              >
                {updating ? t('shareButton.updating') : updated ? t('shareButton.updated') : t('shareButton.updatePublishedContent')}
              </button>
              {updated && (
                <p className={styles.updateNote}>{t('shareButton.readersWillSeeLatestChanges')}</p>
              )}

              <button
                className={styles.unpublishBtn}
                onClick={() => {
                  if (confirmUnpublish) {
                    handleUnpublish();
                  } else {
                    setConfirmUnpublish(true);
                  }
                }}
              >
                {confirmUnpublish ? t('shareButton.confirmUnpublish') : t('shareButton.unpublish')}
              </button>
              {confirmUnpublish && (
                <p className={styles.warning}>{t('shareButton.linkWillStopWorkingImmediately')}</p>
              )}
            </>
          ) : (
            <>
              <h3 className={styles.heading}>{t('shareButton.sharePost')}</h3>

              <div className={styles.field}>
                <label className={styles.label}>{t('shareButton.authorName')}</label>
                <input
                  className={styles.input}
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder={t('shareButton.yourName')}
                />
              </div>

              <button
                className={styles.publishBtn}
                onClick={handlePublish}
                disabled={publishing || !hasPublishableContent}
              >
                {publishing ? t('shareButton.publishing') : t('shareButton.publish')}
              </button>
              <p className={styles.note}>{t('shareButton.anyoneWithLinkCanRead')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
