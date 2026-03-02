const GOOGLE_ROBOTO_SERIF_URL =
  'https://fonts.googleapis.com/css2?family=Roboto+Serif:opsz,GRAD,wdth,wght@8..144,-50..100,50..150,100..900&display=swap';

const dataUrlCache = new Map();

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fetchAsDataUrl(url, mimeType) {
  const cacheKey = `${mimeType}:${url}`;
  const cached = dataUrlCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo cargar el recurso ${url}`);
  }

  const dataUrl = `data:${mimeType};base64,${bufferToBase64(await response.arrayBuffer())}`;
  dataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
}

async function loadRobotoSerifVariableDataUrl(sampleText) {
  const uniqueText = Array.from(new Set(String(sampleText || 'Diles').trim() || 'Diles')).join('');
  const cssUrl = `${GOOGLE_ROBOTO_SERIF_URL}&text=${encodeURIComponent(uniqueText)}`;
  const cssResponse = await fetch(cssUrl);
  if (!cssResponse.ok) {
    throw new Error('No se pudo cargar Roboto Serif variable');
  }

  const cssText = await cssResponse.text();
  const fontUrlMatch = cssText.match(/url\(([^)]+)\)\s+format\(['"]woff2['"]\)/i);
  const fontUrl = fontUrlMatch?.[1]?.replace(/['"]/g, '');
  if (!fontUrl) {
    throw new Error('No se encontró el archivo WOFF2 de Roboto Serif');
  }

  return fetchAsDataUrl(fontUrl, 'font/woff2');
}

function createMeasurementStyle(fontDataUrl) {
  const style = document.createElement('style');
  style.setAttribute('data-diless-share-fonts', 'true');
  style.textContent = `
    @font-face {
      font-family: 'Diless Share Serif';
      src: url('${fontDataUrl}') format('woff2');
      font-style: normal;
      font-weight: 100 900;
      font-display: block;
    }
  `;
  return style;
}

function createMeasureElement() {
  const node = document.createElement('span');
  Object.assign(node.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    whiteSpace: 'nowrap',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  document.body.appendChild(node);
  return node;
}

function wrapTextWithElement(measureNode, text, maxWidth) {
  const tokens = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  if (!tokens.length) return [];

  const lines = [];
  let current = '';

  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    measureNode.textContent = candidate;
    if (measureNode.getBoundingClientRect().width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = token;
  }

  if (current) lines.push(current);
  return lines;
}

function wrapTextWithCanvas(ctx, text, maxWidth) {
  const tokens = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  if (!tokens.length) return [];

  const lines = [];
  let current = '';

  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = token;
  }

  if (current) lines.push(current);
  return lines;
}

function waitForImageLoad(image, src) {
  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('No se pudo renderizar la imagen SVG'));
    image.src = src;
  });
}

function truncateCanvasLineWithEllipsis(ctx, text, maxWidth) {
  const source = String(text || '');
  if (!source) return '…';
  const base = source.endsWith('…') ? source.slice(0, -1) : source;
  const target = `${base}…`;
  if (ctx.measureText(target).width <= maxWidth) return target;

  let value = base;
  while (value && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1).trimEnd();
  }
  return value ? `${value}…` : '…';
}

function truncateMeasuredLineWithEllipsis(measureNode, text, maxWidth) {
  const source = String(text || '');
  if (!source) return '…';
  const base = source.endsWith('…') ? source.slice(0, -1) : source;
  const target = `${base}…`;

  measureNode.textContent = target;
  if (measureNode.getBoundingClientRect().width <= maxWidth) return target;

  let value = base;
  while (value) {
    measureNode.textContent = `${value}…`;
    if (measureNode.getBoundingClientRect().width <= maxWidth) break;
    value = value.slice(0, -1).trimEnd();
  }

  return value ? `${value}…` : '…';
}

function normalizeShareBlocks(blocks, fallbackQuote) {
  if (Array.isArray(blocks) && blocks.length) {
    return blocks
      .map((block) => {
        if (!block || !block.type) return null;
        if (block.type === 'bullet-list' || block.type === 'ordered-list') {
          const items = Array.isArray(block.items)
            ? block.items.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
          return items.length ? { type: block.type, items } : null;
        }

        const text = String(block.text || '').trim();
        return text ? { type: block.type, text } : null;
      })
      .filter(Boolean);
  }

  const text = String(fallbackQuote || '').trim();
  return text ? [{ type: 'paragraph', text }] : [];
}

function buildContentLayout({
  blocks,
  measureNode,
  paragraphCtx,
}) {
  const blockGap = 40;
  const layouts = [];
  let currentY = 0;

  for (const block of blocks) {
    if (block.type === 'heading') {
      Object.assign(measureNode.style, {
        fontFamily: "'Diless Share Serif', 'Roboto Serif', Georgia, serif",
        fontSize: '64px',
        lineHeight: '72px',
        letterSpacing: '-1px',
        fontWeight: '560',
        fontVariationSettings: '"GRAD" -40, "wdth" 54, "opsz" 88',
        fontOpticalSizing: 'none',
      });
      const lines = wrapTextWithElement(measureNode, block.text, 936);
      if (lines.length) {
        const widths = lines.map((line) => {
          measureNode.textContent = line;
          return measureNode.getBoundingClientRect().width;
        });
        layouts.push({
          type: 'heading',
          lines,
          widths,
          y: currentY,
        });
        currentY += lines.length * 72 + blockGap;
      }
      continue;
    }

    if (block.type === 'quote') {
      const lines = wrapTextWithCanvas(paragraphCtx, block.text, 888);
      if (lines.length) {
        layouts.push({
          type: 'quote',
          lines,
          widths: lines.map((line) => paragraphCtx.measureText(line).width),
          y: currentY,
        });
        currentY += lines.length * 76 + blockGap;
      }
      continue;
    }

    if (block.type === 'bullet-list' || block.type === 'ordered-list') {
      const rows = [];
      const availableWidth = 868;
      (block.items || []).forEach((item, index) => {
        const prefix = block.type === 'ordered-list' ? `${index + 1}.` : '•';
        const firstLineWidth = availableWidth - paragraphCtx.measureText(`${prefix} `).width;
        const firstLines = wrapTextWithCanvas(paragraphCtx, item, firstLineWidth);
        if (!firstLines.length) return;
        let rowOffset = rows.length ? rows[rows.length - 1].yOffset + 76 + 8 : 0;
        firstLines.forEach((line, lineIndex) => {
          if (lineIndex === 0) {
            const prefixWidth = paragraphCtx.measureText(`${prefix} `).width;
            rows.push({
              text: line,
              prefix,
              prefixWidth,
              width: prefixWidth + paragraphCtx.measureText(line).width,
              x: 0,
              yOffset: rowOffset,
              maxTextWidth: firstLineWidth,
            });
            rowOffset += 76;
            return;
          }
          const subLines = wrapTextWithCanvas(paragraphCtx, line, availableWidth);
          subLines.forEach((subLine) => {
            rows.push({
              text: subLine,
              prefix: '',
              prefixWidth: 0,
              width: paragraphCtx.measureText(subLine).width,
              x: 52,
              yOffset: rowOffset,
              maxTextWidth: availableWidth,
            });
            rowOffset += 76;
          });
        });
      });

      if (rows.length) {
        layouts.push({
          type: block.type,
          rows,
          y: currentY,
        });
        const contentHeight = rows[rows.length - 1].yOffset + 76;
        currentY += contentHeight + blockGap;
      }
      continue;
    }

    const lines = wrapTextWithCanvas(paragraphCtx, block.text, 936);
    if (lines.length) {
      layouts.push({
        type: 'paragraph',
        lines,
        widths: lines.map((line) => paragraphCtx.measureText(line).width),
        y: currentY,
      });
      currentY += lines.length * 76 + blockGap;
    }
  }

  return {
    layouts,
    totalHeight: Math.max(0, currentY - blockGap),
  };
}

function fitContentLayoutsToHeight({
  layouts,
  maxHeight,
  measureNode,
  paragraphCtx,
}) {
  const blockGap = 40;
  const fitted = [];
  let currentY = 0;

  const pushPartialAndStop = (layout) => {
    fitted.push(layout);
      return {
        layouts: fitted,
        totalHeight: Math.max(0, currentY + (layout.renderHeight || 0)),
      };
  };

  const addEllipsisToLastVisibleLayout = () => {
    const lastLayout = fitted.at(-1);
    if (!lastLayout) {
      return {
        layouts: fitted,
        totalHeight: Math.max(0, currentY - blockGap),
      };
    }

    if (lastLayout.type === 'heading') {
      const lastIndex = lastLayout.lines.length - 1;
      lastLayout.lines[lastIndex] = truncateMeasuredLineWithEllipsis(
        measureNode,
        lastLayout.lines[lastIndex],
        936,
      );
      measureNode.textContent = lastLayout.lines[lastIndex];
      lastLayout.widths[lastIndex] = measureNode.getBoundingClientRect().width;
    } else if (lastLayout.type === 'paragraph' || lastLayout.type === 'quote') {
      const lastIndex = lastLayout.lines.length - 1;
      const maxWidth = lastLayout.type === 'quote' ? 888 : 936;
      lastLayout.lines[lastIndex] = truncateCanvasLineWithEllipsis(
        paragraphCtx,
        lastLayout.lines[lastIndex],
        maxWidth,
      );
      lastLayout.widths[lastIndex] = paragraphCtx.measureText(lastLayout.lines[lastIndex]).width;
    } else if (lastLayout.type === 'bullet-list' || lastLayout.type === 'ordered-list') {
      const lastRow = lastLayout.rows.at(-1);
      if (lastRow) {
        lastRow.text = truncateCanvasLineWithEllipsis(
          paragraphCtx,
          lastRow.text,
          lastRow.maxTextWidth,
        );
        lastRow.width = lastRow.prefixWidth + paragraphCtx.measureText(lastRow.text).width;
      }
    }

    return {
      layouts: fitted,
      totalHeight: Math.max(0, currentY - 16),
    };
  };

  for (const layout of layouts) {
    if (layout.type === 'heading') {
      const fullHeight = layout.lines.length * 72 + blockGap;
      if (currentY + fullHeight <= maxHeight) {
        fitted.push({ ...layout, y: currentY, renderHeight: layout.lines.length * 72 });
        currentY += fullHeight;
        continue;
      }

      const remaining = maxHeight - currentY;
      if (remaining <= 0) return addEllipsisToLastVisibleLayout();
      const visibleLines = Math.max(1, Math.floor(remaining / 72));
      const lines = layout.lines.slice(0, visibleLines);
      const widths = layout.widths.slice(0, visibleLines);
      if (visibleLines < layout.lines.length) {
        const lastIndex = lines.length - 1;
        lines[lastIndex] = truncateMeasuredLineWithEllipsis(measureNode, lines[lastIndex], 936);
        measureNode.textContent = lines[lastIndex];
        widths[lastIndex] = measureNode.getBoundingClientRect().width;
      }
      return pushPartialAndStop({
        type: 'heading',
        lines,
        widths,
        y: currentY,
        renderHeight: lines.length * 72,
      });
    }

    if (layout.type === 'quote' || layout.type === 'paragraph') {
      const fullHeight = layout.lines.length * 76 + blockGap;
      if (currentY + fullHeight <= maxHeight) {
        fitted.push({ ...layout, y: currentY, renderHeight: layout.lines.length * 76 });
        currentY += fullHeight;
        continue;
      }

      const remaining = maxHeight - currentY;
      if (remaining <= 0) return addEllipsisToLastVisibleLayout();
      const visibleLines = Math.max(1, Math.floor(remaining / 76));
      const lines = layout.lines.slice(0, visibleLines);
      const widths = layout.widths.slice(0, visibleLines);
      if (visibleLines < layout.lines.length) {
        const lastIndex = lines.length - 1;
        const maxWidth = layout.type === 'quote' ? 888 : 936;
        lines[lastIndex] = truncateCanvasLineWithEllipsis(paragraphCtx, lines[lastIndex], maxWidth);
        widths[lastIndex] = paragraphCtx.measureText(lines[lastIndex]).width;
      }
      return pushPartialAndStop({
        type: layout.type,
        lines,
        widths,
        y: currentY,
        renderHeight: lines.length * 76,
      });
    }

    if (layout.type === 'bullet-list' || layout.type === 'ordered-list') {
      const rows = layout.rows || [];
      const fullHeight = (rows.at(-1)?.yOffset || 0) + 76 + blockGap;
      if (currentY + fullHeight <= maxHeight) {
        fitted.push({ ...layout, y: currentY, renderHeight: (rows.at(-1)?.yOffset || 0) + 76 });
        currentY += fullHeight;
        continue;
      }

      const remaining = maxHeight - currentY;
      if (remaining <= 0) return addEllipsisToLastVisibleLayout();
      const visibleRows = rows.filter((row) => row.yOffset + 76 <= remaining);
      if (!visibleRows.length) return addEllipsisToLastVisibleLayout();

      const truncatedRows = visibleRows.map((row) => ({ ...row }));
      if (visibleRows.length < rows.length) {
        const lastIndex = truncatedRows.length - 1;
        const lastRow = truncatedRows[lastIndex];
        lastRow.text = truncateCanvasLineWithEllipsis(paragraphCtx, lastRow.text, lastRow.maxTextWidth);
        lastRow.width = lastRow.prefixWidth + paragraphCtx.measureText(lastRow.text).width;
      }

      return pushPartialAndStop({
        type: layout.type,
        rows: truncatedRows,
        y: currentY,
        renderHeight: (truncatedRows.at(-1)?.yOffset || 0) + 76,
      });
    }
  }

  return {
    layouts: fitted,
    totalHeight: Math.max(0, currentY - blockGap),
  };
}

function buildShareStorySvg({
  titleLines,
  contentLayouts,
  contentTotalHeight,
  metaParts,
  fontDataUrl,
}) {
  const bgBase = '#F5F3F0';
  const borderSubtle = 'rgba(40, 36, 31, 0.12)';
  const textPrimary = '#28241F';
  const textDim = 'rgba(40, 36, 31, 0.64)';
  const highlightColor = '#F9E4B4';

  const contentPaddingX = 72;
  const paragraphLineHeight = 76;
  const paragraphRectHeight = 60;
  const paragraphBaselineOffset = 52;
  const listIndent = 52;
  const quoteIndent = 28;

  const headerPaddingX = 72;
  const headerPaddingY = 96;
  const headerGap = 40;
  const titleLineHeight = 96;
  const metaLineHeight = 48;

  const footerPaddingX = 72;
  const footerTopPadding = 40;
  const footerBottomPadding = 328;
  const footerLineHeight = 72;

  const headerHeight =
    headerPaddingY +
    titleLines.length * titleLineHeight +
    headerGap +
    metaLineHeight +
    headerPaddingY;
  const footerHeight = footerTopPadding + footerLineHeight + footerBottomPadding;
  const contentHeight = 1920 - headerHeight - footerHeight;
  const headerTop = contentHeight;
  const footerTop = contentHeight + headerHeight;
  const contentPaddingTop = 280;
  const contentBottomPadding = 48;
  const contentBlockStartY = Math.max(
    contentPaddingTop,
    headerTop - contentBottomPadding - contentTotalHeight,
  );
  const contentMarkup = contentLayouts
    .map((layout) => {
      if (layout.type === 'heading') {
        const linesMarkup = layout.lines
          .map((line, index) => {
            const baseline = contentBlockStartY + layout.y + (index + 1) * 72;
            const rectY = baseline - 60;
            const rectWidth = Math.ceil(layout.widths[index] + 8);
            return `
              <rect x="${contentPaddingX}" y="${rectY}" width="${rectWidth}" height="64" fill="${highlightColor}" />
              <text x="${contentPaddingX}" y="${baseline}" class="contentHeading">${escapeXml(line)}</text>
            `;
          })
          .join('');
        return linesMarkup;
      }

      if (layout.type === 'quote') {
        const lineY = contentBlockStartY + layout.y;
        const quoteHeight = layout.lines.length * paragraphLineHeight;
        const quoteLines = layout.lines
          .map((line, index) => {
            const y = lineY + paragraphBaselineOffset + index * paragraphLineHeight;
            const rectY = y - paragraphBaselineOffset;
            const rectWidth = Math.ceil(layout.widths[index] + 8);
            return `
              <rect x="${contentPaddingX + quoteIndent}" y="${rectY}" width="${rectWidth}" height="${paragraphRectHeight}" fill="${highlightColor}" />
              <text x="${contentPaddingX + quoteIndent}" y="${y}" class="quote">${escapeXml(line)}</text>
            `;
          })
          .join('');
        return `
          <line x1="${contentPaddingX}" y1="${lineY + 8}" x2="${contentPaddingX}" y2="${lineY + quoteHeight - 8}" stroke="${textDim}" stroke-width="6" />
          ${quoteLines}
        `;
      }

      if (layout.type === 'bullet-list' || layout.type === 'ordered-list') {
        return (layout.rows || [])
          .map((line) => {
            const baseline =
              contentBlockStartY + layout.y + line.yOffset + paragraphBaselineOffset;
            const rectX = contentPaddingX + (line.x || 0);
            const rectY = baseline - paragraphBaselineOffset;
            const rectWidth = Math.ceil(line.width + 8);
            const prefix = line.prefix
              ? `<text x="${contentPaddingX}" y="${baseline}" class="paragraph">${escapeXml(line.prefix)}</text>`
              : '';
            const textX = contentPaddingX + listIndent;
            return `
              <rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${paragraphRectHeight}" fill="${highlightColor}" />
              ${prefix}
              <text x="${textX}" y="${baseline}" class="paragraph">${escapeXml(line.text)}</text>
            `;
          })
          .join('');
      }

      const lines = layout.lines
        .map((line, index) => {
          const baseline = contentBlockStartY + layout.y + paragraphBaselineOffset + index * paragraphLineHeight;
          const rectY = baseline - paragraphBaselineOffset;
          const rectWidth = Math.ceil(layout.widths[index] + 8);
          return `
            <rect x="${contentPaddingX}" y="${rectY}" width="${rectWidth}" height="${paragraphRectHeight}" fill="${highlightColor}" />
            <text x="${contentPaddingX}" y="${baseline}" class="paragraph">${escapeXml(line)}</text>
          `;
        })
        .join('');
      return lines;
    })
    .join('');

  const titleText = titleLines
    .map((line, index) => {
      const y = headerTop + headerPaddingY + (index + 1) * titleLineHeight;
      return `<tspan x="${headerPaddingX}" y="${y}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  const metaY = headerTop + headerPaddingY + titleLines.length * titleLineHeight + headerGap + metaLineHeight;
  const footerBaselineY = footerTop + footerTopPadding + 56;
  const metaMarkup = metaParts.author
    ? `
      <text x="${headerPaddingX}" y="${metaY}" class="meta">${escapeXml(metaParts.date)}</text>
      <text x="${headerPaddingX + metaParts.dateWidth + 4}" y="${metaY}" class="meta">·</text>
      <text x="${headerPaddingX + metaParts.dateWidth + 4 + metaParts.dotWidth + 4}" y="${metaY}" class="meta">${escapeXml(metaParts.author)}</text>
    `
    : `<text x="${headerPaddingX}" y="${metaY}" class="meta">${escapeXml(metaParts.date)}</text>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs>
        <style>
          @font-face {
            font-family: 'Diless Share Serif';
            src: url('${fontDataUrl}') format('woff2');
            font-style: normal;
            font-weight: 100 900;
          }

          .meta {
            font-family: 'SF Mono', 'Geist Mono', ui-monospace, monospace;
            font-size: 40px;
            line-height: 48px;
            font-weight: 500;
            fill: ${textDim};
            letter-spacing: 0;
          }

          .title {
            font-family: 'Diless Share Serif', 'Roboto Serif', Georgia, serif;
            font-size: 80px;
            line-height: 96px;
            font-weight: 560;
            letter-spacing: -1px;
            fill: ${textPrimary};
            font-variation-settings: "GRAD" -40, "wdth" 54, "opsz" 88;
            font-optical-sizing: none;
          }

          .paragraph {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 52px;
            line-height: 76px;
            font-weight: 400;
            fill: ${textPrimary};
          }

          .quote {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 52px;
            line-height: 76px;
            font-weight: 400;
            fill: ${textPrimary};
          }

          .contentHeading {
            font-family: 'Diless Share Serif', 'Roboto Serif', Georgia, serif;
            font-size: 64px;
            line-height: 72px;
            font-weight: 560;
            letter-spacing: -1px;
            fill: ${textPrimary};
            font-variation-settings: "GRAD" -40, "wdth" 54, "opsz" 88;
            font-optical-sizing: none;
          }

          .footer {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 40px;
            line-height: 72px;
            font-weight: 400;
            fill: ${textDim};
          }
        </style>
      </defs>

      <rect width="1080" height="1920" fill="${bgBase}" />

      ${contentMarkup}

      <text class="title">${titleText}</text>
      ${metaMarkup}

      <line x1="0" y1="${footerTop}" x2="1080" y2="${footerTop}" stroke="${borderSubtle}" stroke-width="4" />

      <text x="${footerPaddingX}" y="${footerBaselineY}" class="footer">
        <tspan>Escrito en Diles</tspan>
      </text>
    </svg>
  `.trim();
}

