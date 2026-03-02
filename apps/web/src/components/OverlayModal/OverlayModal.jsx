import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import styles from './OverlayModal.module.css';

export default function OverlayModal({
  open,
  onClose,
  title,
  meta,
  headerActions = null,
  children,
  footer = null,
  shellClassName = '',
  bodyClassName = '',
  footerClassName = '',
  overlayClassName = '',
  closeLabel = 'Cerrar',
}) {
  const shellRef = useRef(null);
  const closeButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement;

    const focusFirstElement = () => {
      const shell = shellRef.current;
      if (!shell) return;
      const focusable = shell.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length > 0) {
        focusable[0].focus();
        return;
      }
      closeButtonRef.current?.focus();
    };

    const frame = window.requestAnimationFrame(focusFirstElement);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const shell = shellRef.current;
      if (!shell) return;

      const focusable = Array.from(
        shell.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (restoreFocusRef.current instanceof HTMLElement) {
        restoreFocusRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`${styles.overlay} ${overlayClassName}`.trim()} onClick={onClose}>
      <div
        ref={shellRef}
        className={`${styles.shell} ${shellClassName}`.trim()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Modal'}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {title ? <div className={styles.headerTitle}>{title}</div> : null}
            {meta ? <div className={styles.headerMeta}>· {meta}</div> : null}
          </div>
          <div className={styles.headerActions}>
            {headerActions}
            <button ref={closeButtonRef} className={styles.iconBtn} onClick={onClose} aria-label={closeLabel} title={closeLabel}>
              <X size={24} weight="regular" />
            </button>
          </div>
        </div>

        <div className={`${styles.body} ${bodyClassName}`.trim()}>
          {children}
        </div>

        {footer ? (
          <div className={`${styles.footer} ${footerClassName}`.trim()}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
