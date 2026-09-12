(function (global) {
  'use strict';

  let pdfjsPromise;
  function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import('./vendor/pdfjs/pdf.mjs?v=20260911-pdf2').then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', document.baseURI).href;
        return pdfjs;
      });
    }
    return pdfjsPromise;
  }

  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const headingPattern = /^(?:references?|reference\s+list|works\s+cited|bibliograph(?:y|ies)|literature\s+cited|参考文献|参考资料)[\s.:：·•0-9\-–—]*$/i;

  function cleanText(value) {
    return String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
  }

  function fontInfo(page, item, styles) {
    let font = null;
    try {
      if (page.commonObjs && page.commonObjs.has(item.fontName)) font = page.commonObjs.get(item.fontName);
    } catch (_) {}
    const names = [font?.name, font?.loadedName, font?.fallbackName, styles?.[item.fontName]?.fontFamily].filter(Boolean).join(' ');
    return {
      italic: font ? !!font.italic : /(?:italic|oblique)/i.test(names),
      bold: font ? !!font.bold : /(?:bold|semibold|demibold)/i.test(names),
      fontName: font?.name || styles?.[item.fontName]?.fontFamily || item.fontName || ''
    };
  }

  function makeLine(pageNumber, pageLabel, pageWidth, pageHeight, seed) {
    return {
      page: pageNumber,
      pageLabel,
      pageWidth,
      pageHeight,
      y: seed.y,
      height: seed.height,
      lastX: seed.x,
      lastEndX: seed.x,
      text: '',
      html: '',
      italics: [],
      bolds: [],
      sourceSpans: []
    };
  }

  function appendItem(line, token) {
    const previous = line.text.slice(-1);
    const incoming = token.text.charAt(0);
    const gap = token.x - line.lastEndX;
    const em = Math.max(1, token.height || line.height || 10);
    const needsSpace = line.text && !/\s/.test(previous) && !/\s/.test(incoming) && gap > em * 0.16;
    if (needsSpace) {
      line.text += ' ';
      line.html += ' ';
    }
    const start = line.text.length;
    line.text += token.text;
    let html = esc(token.text);
    if (token.bold) html = '<strong>' + html + '</strong>';
    if (token.italic) html = '<em>' + html + '</em>';
    line.html += html;
    const end = line.text.length;
    if (token.italic) line.italics.push([start, end]);
    if (token.bold) line.bolds.push([start, end]);
    line.sourceSpans.push({
      start,
      end,
      page: token.page,
      pageLabel: token.pageLabel,
      x: token.x,
      y: token.y - token.height * 0.24,
      width: Math.max(token.width, token.height * 0.12),
      height: Math.max(token.height, 1)
    });
    line.lastX = token.x;
    line.lastEndX = token.x + token.width;
    line.height = Math.max(line.height, token.height);
  }

  function pageLines(page, pageNumber, pageLabel, textContent) {
    const viewport = page.getViewport({ scale: 1 });
    const lines = [];
    let current = null;
    const flush = () => {
      if (!current) return;
      current.text = current.text.trim();
      current.html = current.html.trim();
      if (current.text) lines.push(current);
      current = null;
    };
    for (const item of textContent.items || []) {
      if (!item || typeof item.str !== 'string') continue;
      const text = item.str.replace(/\s+/g, ' ');
      if (!text.trim()) {
        if (item.hasEOL) flush();
        continue;
      }
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      const x = Number(transform[4]) || 0;
      const y = Number(transform[5]) || 0;
      const height = Math.max(1, Number(item.height) || Math.hypot(Number(transform[2]) || 0, Number(transform[3]) || 0) || 10);
      const width = Math.max(0, Number(item.width) || 0);
      const style = fontInfo(page, item, textContent.styles || {});
      const token = { text, x, y, height, width, page: pageNumber, pageLabel, ...style };
      const sameLine = current && Math.abs(current.y - y) <= Math.max(2, Math.min(current.height, height) * 0.38) && x >= current.lastX - Math.max(current.height, height);
      if (!sameLine) {
        flush();
        current = makeLine(pageNumber, pageLabel, viewport.width, viewport.height, token);
      }
      appendItem(current, token);
      if (item.hasEOL) flush();
    }
    flush();
    return lines;
  }

  function stripRepeatedMargins(pages) {
    const occurrences = new Map();
    const normalized = line => cleanText(line.text).toLowerCase().replace(/\d+/g, '#');
    for (const lines of pages) {
      const seen = new Set();
      for (const line of lines) {
        const inMargin = line.y > line.pageHeight * 0.91 || line.y < line.pageHeight * 0.09;
        if (!inMargin) continue;
        const key = normalized(line);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        occurrences.set(key, (occurrences.get(key) || 0) + 1);
      }
    }
    const threshold = Math.max(2, Math.ceil(pages.length * 0.4));
    return pages.map(lines => lines.filter(line => {
      const inMargin = line.y > line.pageHeight * 0.91 || line.y < line.pageHeight * 0.09;
      if (!inMargin) return true;
      if (/^\s*(?:[ivxlcdm]+|\d+)\s*$/i.test(line.text)) return false;
      return (occurrences.get(normalized(line)) || 0) < threshold;
    }));
  }

  function combineLines(lines) {
    let text = '', html = '';
    const italics = [], bolds = [], sourceSpans = [];
    for (const line of lines) {
      if (!line?.text) continue;
      const separator = text && !/[-‐‑‒–—/]$/.test(text) ? ' ' : '';
      if (separator) { text += separator; html += separator; }
      const base = text.length;
      text += line.text;
      html += line.html;
      for (const [start, end] of line.italics || []) italics.push([start + base, end + base]);
      for (const [start, end] of line.bolds || []) bolds.push([start + base, end + base]);
      for (const span of line.sourceSpans || []) sourceSpans.push({ ...span, start: span.start + base, end: span.end + base });
    }
    const pages = [...new Set(sourceSpans.map(span => span.page))];
    return {
      text,
      rawText: text,
      html,
      italics,
      bolds,
      page: pages[0] || null,
      pageEnd: pages[pages.length - 1] || pages[0] || null,
      pages,
      sourceSpans
    };
  }

  function documentFromLines(lines, pageCount, pageLabels) {
    let headingIndex = -1;
    for (let index = lines.length - 1; index >= 0; index--) {
      if (headingPattern.test(cleanText(lines[index].text))) { headingIndex = index; break; }
    }
    const bodyLines = headingIndex >= 0 ? lines.slice(0, headingIndex) : [];
    const referenceLines = headingIndex >= 0 ? lines.slice(headingIndex + 1) : lines;
    const grouped = global.CitationReferenceSplitter?.groupReferenceLines(referenceLines, line => line?.text) || referenceLines.map(line => [line]);
    const bodyBlocks = bodyLines.map(line => combineLines([line]));
    const referenceBlocks = grouped.map(combineLines).filter(block => block.text);
    const body = bodyBlocks.map(block => block.text).join('\n');
    const references = referenceBlocks.map(block => block.text).join('\n\n');
    return {
      body,
      references,
      text: headingIndex >= 0 ? body + '\n\nReferences\n' + references : references,
      bodyBlocks,
      referenceBlocks,
      hasPageInfo: true,
      pageCount,
      pageLabels,
      styleInfoAvailable: [...bodyBlocks, ...referenceBlocks].some(block => block.italics.length || block.bolds.length)
    };
  }

  async function parse(file, onProgress) {
    if (!file) throw new Error('没有选择 PDF 文件');
    if (!/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') throw new Error('请选择 .pdf 文件');
    const pdfjs = await loadPdfJs();
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data: originalBytes.slice() });
    const pdf = await loadingTask.promise;
    const pageLabels = await pdf.getPageLabels().catch(() => null);
    const pages = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.(pageNumber, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      await page.getOperatorList({ intent: 'display' });
      const textContent = await page.getTextContent();
      const lines = pageLines(page, pageNumber, pageLabels?.[pageNumber - 1] || String(pageNumber), textContent);
      characterCount += lines.reduce((sum, line) => sum + line.text.length, 0);
      pages.push(lines);
      page.cleanup();
    }
    if (characterCount < 20) {
      await loadingTask.destroy();
      throw new Error('未读取到可用文字。请确认 PDF 是由 Word 导出且未设置禁止读取或加密限制。');
    }
    const usefulLines = stripRepeatedMargins(pages).flat();
    const result = documentFromLines(usefulLines, pdf.numPages, pageLabels);
    result.pdfBytes = originalBytes;
    result.sourceType = 'pdf';
    await loadingTask.destroy();
    return result;
  }

  function createViewer(container) {
    let pdf = null, loadingTask = null, pdfjs = null, pageNumber = 1, zoom = 1, labels = null, selectedAnchor = null, renderSerial = 0;
    container.innerHTML = '<div class="pdf-source-toolbar"><button type="button" data-pdf-action="prev" aria-label="上一页">‹</button><span>第 <b data-pdf-current>1</b> / <b data-pdf-total>1</b> 页</span><button type="button" data-pdf-action="next" aria-label="下一页">›</button><span class="pdf-toolbar-gap"></span><button type="button" data-pdf-action="out" aria-label="缩小">−</button><span data-pdf-zoom>100%</span><button type="button" data-pdf-action="in" aria-label="放大">＋</button></div><div class="pdf-page-stage"><div class="pdf-page-surface"><canvas></canvas><div class="pdf-text-layer textLayer"></div><div class="pdf-highlight-layer"></div></div></div>';
    const currentEl = container.querySelector('[data-pdf-current]');
    const totalEl = container.querySelector('[data-pdf-total]');
    const zoomEl = container.querySelector('[data-pdf-zoom]');
    const stage = container.querySelector('.pdf-page-stage');
    const surface = container.querySelector('.pdf-page-surface');
    const canvas = container.querySelector('canvas');
    const textLayer = container.querySelector('.pdf-text-layer');
    const highlightLayer = container.querySelector('.pdf-highlight-layer');

    function labelFor(number) {
      const label = labels?.[number - 1];
      return label && label !== String(number) ? number + '（' + label + '）' : String(number);
    }

    async function render() {
      if (!pdf) return;
      const serial = ++renderSerial;
      const page = await pdf.getPage(pageNumber);
      const available = Math.max(320, stage.clientWidth - 28);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1.6, available / base.width) * zoom;
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      surface.style.width = viewport.width + 'px';
      surface.style.height = viewport.height + 'px';
      surface.style.setProperty('--total-scale-factor', String(scale));
      const context = canvas.getContext('2d', { alpha: false });
      await page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise;
      if (serial !== renderSerial) return;
      textLayer.replaceChildren();
      const content = await page.getTextContent();
      const layer = new pdfjs.TextLayer({ textContentSource: content, container: textLayer, viewport });
      await layer.render();
      if (serial !== renderSerial) return;
      highlightLayer.replaceChildren();
      highlightLayer.style.width = viewport.width + 'px';
      highlightLayer.style.height = viewport.height + 'px';
      const spans = (selectedAnchor?.sourceSpans || []).filter(span => span.page === pageNumber);
      for (const span of spans) {
        const p1 = viewport.convertToViewportPoint(span.x, span.y);
        const p2 = viewport.convertToViewportPoint(span.x + span.width, span.y + span.height);
        const rect = [p1[0], p1[1], p2[0], p2[1]];
        const marker = document.createElement('span');
        marker.className = 'pdf-source-highlight';
        marker.style.left = Math.min(rect[0], rect[2]) + 'px';
        marker.style.top = Math.min(rect[1], rect[3]) + 'px';
        marker.style.width = Math.max(3, Math.abs(rect[2] - rect[0])) + 'px';
        marker.style.height = Math.max(3, Math.abs(rect[3] - rect[1])) + 'px';
        highlightLayer.appendChild(marker);
      }
      currentEl.textContent = labelFor(pageNumber);
      totalEl.textContent = pdf.numPages;
      zoomEl.textContent = Math.round(zoom * 100) + '%';
    }

    async function load(bytes, pageLabels) {
      if (!bytes?.byteLength) return;
      if (loadingTask) await loadingTask.destroy();
      pdfjs = await loadPdfJs();
      labels = pageLabels || null;
      pageNumber = selectedAnchor?.page || selectedAnchor?.sourceSpans?.[0]?.page || 1;
      zoom = 1;
      loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes).slice() });
      pdf = await loadingTask.promise;
      pageNumber = Math.max(1, Math.min(pdf.numPages, pageNumber));
      totalEl.textContent = pdf.numPages;
      await render();
    }

    async function locate(anchor) {
      if (!anchor) return;
      selectedAnchor = anchor;
      if (!pdf) return;
      const target = anchor.page || anchor.sourceSpans?.[0]?.page || 1;
      pageNumber = Math.max(1, Math.min(pdf.numPages, target));
      await render();
      stage.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    container.addEventListener('click', event => {
      const action = event.target.closest('[data-pdf-action]')?.dataset.pdfAction;
      if (!action || !pdf) return;
      if (action === 'prev') pageNumber = Math.max(1, pageNumber - 1);
      if (action === 'next') pageNumber = Math.min(pdf.numPages, pageNumber + 1);
      if (action === 'out') zoom = Math.max(0.6, zoom - 0.15);
      if (action === 'in') zoom = Math.min(2.5, zoom + 0.15);
      render();
    });

    async function destroy() {
      renderSerial++;
      if (loadingTask) await loadingTask.destroy();
      pdf = null;
      loadingTask = null;
      selectedAnchor = null;
      canvas.width = canvas.height = 0;
      textLayer.replaceChildren();
      highlightLayer.replaceChildren();
    }

    return { load, locate, render, destroy, get pageNumber() { return pageNumber; } };
  }

  global.CitationPdfImporter = Object.freeze({ parse, createViewer, loadPdfJs });
})(window);