async function renderSvgToPngBlob(svgMarkup) {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    await waitForImageLoad(image, svgUrl);

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el canvas para compartir.');

    ctx.drawImage(image, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo generar la imagen para compartir.');
    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function generateShareStoryImage({
  quote,
  blocks,
  title,
  author = '',
  locale = 'es-AR',
}) {
  if (document?.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore and continue
    }
  }

  const titleText = String(title || 'Diles');
  const authorText = String(author || '').trim();
  const dateText = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
  })
    .format(new Date())
    .toUpperCase();
  const metaParts = {
    date: dateText,
    author: authorText ? authorText.toUpperCase() : '',
    dateWidth: 0,
    dotWidth: 0,
  };

  const fontDataUrl = await loadRobotoSerifVariableDataUrl(titleText);
  const fontStyle = createMeasurementStyle(fontDataUrl);
  document.head.appendChild(fontStyle);

  const measureNode = createMeasureElement();
  const paragraphCanvas = document.createElement('canvas');
  const paragraphCtx = paragraphCanvas.getContext('2d');
  if (!paragraphCtx) throw new Error('No se pudo medir el contenido del story');

  try {
    if (document?.fonts?.load) {
      await document.fonts.load(`560 80px "Diless Share Serif"`, titleText);
    }

    Object.assign(measureNode.style, {
      fontFamily: "'Diless Share Serif', 'Roboto Serif', Georgia, serif",
      fontSize: '80px',
      lineHeight: '96px',
      letterSpacing: '-1px',
      fontWeight: '560',
      fontVariationSettings: '"GRAD" -40, "wdth" 54, "opsz" 88',
      fontOpticalSizing: 'none',
    });

    const titleLines = wrapTextWithElement(measureNode, titleText, 936).slice(0, 3);

    Object.assign(measureNode.style, {
      fontFamily: "'SF Mono', 'Geist Mono', ui-monospace, monospace",
      fontSize: '40px',
      lineHeight: '48px',
      letterSpacing: '0px',
      fontWeight: '500',
      fontVariationSettings: 'normal',
      fontOpticalSizing: 'auto',
    });
    measureNode.textContent = metaParts.date;
    metaParts.dateWidth = measureNode.getBoundingClientRect().width;
    measureNode.textContent = '·';
    metaParts.dotWidth = measureNode.getBoundingClientRect().width;

    paragraphCtx.font = "400 52px 'Helvetica Neue', Helvetica, Arial, sans-serif";
    const contentBlocks = normalizeShareBlocks(blocks, quote);
    const contentLayouts = buildContentLayout({
      blocks: contentBlocks,
      measureNode,
      paragraphCtx,
    });
    const contentMaxHeight = 1920 - (96 + titleLines.length * 96 + 40 + 48 + 96) - (40 + 72 + 328) - 280 - 48;
    const fittedContent = fitContentLayoutsToHeight({
      layouts: contentLayouts.layouts,
      maxHeight: contentMaxHeight,
      measureNode,
      paragraphCtx,
    });

    const svgMarkup = buildShareStorySvg({
      titleLines,
      contentLayouts: fittedContent.layouts,
      contentTotalHeight: fittedContent.totalHeight,
      metaParts,
      fontDataUrl,
    });

    const blob = await renderSvgToPngBlob(svgMarkup);
    const file = new File([blob], `diless-story-${Date.now()}.png`, { type: 'image/png' });
    const previewUrl = URL.createObjectURL(blob);
    return { blob, file, previewUrl };
  } finally {
    measureNode.remove();
    fontStyle.remove();
  }
}
