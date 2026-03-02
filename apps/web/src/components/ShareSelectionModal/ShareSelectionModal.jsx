import { useCallback, useEffect, useMemo, useState } from 'react';
import OverlayModal from '../OverlayModal/OverlayModal';
import DotGridLoader from '../DotGridLoader/DotGridLoader';
import { generateShareStoryImage } from '../../lib/shareStoryImage';
import styles from './ShareSelectionModal.module.css';

export default function ShareSelectionModal({
  open,
  onClose,
  payload,
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [shareFile, setShareFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [errorText, setErrorText] = useState('');

  const canNativeFileShare = useMemo(() => {
    if (!shareFile || !navigator?.share) return false;
    if (navigator?.canShare) {
      try {
        return navigator.canShare({ files: [shareFile] });
      } catch {
        return false;
      }
    }
    return false;
  }, [shareFile]);

  useEffect(() => {
    if (!open || !payload?.quote?.trim()) return;

    let cancelled = false;
    setLoading(true);
    setErrorText('');

    generateShareStoryImage(payload)
      .then(({ file, previewUrl: url }) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setPreviewUrl(url);
        setShareFile(file);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorText(err?.message || 'No se pudo preparar la imagen.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, payload]);

  useEffect(() => {
    if (!open && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      setShareFile(null);
      setLoading(false);
      setSharing(false);
      setErrorText('');
    }
  }, [open, previewUrl]);

  const handleShare = useCallback(async (channel) => {
    if (!navigator?.share || !shareFile) {
      setErrorText('Este navegador no permite compartir imágenes todavía.');
      return;
    }

    const shareTitle = payload?.title || 'Diless';
    const shareText = channel === 'instagram'
      ? 'Comparte esta story en Instagram'
      : 'Comparte este estado en WhatsApp';

    setSharing(true);
    setErrorText('');
    try {
      if (canNativeFileShare) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          files: [shareFile],
        });
      } else {
        await navigator.share({
          title: shareTitle,
          text: `${shareTitle}\n\n${payload?.quote || ''}`,
        });
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setErrorText('No se pudo abrir el menú de compartir.');
      }
    } finally {
      setSharing(false);
    }
  }, [canNativeFileShare, payload, shareFile]);

  if (!open) return null;

  return (
    <OverlayModal
      open={open}
      onClose={onClose}
      title="Compartir selección"
      meta="Story 9:16"
      bodyClassName={styles.body}
      closeLabel="Cerrar compartir"
      footer={(
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => handleShare('whatsapp')}
            disabled={!shareFile || sharing || loading}
          >
            WhatsApp
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => handleShare('instagram')}
            disabled={!shareFile || sharing || loading}
          >
            Instagram
          </button>
        </div>
      )}
      footerClassName={styles.footer}
    >
      <div className={styles.previewWrap}>
        {loading ? (
          <div className={styles.loaderState}>
            <DotGridLoader />
          </div>
        ) : previewUrl ? (
          <img className={styles.previewImage} src={previewUrl} alt="Preview de story 9:16" />
        ) : (
          <div className={styles.errorState}>No se pudo generar la imagen.</div>
        )}
        {errorText ? <p className={styles.errorText}>{errorText}</p> : null}
      </div>
    </OverlayModal>
  );
}

