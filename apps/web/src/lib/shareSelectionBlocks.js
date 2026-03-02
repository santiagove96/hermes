function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function pushParagraphFromNode(blocks, node) {
  const text = collapseWhitespace(node?.textContent || '');
  if (text) blocks.push({ type: 'paragraph', text });
}

function serializeDomChildren(container, blocks) {
  Array.from(container.childNodes || []).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = collapseWhitespace(child.textContent || '');
      if (text) blocks.push({ type: 'paragraph', text });
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const tag = child.tagName.toLowerCase();

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      const text = collapseWhitespace(child.textContent || '');
      if (text) blocks.push({ type: 'heading', text });
      return;
    }

    if (tag === 'p') {
      pushParagraphFromNode(blocks, child);
      return;
    }

    if (tag === 'blockquote') {
      const text = collapseWhitespace(child.textContent || '');
      if (text) blocks.push({ type: 'quote', text });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(child.children || [])
        .filter((item) => item.tagName?.toLowerCase() === 'li')
        .map((item) => collapseWhitespace(item.textContent || ''))
        .filter(Boolean);
      if (items.length) {
        blocks.push({ type: tag === 'ol' ? 'ordered-list' : 'bullet-list', items });
      }
      return;
    }

    if (tag === 'li') {
      const text = collapseWhitespace(child.textContent || '');
      if (text) blocks.push({ type: 'bullet-list', items: [text] });
      return;
    }

    serializeDomChildren(child, blocks);
  });
}

export function getShareBlocksFromRange(range, rootElement) {
  if (!range) return [];
  if (rootElement && !rootElement.contains(range.commonAncestorContainer)) return [];

  const fragment = range.cloneContents();
  const container = document.createElement('div');
  container.appendChild(fragment);

  const blocks = [];
  serializeDomChildren(container, blocks);
  return blocks;
}

function extractTextFromNode(node) {
  if (!node) return '';
  if (node.type.name === 'text') return node.text || '';
  if (Array.isArray(node.content?.content)) {
    return node.content.content.map(extractTextFromNode).join('');
  }
  return '';
}

function extractListItems(node) {
  if (!Array.isArray(node.content?.content)) return [];
  return node.content.content
    .map((item) => collapseWhitespace(extractTextFromNode(item)))
    .filter(Boolean);
}

function serializePmNode(node, blocks) {
  if (!node) return;

  switch (node.type.name) {
    case 'heading': {
      const text = collapseWhitespace(extractTextFromNode(node));
      if (text) blocks.push({ type: 'heading', text });
      return;
    }
    case 'paragraph': {
      const text = collapseWhitespace(extractTextFromNode(node));
      if (text) blocks.push({ type: 'paragraph', text });
      return;
    }
    case 'blockquote': {
      const text = collapseWhitespace(extractTextFromNode(node));
      if (text) blocks.push({ type: 'quote', text });
      return;
    }
    case 'bulletList': {
      const items = extractListItems(node);
      if (items.length) blocks.push({ type: 'bullet-list', items });
      return;
    }
    case 'orderedList': {
      const items = extractListItems(node);
      if (items.length) blocks.push({ type: 'ordered-list', items });
      return;
    }
    default:
      if (Array.isArray(node.content?.content)) {
        node.content.content.forEach((child) => serializePmNode(child, blocks));
      }
  }
}

export function getShareBlocksFromEditorSelection(editor) {
  if (!editor?.state?.selection) return [];
  const slice = editor.state.selection.content();
  const blocks = [];
  slice.content.forEach((node) => serializePmNode(node, blocks));
  return blocks;
}

export function getPlainTextFromBlocks(blocks) {
  return (blocks || [])
    .flatMap((block) => {
      if (block.type === 'bullet-list' || block.type === 'ordered-list') return block.items || [];
      return block.text ? [block.text] : [];
    })
    .join(' ')
    .trim();
}
