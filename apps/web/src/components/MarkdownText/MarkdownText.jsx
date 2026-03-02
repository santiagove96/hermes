import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownText.module.css';

function remarkManualHighlight() {
  const splitTextToHighlightNodes = (text) => {
    const parts = [];
    const regex = /==([\s\S]+?)==/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const full = match[0];
      const inner = match[1];
      const start = match.index;
      const end = start + full.length;

      if (start > lastIndex) {
        parts.push({ type: 'text', value: text.slice(lastIndex, start) });
      }

      parts.push({
        type: 'strong',
        data: { hName: 'mark' },
        children: [{ type: 'text', value: inner }],
      });

      lastIndex = end;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIndex) });
    }

    return parts.length ? parts : [{ type: 'text', value: text }];
  };

  const visitNode = (node) => {
    if (!node || !Array.isArray(node.children)) return;

    const nextChildren = [];
    for (const child of node.children) {
      if (!child) continue;

      if (child.type === 'text') {
        const replaced = splitTextToHighlightNodes(child.value || '');
        nextChildren.push(...replaced);
        continue;
      }

      const skipNested =
        child.type === 'inlineCode' ||
        child.type === 'code' ||
        child.type === 'html' ||
        child.type === 'link';

      if (!skipNested) visitNode(child);
      nextChildren.push(child);
    }
    node.children = nextChildren;
  };

  return (tree) => {
    visitNode(tree);
  };
}

const REMARK_PLUGINS = [remarkGfm, remarkManualHighlight];

const inlineComponents = {
  p: ({ children }) => <>{children}</>,
  h1: ({ children }) => <>{children}</>,
  h2: ({ children }) => <>{children}</>,
  h3: ({ children }) => <>{children}</>,
  h4: ({ children }) => <>{children}</>,
  h5: ({ children }) => <>{children}</>,
  h6: ({ children }) => <>{children}</>,
  ul: ({ children }) => <>{children}</>,
  ol: ({ children }) => <>{children}</>,
  li: ({ children }) => <><span>{children}</span>{' '}</>,
  blockquote: ({ children }) => <>{children}</>,
  pre: ({ children }) => <>{children}</>,
  hr: () => <span>{' '}</span>,
};

export default memo(function MarkdownText({ value, inline = false, className = '' }) {
  if (!value) return null;

  return (
    <div className={`${styles.markdown} ${inline ? styles.inline : styles.block} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={inline ? inlineComponents : undefined}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
});
