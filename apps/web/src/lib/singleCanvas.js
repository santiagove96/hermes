export const SINGLE_CANVAS_TAB = 'coral';
export const LEGACY_TAB_ORDER = ['coral', 'amber', 'sage', 'sky', 'lavender'];
const SECTION_SEPARATOR = '\n\n---\n\n';

function unique(list) {
  return [...new Set(list)];
}

function getOrderedTabList(order = LEGACY_TAB_ORDER) {
  return unique([...order, ...LEGACY_TAB_ORDER]);
}

export function mergeLegacyPagesToSingleCanvas(pages = {}, options = {}) {
  const order = getOrderedTabList(options.order);
  const parts = [];

  for (const key of order) {
    const raw = pages?.[key];
    if (typeof raw !== 'string') continue;
    const content = raw.trim();
    if (!content) continue;
    parts.push(content);
  }

  return parts.join(options.separator ?? SECTION_SEPARATOR);
}

export function normalizeLegacyPagesForSingleCanvas(pages = {}, emptyPages = {}) {
  const mergedContent = mergeLegacyPagesToSingleCanvas(pages);
  const extraTabsWithContent = LEGACY_TAB_ORDER.filter(
    (key) => key !== SINGLE_CANVAS_TAB && typeof pages?.[key] === 'string' && pages[key].trim(),
  );

  const normalized = { ...emptyPages, ...pages, [SINGLE_CANVAS_TAB]: mergedContent };
  for (const key of LEGACY_TAB_ORDER) {
    if (key !== SINGLE_CANVAS_TAB) normalized[key] = '';
  }

  return {
    pages: normalized,
    migrated: extraTabsWithContent.length > 0,
    mergedFromTabs: extraTabsWithContent,
  };
}

export function getSingleCanvasPublishedContent(pages = {}, publishedTabs = []) {
  const preferredOrder = unique([
    ...(Array.isArray(publishedTabs) ? publishedTabs : []),
    ...LEGACY_TAB_ORDER,
  ]);
  return mergeLegacyPagesToSingleCanvas(pages, { order: preferredOrder });
}

