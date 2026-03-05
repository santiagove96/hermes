import { memo, useEffect, useRef } from 'react';
import styles from './HighlightPopover.module.css';

const TYPE_LABELS = {
  question: 'Pregunta',
  suggestion: 'Sugerencia',
  edit: 'Edición',
  voice: 'Voz',
  weakness: 'Debilidad',
  evidence: 'Evidencia',
  wordiness: 'Verbosidad',
  factcheck: 'Verificar',
  spoken: 'Al hablar',
  intro: 'Intro',
  outro: 'Cierre',
};

export default memo(function HighlightPopover({
  highlight,
  rect,
  boundaryRect = null,
  zIndex = null,
  onDismiss,
  onAcceptEdit,
}) {
  const popoverRef = useRef(null);

  // Close on outside click or touch
  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onDismiss();
      }
    };
    // Delay to avoid immediate close from the click/tap that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('touchstart', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [onDismiss]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onDismiss]);

  if (!highlight || !rect) return null;

  // Position below the highlight, centered horizontally.
  // When boundaryRect is provided (onboarding), keep popover contained in that box.
  const fallbackTop = rect.bottom + 8;
  const fallbackLeft = rect.left + rect.width / 2;
  const estimatedWidth = 320;
  const estimatedHalf = estimatedWidth / 2;
  const estimatedHeight = 220;
  let top = fallbackTop;
  let left = fallbackLeft;

  if (boundaryRect) {
    const minTop = boundaryRect.top + 8;
    const maxBottom = boundaryRect.bottom - 8;
    const minLeft = boundaryRect.left + estimatedHalf + 8;
    const maxLeft = boundaryRect.right - estimatedHalf - 8;

    top = rect.bottom + 8;
    if (top + estimatedHeight > maxBottom) {
      top = rect.top - estimatedHeight - 8;
    }
    if (top < minTop) top = minTop;

    if (minLeft <= maxLeft) {
      left = Math.max(minLeft, Math.min(fallbackLeft, maxLeft));
    } else {
      left = boundaryRect.left + boundaryRect.width / 2;
    }
  }

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ top, left, zIndex: zIndex ?? undefined }}
    >
      <div className={`${styles.badge} ${styles[`badge_${highlight.type}`]}`}>
        {TYPE_LABELS[highlight.type]}
      </div>
      <div className={styles.comment}>{highlight.comment}</div>

      {(highlight.type === 'edit' || highlight.type === 'wordiness') && highlight.suggestedEdit && (
        <div className={styles.editPreview}>
          <div className={styles.editLabel}>Sugerencia de reemplazo:</div>
          <div className={styles.editText}>{highlight.suggestedEdit}</div>
        </div>
      )}

      <div className={styles.actions}>
        <button
          className={styles.acceptBtn}
          onClick={() => {
            if ((highlight.type === 'edit' || highlight.type === 'wordiness') && highlight.suggestedEdit) {
              onAcceptEdit(highlight);
              return;
            }
            onDismiss(highlight.id);
          }}
        >
          Aceptar
        </button>
        <button className={styles.dismissBtn} onClick={() => onDismiss(highlight.id)}>
          Descartar
        </button>
      </div>
    </div>
  );
});
