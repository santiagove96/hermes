import { generateShareStoryImage } from './shareStoryImage';

function isMobileLikeDevice() {
  const ua = navigator.userAgent || '';
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
  return /android|iphone|ipad|ipod/i.test(ua) || !!coarsePointer;
}

export async function shareSelectionStory(payload) {
  const { blob, file, previewUrl } = await generateShareStoryImage(payload);

  try {
    const mobileLike = isMobileLikeDevice();
    if (mobileLike && navigator?.share) {
      const shareData = {
        title: payload?.title || 'Diless',
        text: 'Compartido desde Diless',
      };

      if (navigator?.canShare) {
        try {
          if (navigator.canShare({ files: [file] })) {
            shareData.files = [file];
          }
        } catch {
          // Ignore canShare check errors
        }
      }

      await navigator.share(shareData);
      return { mode: 'shared' };
    }

    if (navigator?.clipboard?.write && window?.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ]);
      return { mode: 'copied-image' };
    }

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload?.quote || '');
      return { mode: 'copied-text' };
    }

    throw new Error('Tu navegador no soporta compartir ni copiar imagen.');
  } finally {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }
}

