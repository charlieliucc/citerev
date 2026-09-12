// ==================================================================
  // 富文本编辑器 / 斜体检测（参考文献）
  // ==================================================================
  const editor = document.getElementById('editor');

  function isItalicElement(el){
    if(!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = el.tagName && el.tagName.toLowerCase();
    return tag === 'i' || tag === 'em';
  }
  function isItalicNode(node){
    let cur = node && node.nodeType === Node.ELEMENT_NODE ? node : (node && node.parentElement);
    while(cur && cur !== editor){
      if(isItalicElement(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  }
  function isBoldNode(node){
    let cur = node && node.nodeType === Node.ELEMENT_NODE ? node : (node && node.parentElement);
    while(cur && cur !== editor){
      const tag = cur.tagName && cur.tagName.toLowerCase();
      if(tag === 'b' || tag === 'strong') return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function mergeRanges(ranges){
    const sorted = (ranges || []).slice().sort((a,b) => a[0]-b[0]);
    const out = [];
    for(const r of sorted){
      if(out.length === 0){ out.push(r); continue; }
      const last = out[out.length-1];
      if(r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else out.push(r);
    }
    return out;
  }

  function ensureLineStructure(){
    if(editor.childNodes.length === 0) return;
    const hasBlock = Array.from(editor.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE && ['div','p'].includes((n.tagName||'').toLowerCase()));
    if(hasBlock) return;
    const raw = editor.innerHTML;
    const temp = document.createElement('div');
    temp.innerHTML = raw.replace(/<br\s*\/?\s*>/gi, '\n');
    const text = temp.textContent || '';
    const lines = text.split(/\r?\n/);
    editor.innerHTML = '';
    for(const line of lines){
      const div = document.createElement('div');
      div.textContent = line;
      editor.appendChild(div);
    }
  }

  function extractLineInfo(lineEl){
    const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, null);
    let raw = '';
    const italicAt = [];
    const boldAt = [];
    while(walker.nextNode()){
      const node = walker.currentNode;
      const nt = node.nodeValue || '';
      for(const ch of nt){
        raw += ch;
        italicAt.push(isItalicNode(node));
        boldAt.push(isBoldNode(node));
      }
    }
    const mapped = [];
    for(let i=0;i<raw.length;i++){
      let ch = raw[i];
      const space = /\s/.test(ch);
      if(ch === ' ') ch = ' ';
      mapped.push({ ch, italic: italicAt[i], bold: boldAt[i], space });
    }
    let start = 0, end = mapped.length;
    while(start < end && mapped[start].space) start++;
    while(end > start && mapped[end-1].space) end--;
    const seg = mapped.slice(start, end);

    let text = '';
    const italics = [];
    const bolds = [];
    for(let i=0;i<seg.length;i++){
      const m = seg[i];
      const pos = text.length;
      text += m.ch;
      if(m.italic) italics.push([pos, pos+1]);
      if(m.bold) bolds.push([pos, pos+1]);
    }
    return {
      html: sanitizeEditorHtml(lineEl.innerHTML),
      text,
      rawText: text,
      italics: mergeRanges(italics),
      bolds: mergeRanges(bolds),
      page: (lineEl.dataset && lineEl.dataset.page) ? parseInt(lineEl.dataset.page, 10) : null
    };
  }

  function getReferenceBlocks(){
    ensureLineStructure();
    const blocks = Array.from(editor.children)
      .filter(el => el.tagName && ['div','p'].includes(el.tagName.toLowerCase()));
    const infos = blocks.map(extractLineInfo);
    const groups = window.CitationReferenceSplitter.groupReferenceLines(infos, info => info.text);

    const result = groups.map(g => {
      let text = '';
      const italics = [];
      const bolds = [];
      for(const info of g){
        if(text.length > 0) text += ' ';
        const base = text.length;
        text += info.text;
        for(const [s,e] of (info.italics||[])) italics.push([s+base, e+base]);
        for(const [s,e] of (info.bolds||[])) bolds.push([s+base, e+base]);
      }
      return {
        text,
        rawText: text,
        italics: mergeRanges(italics),
        bolds: mergeRanges(bolds),
        html: g.map(x => x.html).join('<br>'),
        page: g[0].page || null
      };
    });
    if(currentSourceType === 'pdf' && lastReferenceSourceBlocks.length === result.length){
      result.forEach((block, index) => {
        const source = lastReferenceSourceBlocks[index];
        if(!source) return;
        block.sourceSpans = source.sourceSpans || [];
        block.pages = source.pages || [];
        block.page = source.page || block.page;
        block.pageEnd = source.pageEnd || block.page;
      });
    }
    return result;
  }


  function setEditorFromText(text){
    const lines = (text || '').replace(/\r\n/g,'\n').split('\n');
    editor.innerHTML = '';
    for(const l of lines){
      const div = document.createElement('div');
      div.textContent = l;
      editor.appendChild(div);
    }
  }
  function setEditorFromHtml(html){
    editor.innerHTML = sanitizeEditorHtml(html);
  }

// ==================================================================
  // 编辑器工具栏
  // ==================================================================
  function exec(cmd){
    editor.focus();
    try{ document.execCommand(cmd, false, null); } catch(e){ /* ignore */ }
  }
  function clearFormatting(){
    editor.focus();
    try{ document.execCommand('removeFormat', false, null); } catch(e){ /* ignore */ }
  }
  async function pastePlain(){
    editor.focus();
    let text = '';
    try{ text = await navigator.clipboard.readText(); }
    catch(e){
      alert('无法读取剪贴板（可能是浏览器权限限制）。你可以用 Cmd/Ctrl+Shift+V 粘贴纯文本。');
      return;
    }
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
    const frag = document.createDocumentFragment();
    for(const l of lines){
      const div = document.createElement('div');
      div.textContent = l;
      frag.appendChild(div);
    }
    const isEmpty = !normalizeSpace(editor.textContent || '');
    if(isEmpty) editor.innerHTML = '';
    editor.appendChild(frag);
  }

  // ==================================================================
  // 示例 / 清空
  // ==================================================================
  function fillExample(){
    const tb = document.getElementById('txtBody');
    if(tb){ tb.value = `Recent research on student engagement has emphasized the role of teacher feedback in language-learning classrooms. Smith and Lee (2021) found that oral feedback significantly increases classroom participation, a conclusion echoed by Johnson et al. (2019) in a large-scale meta-analysis. Brown and Cortazzi (2012) further argued that cultural context shapes how learners interpret such feedback, while White (2015) cautioned that self-regulation mediates these effects. In a related strand, Davis (1986) laid the foundation for cognitive models of learning that remain influential today.

Policy has also begun to respond to these findings. The Ministry of Science (2020) issued a code of conduct for graduate supervisors, and Clark (2020) reviewed broader learning transitions across institutions. van den Berg and Jansen (2016) demonstrated that self-regulation training improves outcomes, and Miller, Lewis, et al. (2014) advocated task-based approaches in language education. Taylor (2018) provided a comprehensive case-study framework still widely used. Nevertheless, one recent synthesis (Green, 2022) remains underexplored in current debates.\n`;
    }

    setEditorFromHtml(`
<div>Davis, R. M. (1986). THE ARCHITECTURE OF LEARNING. Example University Press. https://doi.org/10.0000/example1986</div>
<div>Brown, L., &amp; Cortazzi, M. (2012). Researching learners. Palgrave.</div>
<div>Clark, P. (2020). Learning transitions reviewed. Sample Energy Journal, 5(12), 1040-1045.</div>
<div>Johnson, A. C., Green, L., Patel, S., Kim, H., Wong, Y., &amp; Cooper, D. (2021). A meta-analysis on feedback and academic motivation. Educational Psychology Review, 41(7), 922-947. https://doi.org/10.1080/example.2019.0000000</div>
<div>Miller, P., Lewis, T., &amp; Moore, K. (2014). Task-based approaches in language education. Language Education Review, 47(4), 1-12.</div>
<div>Ministry of Science. (2020, November 11). Code of conduct for graduate supervisors. http://www.example-ministry.gov.xx/policy/2020/supervisors</div>
<div>Smith, A., &amp; Lee, M. (2021). Student engagement and teacher feedback in EFL classrooms. Journal of Language Teaching, 3(4), 11-20. https://doi.org/10.1177/example2021</div>
<div>Taylor, R. K. (2018). Case Study Research and Applications. Example Publishing.</div>
<div>van den Berg, R., &amp; Jansen, M. (2016). Self-regulation in learning. Educational Psychology Review, 12(3), 200-215.</div>
<div>White, J. (2015). Emotion and self-regulation. Example Publishing.</div>
`.replace(/<\/div>\n/g, '</div><div><br></div>\n').trim());
  }

  function updateFileNameBadge(name){
    const el = document.getElementById('fileName');
    if(!el) return;
    name = (name || '').trim();
    if(name){
      el.textContent = '📄 ' + name;
      el.title = name;
      el.hidden = false;
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function clearAll(){
    commentState.clear();
    lastBodyParagraphs = null;
    lastBodySourceBlocks = [];
    lastReferenceSourceBlocks = [];
    currentSourceType = 'paste';
    currentPdfBytes = null;
    currentPdfLabels = null;
    if(pdfViewer) pdfViewer.destroy();
    hidePageStatus();
    const tbClear = document.getElementById('txtBody');
    if(tbClear){ tbClear.value = ''; }
    setEditorFromHtml('');
    renderComments([], { missing:0, year:0, unused:0, format:0 });
    showEdit();
    updateFileNameBadge('');
    try { localStorage.removeItem('cr_current_file'); } catch(_){}
  }

  // ==================================================================
  // Word (.docx) 导入
  // ==================================================================
  function findDocxEntries(u8, view){
    const entries = [];
    const n = u8.length;
    let off = 0;
    while(off + 4 <= n){
      const sig = view.getUint32(off, true);
      if(sig !== 0x04034b50) break;
      const method = view.getUint16(off + 8, true);
      let compSize = view.getUint32(off + 18, true);
      const fnLen = view.getUint16(off + 26, true);
      const extraLen = view.getUint16(off + 28, true);
      const fnStart = off + 30;
      let fname = "";
      try { fname = new TextDecoder("utf-8").decode(u8.subarray(fnStart, fnStart + fnLen)); }
      catch(e) { fname = ""; }
      const dataStart = fnStart + fnLen + extraLen;
      if(compSize === 0){
        let next = -1;
        for(let i = dataStart; i + 4 <= n; i++){
          const v = (u8[i] | (u8[i+1]<<8) | (u8[i+2]<<16) | (u8[i+3]<<24)) >>> 0;
          if(v === 0x04034b50 || v === 0x02014b50){ next = i; break; }
        }
        compSize = (next >= 0 ? next : n) - dataStart;
      }
      entries.push({ fname, method, compSize, dataStart });
      off = dataStart + compSize;
    }
    return entries;
  }

  async function readDocxText(file){
    if(typeof DecompressionStream === "undefined"){
      throw new Error("当前浏览器不支持解压（DecompressionStream）。请使用较新版本的 Chrome / Edge / Safari。");
    }
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const view = new DataView(buf);

    const entries = findDocxEntries(u8, view);
    const docEntry = entries.find(e => e.fname === "word/document.xml")
                 || entries.find(e => /word\/document\.xml$/i.test(e.fname));
    if(!docEntry) throw new Error("未在文件中找到 word/document.xml（可能不是有效的 .docx）。");

    async function readEntry(entry){
      const compData = u8.subarray(entry.dataStart, entry.dataStart + entry.compSize);
      if(entry.method === 0) return compData;
      if(entry.method !== 8) throw new Error("不支持的压缩方式：" + entry.method);
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(compData);
      writer.close();
      return new Uint8Array(await new Response(ds.readable).arrayBuffer());
    }

    const xmlBytes = await readEntry(docEntry);
    let xml = new TextDecoder("utf-8").decode(xmlBytes);

    // Word 将脚注正文单独保存在 footnotes.xml，document.xml 中只留下编号引用。
    // 在拆分正文/参考文献之前把脚注放回引用位置，脚注内的引用才能参与检测。
    const footnotesEntry = entries.find(e => /(?:^|\/)word\/footnotes\.xml$/i.test(e.fname));
    let footnoteCount = 0;
    if(footnotesEntry){
      const footnotesXml = new TextDecoder("utf-8").decode(await readEntry(footnotesEntry));
      const footnotes = extractDocxFootnotes(footnotesXml);
      const usedFootnotes = new Set();
      xml = xml.replace(/<w:footnoteReference\b[^>]*\bw:id=["'](-?\d+)["'][^>]*\/?\s*>/gi, (tag, id) => {
        const note = footnotes.get(id);
        if(!note) return "";
        usedFootnotes.add(id);
        return `<w:t xml:space="preserve"> （脚注 ${escapeXmlText(id)}：${escapeXmlText(note)}） </w:t>`;
      });
      footnoteCount = usedFootnotes.size;
    }

    // 仅当文档确实含有分页符时，页码才有意义；否则全部视为无页码（避免误显示 “p.1”）
    const hasPageInfo = /<w:lastRenderedPageBreak|<w:br[^>]*\bw:type=["']page["']/i.test(xml);
    let paragraphs = docxXmlToText(xml);
    if(!hasPageInfo) paragraphs = paragraphs.map(p => ({ ...p, page: null }));
    return { paragraphs, hasPageInfo, footnoteCount };
  }

  function escapeXmlText(s){
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function extractDocxFootnotes(xml){
    const notes = new Map();
    const noteRe = /<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/gi;
    let match;
    while((match = noteRe.exec(xml)) !== null){
      const idMatch = match[1].match(/\bw:id=["'](-?\d+)["']/i);
      if(!idMatch || Number(idMatch[1]) < 1) continue; // 跳过 Word 内置的分隔符脚注
      const paragraphs = docxXmlToText(match[2]);
      const text = paragraphs.map(p => p.text).filter(Boolean).join(" ").trim();
      if(text) notes.set(idMatch[1], text);
    }
    return notes;
  }

  function decodeXmlEntities(s){
    return (s ?? "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => {
        try { return String.fromCodePoint(parseInt(h, 16)); } catch(e){ return m; }
      })
      .replace(/&#(\d+);/g, (m, d) => {
        try { return String.fromCodePoint(parseInt(d, 10)); } catch(e){ return m; }
      })
      .replace(/&amp;/g, "&");
  }

  function isDocxItalic(runInner){
    const tags = runInner.match(/<w:i\b(?![Cs])([^>]*?)\/?>/gi);
    if(!tags) return false;
    for(const tag of tags){
      const v = tag.match(/w:val="([^"]*)"/i);
      if(v){
        const val = v[1].toLowerCase();
        if(val === "0" || val === "false" || val === "none") return false;
        return true;
      }
      return true;
    }
    return false;
  }

  // 检测 Word 中的分页符：Word 保存时通常写入 <w:lastRenderedPageBreak/>，
  // 显式分页为 <w:br w:type="page"/>。据此近似还原每条内容在原文件中的页码。
  function pageBreakIndices(s){
    const idxs = [];
    let i;
    i = -1; while((i = s.indexOf('<w:lastRenderedPageBreak', i + 1)) !== -1) idxs.push(i);
    i = -1; while((i = s.indexOf('w:type="page"', i + 1)) !== -1) idxs.push(i);
    i = -1; while((i = s.indexOf("w:type='page'", i + 1)) !== -1) idxs.push(i);
    return idxs;
  }

  function docxXmlToText(xml){
    // 先按原始 XML 分段，依据分页符估算每条内容在原 Word 文件中的页码
    const rawParas = xml.split(/<\/w:p>/gi);
    const pageOf = new Array(rawParas.length).fill(1);
    let cur = 1;
    for(let k = 0; k < rawParas.length; k++){
      const rp = rawParas[k];
      const idxs = pageBreakIndices(rp);
      const tIdx = rp.indexOf('<w:t');
      const beforeIdx = tIdx < 0 ? rp.length : tIdx;
      let before = 0, after = 0;
      for(const ix of idxs){ if(ix < beforeIdx) before++; else after++; }
      cur += before;
      pageOf[k] = cur;
      cur += after;
    }

    let norm = xml
      .replace(/<w:br\s*\/?>/gi, "\n")
      .replace(/<w:tab\s*\/?>/gi, " ")
      .replace(/<w:cr\s*\/?>/gi, "\n");

    const paras = norm.split(/<\/w:p>/gi);
    const out = [];
    const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/gi;
    const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/gi;

    for(let pi = 0; pi < paras.length; pi++){
      const p = paras[pi];
      const segments = [];
      let rm, hadRun = false;
      runRe.lastIndex = 0;
      while((rm = runRe.exec(p)) !== null){
        hadRun = true;
        const runInner = rm[1];
        const italic = isDocxItalic(runInner);
        tRe.lastIndex = 0;
        let tm;
        while((tm = tRe.exec(runInner)) !== null){
          const txt = decodeXmlEntities(tm[1]);
          if(txt) segments.push({ text: txt, italic });
        }
      }
      if(!hadRun){
        tRe.lastIndex = 0;
        let tm;
        while((tm = tRe.exec(p)) !== null){
          const txt = decodeXmlEntities(tm[1]);
          if(txt) segments.push({ text: txt, italic: false });
        }
      }
      const text = segments.map(s => s.text).join("")
        .replace(/\s+/g, " ").trim();
      if(text.length > 0) out.push({ text, segments, page: pageOf[pi] });
    }
    return out.filter(x => x.text.length > 0);
  }

  function refsHtmlFromParagraphs(refParas){
    let html = "";
    const paras = refParas || [];
    paras.forEach(p => {
      const segs = (p.segments && p.segments.length) ? p.segments : [{ text: p.text || '', italic: false }];
      let inner = "";
      for(const s of segs){
        const esc = escapeHtml(s.text);
        inner += s.italic ? `<em>${esc}</em>` : esc;
      }
      const pageAttr = (p.page && p.page > 0) ? ` data-page="${p.page}"` : '';
      html += `<div${pageAttr}>${inner}</div>`;
    });
    return html;
  }

  const REF_HEADING_RE = /^\s*(?:\d+[\.\)]\s*)?(references?|bibliograph(?:y|ies)|works\s+cited|works\s+consulted|literature\s+cited|reference\s+list|sources?)\b/i;

  function splitBodyAndReferences(doc){
    const paras = (doc && doc.paragraphs) ? doc.paragraphs : [];
    let headingIdx = -1;
    for(let i = 0; i < paras.length; i++){
      const line = (paras[i].text || "").trim();
      if(!line) continue;
      if(line.length <= 60 && REF_HEADING_RE.test(line)){ headingIdx = i; break; }
    }

    if(headingIdx < 0){
      const bodyParagraphs = paras.map(p => ({ text: p.text, page: p.page })).filter(p => p.text);
      return {
        body: bodyParagraphs.map(p => p.text).join("\n\n"),
        bodyParagraphs,
        refsParagraphs: [],
        note: { kind: "warn", text: "未在该文档中找到“References / Bibliography / Works Cited”等标题，已把全部内容放入正文。请手动把参考文献粘贴到右侧框，或确认文档标题写法。" }
      };
    }

    const bodyLines = paras.slice(0, headingIdx).map(p => p.text).filter(Boolean);
    const bodyParagraphs = paras.slice(0, headingIdx).map(p => ({ text: p.text, page: p.page })).filter(p => p.text);
    let refParas = paras.slice(headingIdx + 1);
    const TRAILING_META_RE = /^\s*(word\s*count|words\s*:|page\s*count|pages\s*:|character\s*count|characters\s*:)/i;
    const refParasFiltered = refParas.filter(p => !TRAILING_META_RE.test(p.text || ""));
    const excluded = refParas.length - refParasFiltered.length;
    const refCount = window.CitationReferenceSplitter.groupReferenceLines(refParasFiltered, p => p.text).length;
    let noteText = `已从 Word 导入：正文约 ${bodyLines.length} 段，参考文献约 ${refCount} 项（按“${paras[headingIdx].text}”标题自动拆分，并已保留斜体等格式）。已自动开始检测。`;
    if(excluded > 0) noteText += ` 已忽略 ${excluded} 处文档统计信息（如 Word count），未计入参考文献。`;
    return {
      body: bodyLines.join("\n\n"),
      bodyParagraphs,
      refsParagraphs: refParasFiltered,
      note: { kind: "ok", text: noteText }
    };
  }

  let importMsgTimer = null;
  function showImportMsg(kind, text){
    const el = document.getElementById("importMsg");
    el.className = "importMsg show " + (kind || "");
    el.textContent = text;
    if(importMsgTimer) clearTimeout(importMsgTimer);
    importMsgTimer = setTimeout(() => { el.className = "importMsg"; }, 12000);
  }

  let lastBodyParagraphs = null; // 导入后保留的正文段落（含原文件页码）；手动输入时为 null
  let lastBodySourceBlocks = [];
  let lastReferenceSourceBlocks = [];
  let currentSourceType = 'paste';
  let currentPdfBytes = null;
  let currentPdfLabels = null;
  let pdfViewer = null;
  const commentSourceAnchors = new Map();

  function ensurePdfViewer(){
    let container = document.getElementById('pdfSourceView');
    if(!container){
      container = document.createElement('div');
      container.id = 'pdfSourceView';
      container.className = 'pdf-source-view';
      container.hidden = true;
      const bar = document.querySelector('#docView .doc-view-bar');
      bar?.insertAdjacentElement('afterend', container);
    }
    if(!pdfViewer && window.CitationPdfImporter?.createViewer) pdfViewer = window.CitationPdfImporter.createViewer(container);
    return { container, viewer: pdfViewer };
  }

  function anchorFromBlock(block, index){
    const source = block?.sourceSpans?.length ? block : lastReferenceSourceBlocks[index];
    if(!source?.sourceSpans?.length) return null;
    return { page:source.page || source.sourceSpans[0].page, pageEnd:source.pageEnd || source.page, sourceSpans:source.sourceSpans };
  }

  function bodySourceAtRange(bodyText, start, end){
    if(start == null || !lastBodySourceBlocks.length) return null;
    let cursor = 0;
    const regions = [];
    for(const block of lastBodySourceBlocks){
      if(!block?.text) continue;
      let blockStart = bodyText.indexOf(block.text, cursor);
      if(blockStart < 0) blockStart = cursor;
      const blockEnd = blockStart + block.text.length;
      if(start < blockEnd && (end == null || end > blockStart)){
        const localStart = Math.max(0, start - blockStart);
        const localEnd = Math.min(block.text.length, (end == null ? start + 1 : end) - blockStart);
        const matching = (block.sourceSpans || []).filter(span => span.end > localStart && span.start < localEnd);
        regions.push(...(matching.length ? matching : block.sourceSpans || []));
      }
      cursor = blockEnd;
    }
    if(!regions.length) return null;
    return { page:regions[0].page, pageEnd:regions[regions.length-1].page, sourceSpans:regions };
  }
  async function importWordFile(file){
    if(!file) return;
    const name = (file.name || "").toLowerCase();
    if(!name.endsWith(".docx")){
      showImportMsg("err", "目前仅支持 .docx 格式（Word 2007 及以上）。.doc 旧格式请在 Word 中“另存为” .docx 后重试。");
      return;
    }
    showImportMsg("", "正在读取并解析 Word 文档…");
    let fullText;
    try{
      fullText = await readDocxText(file);
    }catch(e){
      showImportMsg("err", "读取 Word 文档失败：" + (e && e.message ? e.message : e));
      try { localStorage.removeItem("cr_current_file"); } catch(_){}
      return;
    }

    const { body, bodyParagraphs, refsParagraphs, note } = splitBodyAndReferences(fullText);
    currentSourceType = 'word';
    currentPdfBytes = null;
    currentPdfLabels = null;
    lastBodySourceBlocks = [];
    lastReferenceSourceBlocks = [];
    if(pdfViewer) pdfViewer.destroy();
    lastBodyParagraphs = (fullText.hasPageInfo && bodyParagraphs && bodyParagraphs.length) ? bodyParagraphs : null;
    const txtBodyEl = document.getElementById("txtBody");
    if(txtBodyEl){ txtBodyEl.value = body; }
    editor.innerHTML = sanitizeEditorHtml(refsHtmlFromParagraphs(refsParagraphs));
    Array.from(editor.children).forEach((line, index) => {
      const page = refsParagraphs[index] && Number(refsParagraphs[index].page);
      if(Number.isInteger(page) && page > 0) line.dataset.page = String(page);
    });
    runCheck();
    updateFileNameBadge(file.name);
    try { localStorage.setItem("cr_current_file", file.name); } catch(e){}
    if(note){
      const pageNote = fullText.hasPageInfo
        ? ' 已保留正文与参考文献在原 Word 文件中的页码（依据分页符估算，审阅区以“第 N 页”分页标记并在底部状态栏显示当前页码，编辑区左侧对参考文献显示页码，仅供参考）。'
        : '';
      const footnoteNote = fullText.footnoteCount > 0
        ? ` 已读取 ${fullText.footnoteCount} 条脚注，并在对应正文位置参与检测。`
        : '';
      showImportMsg(note.kind, note.text + footnoteNote + pageNote);
    }
  }

  async function applyPdfDocument(result, fileName, autoRun){
    currentSourceType = 'pdf';
    currentPdfBytes = result.pdfBytes || currentPdfBytes;
    currentPdfLabels = result.pageLabels || currentPdfLabels;
    lastBodySourceBlocks = Array.isArray(result.bodyBlocks) ? result.bodyBlocks : [];
    lastReferenceSourceBlocks = Array.isArray(result.referenceBlocks) ? result.referenceBlocks : [];
    lastBodyParagraphs = lastBodySourceBlocks.filter(block => block?.text).map(block => ({ text:block.text, page:Number(block.page)||null }));
    const body = document.getElementById('txtBody');
    if(body) body.value = result.body || result.bodyText || '';
    editor.innerHTML = sanitizeEditorHtml(lastReferenceSourceBlocks.map(block => `<div${Number(block.page)>0?` data-page="${Number(block.page)}"`:''}>${block.html || escapeHtml(block.text || '')}</div>`).join(''));
    Array.from(editor.children).forEach((line,index) => {
      const page = Number(lastReferenceSourceBlocks[index]?.page);
      if(page > 0) line.dataset.page = String(page);
    });
    const { container, viewer } = ensurePdfViewer();
    container.hidden = false;
    if(currentPdfBytes && viewer && !result.pdfDocumentRetained) await viewer.load(currentPdfBytes, currentPdfLabels);
    updateFileNameBadge(fileName || '');
    try { localStorage.setItem('cr_current_file', fileName || ''); } catch(_) {}
    if(autoRun) runCheck();
  }

  async function importPdfFile(file){
    if(!file) return;
    if(!window.CitationPdfImporter?.parse){ showImportMsg('err', 'PDF 解析模块未加载，请刷新页面后重试。'); return; }
    showImportMsg('', '正在本地解析 PDF…');
    try{
      const result = await window.CitationPdfImporter.parse(file, (page,total) => showImportMsg('', `正在本地解析 PDF：${page} / ${total} 页…`));
      await applyPdfDocument(result, file.name, true);
      const range = result.referenceBlocks?.some(block => block.pageEnd && block.pageEnd !== block.page) ? '，已合并跨页参考文献' : '';
      const style = result.styleInfoAvailable ? '，已读取字体与斜体信息' : '；未检测到可用的斜体信息';
      showImportMsg('ok', `已从 PDF 导入：共 ${result.pageCount} 页、约 ${result.referenceBlocks?.length || 0} 条参考文献${range}${style}。点击右侧批注可定位到原 PDF。`);
    }catch(e){
      showImportMsg('err', '读取 PDF 失败：' + (e?.message || e));
      try { localStorage.removeItem('cr_current_file'); } catch(_) {}
    }
  }

  // ==================================================================
  // 视图切换 / 高亮 / 批注渲染
  // ==================================================================
  function showReview(){
    document.getElementById('editArea').hidden = true;
    document.getElementById('docView').hidden = false;
    const pdfMode = currentSourceType === 'pdf' && !!currentPdfBytes;
    const pdfSource = document.getElementById('pdfSourceView');
    if(pdfSource) pdfSource.hidden = !pdfMode;
    const body = document.getElementById('docBody');
    const refsTitle = document.querySelector('#docView .doc-refs-title');
    const refs = document.getElementById('docRefs');
    if(body) body.hidden = pdfMode || (checkMode === 'refs');
    if(refsTitle) refsTitle.hidden = pdfMode;
    if(refs) refs.hidden = pdfMode;
    if(pdfMode){ hidePageStatus(); pdfViewer?.render(); }
    else if(lastBodyParagraphs) showPageStatus(); else hidePageStatus();
  }
  function showEdit(){
    document.getElementById('docView').hidden = true;
    document.getElementById('editArea').hidden = false;
    hidePageStatus();
  }

  function buildHighlightedHtml(text, ranges){
    const sorted = ranges.slice().sort((a,b) => a.s - b.s);
    let out = '';
    let pos = 0;
    for(const r of sorted){
      if(r.s < pos) continue; // 跳过重叠
      if(r.s > pos) out += escapeHtml(text.slice(pos, r.s));
      const inner = escapeHtml(text.slice(r.s, r.e));
      out += `<span class="hl ${r.cls}" data-cmid="${r.id}" title="${escapeHtml(r.tip || '')}">${inner}</span>`;
      pos = r.e;
    }
    out += escapeHtml(text.slice(pos));
    return out.replace(/\n/g, '<br>');
  }

  // 依据导入时保留的正文段落（含原文件页码）重建带“第 N 页”分页标记的正文；无页码信息时返回 null
  function renderBodyHtml(text, ranges, paras){
    let html = '';
    let acc = 0;
    let prevPage = null;
    let hasAnyPage = false;
    for(const p of paras){
      if(!p.text) continue;
      let s = text.indexOf(p.text, acc);
      if(s < 0) s = acc; // 找不到（手动编辑过）则按当前游标近似
      const e = s + p.text.length;
      const local = ranges
        .filter(r => r.s < e && r.e > s)
        .map(r => ({ s: Math.max(s, r.s) - s, e: Math.min(e, r.e) - s, cls: r.cls, id: r.id, tip: r.tip }));
      const inner = buildHighlightedHtml(p.text, local);
      let mark = '';
      if(p.page && p.page > 0 && prevPage !== null && p.page !== prevPage){
        mark = `<div class="page-divider" data-page="${p.page}"><span>第 ${p.page} 页</span></div>`;
        hasAnyPage = true;
      }
      if(p.page && p.page > 0){ hasAnyPage = true; prevPage = p.page; }
      html += mark + `<div class="body-para"${p.page ? ` data-page="${p.page}"` : ''}>${inner}</div>`;
      acc = e;
    }
    return hasAnyPage ? html : null;
  }

  function bodyPageAtOffset(text, offset){
    if(!lastBodyParagraphs || offset == null) return null;
    let acc = 0;
    for(const p of lastBodyParagraphs){
      if(!p.text) continue;
      let start = text.indexOf(p.text, acc);
      if(start < 0) start = acc;
      const end = start + p.text.length;
      if(offset >= start && offset <= end) return p.page || null;
      acc = end;
    }
    return null;
  }

  // 底部状态栏：显示当前/总页码，随审阅区滚动更新
  function showPageStatus(){
    const sb = document.getElementById('pageStatus');
    if(!sb || !lastBodyParagraphs){ if(sb) sb.hidden = true; return; }
    const refPages = getReferenceBlocks().map(b => b.page || 0);
    const pages = lastBodyParagraphs.map(p => p.page || 0).concat(refPages).filter(p => p > 0);
    const tot = pages.length ? Math.max.apply(null, pages) : 1;
    document.getElementById('totPage').textContent = tot;
    sb.hidden = false;
    updatePageStatus();
  }
  function hidePageStatus(){
    const sb = document.getElementById('pageStatus');
    if(sb) sb.hidden = true;
  }
  function updatePageStatus(){
    const sb = document.getElementById('pageStatus');
    if(!sb || sb.hidden) return;
    const scroller = document.querySelector('.td-doc-scroll');
    if(!scroller) return;
    const line = scroller.getBoundingClientRect().top + 60; // 判定当前页的基准线
    let cur = 1;
    document.querySelectorAll('#docView [data-page]').forEach(el => {
      if(el.getBoundingClientRect().top <= line) cur = parseInt(el.dataset.page, 10) || cur;
    });
    const curEl = document.getElementById('curPage');
    if(curEl) curEl.textContent = cur;
  }

  function flashEl(el, cls){
    if(!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1000);
  }

  // 仅高亮当前选中的批注对应位置，其余恢复为下划线
  function activateHl(cmid){
    document.querySelectorAll('#docView .hl.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`#docView [data-cmid="${cmid}"], #docView [data-cmids~="${cmid}"]`).forEach(el => el.classList.add('active'));
  }
  function scrollToComment(cmid){
    const cm = document.querySelector(`#cmList .cm-card[data-cmid="${cmid}"]`);
    const hl = document.querySelector(`#docView [data-cmid="${cmid}"], #docView [data-cmids~="${cmid}"]`);
    activateHl(cmid);
    if(cm) cm.scrollIntoView({ block:'center', behavior:'smooth' });
    if(cm) flashEl(cm, 'flash-cm');
    if(hl) flashEl(hl, 'flash-hl');
  }
  function scrollToHighlight(cmid){
    if(currentSourceType === 'pdf' && pdfViewer){
      pdfViewer.locate(commentSourceAnchors.get(cmid));
      const pdfComment = document.querySelector(`#cmList .cm-card[data-cmid="${cmid}"]`);
      if(pdfComment) flashEl(pdfComment, 'flash-cm');
      return;
    }
    const hl = document.querySelector(`#docView [data-cmid="${cmid}"], #docView [data-cmids~="${cmid}"]`);
    const cm = document.querySelector(`#cmList .cm-card[data-cmid="${cmid}"]`);
    activateHl(cmid);
    if(hl) hl.scrollIntoView({ block:'center', behavior:'smooth' });
    if(hl) flashEl(hl, 'flash-hl');
    if(cm) flashEl(cm, 'flash-cm');
  }

  // 当前分类筛选：null 显示全部；否则为 color + '\u0000' + tag
  let activeFilter = null;
  // 颜色主分类展示顺序（缺失→不匹配→样式→未被引用→格式）
  const CATEGORY_COLOR_ORDER = ['missing', 'mismatch', 'style', 'unused', 'format'];
  function catSort(a, b){
    const ai = CATEGORY_COLOR_ORDER.indexOf(a.color);
    const bi = CATEGORY_COLOR_ORDER.indexOf(b.color);
    const ci = (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    if(ci !== 0) return ci;
    return (a.tag || '').localeCompare(b.tag || '', 'zh');
  }

  function renderComments(comments){
    const list = document.getElementById('cmList');
    list.innerHTML = '';
    commentSourceAnchors.clear();
    comments.forEach(comment => { if(comment.cmid && comment.sourceAnchor) commentSourceAnchors.set(comment.cmid, comment.sourceAnchor); });
    // 可见批注 = 既不「忽略」也不「已解决(隐藏)」；已解决但重新显示的照常计入
    const visible = comments.filter(c => {
      const s = commentStatus(c.cmid);
      return s !== 'ignored' && s !== 'resolved-hidden';
    });
    document.getElementById('cmCount').textContent = String(visible.length);

    if(visible.length === 0){
      const empty = document.createElement('div');
      empty.className = 'cm-empty';
      empty.textContent = '🎉 未发现引用一致性或格式问题。';
      list.appendChild(empty);
      return;
    }

    // 按「颜色主分类 + 具体标签」归集，使汇总与卡片上的 tag 完全一致；
    // 例如 mismatch 下会细分出「作者不匹配」「年份不匹配」等具体分类。
    const catMap = new Map();
    for(const c of visible){
      const color = c.color || 'format';
      const tag = c.tag || '格式问题';
      const key = color + '\u0000' + tag;
      if(!catMap.has(key)) catMap.set(key, { color, tag, count: 0 });
      catMap.get(key).count++;
    }
    const cats = [...catMap.values()].sort(catSort);

    const summary = document.createElement('div');
    summary.className = 'cm-summary';
    // 最前面固定「全部」，其余为各分类；点击某分类仅显示该类条目
    summary.innerHTML = '<div class="cm-stat cm-chip' + (activeFilter === null ? ' active' : '') + '" data-all="1"><span class="dot"></span>全部 <b>' + visible.length + '</b></div>'
      + cats.map(c => {
          const key = c.color + '\u0000' + c.tag;
          const activeCls = activeFilter === key ? ' active' : '';
          return `<div class="cm-stat cm-chip${activeCls}" data-color="${c.color}" data-tag="${escapeHtml(c.tag)}"><span class="dot ${c.color}"></span>${escapeHtml(c.tag)} <b>${c.count}</b></div>`;
        }).join('');
    summary.querySelectorAll('.cm-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if(chip.getAttribute('data-all') === '1'){
          activeFilter = null;
        } else {
          const key = chip.getAttribute('data-color') + '\u0000' + chip.getAttribute('data-tag');
          activeFilter = activeFilter === key ? null : key;
        }
        renderComments(comments);
      });
    });
    list.appendChild(summary);

    for(const c of comments){
      const st = commentStatus(c.cmid);
      if(st === 'ignored') continue;
      if(activeFilter){
        const key = (c.color || 'format') + '\u0000' + (c.tag || '格式问题');
        if(key !== activeFilter) continue;
      }
      const card = document.createElement('div');
      let cls = 'cm-card c-' + c.color;
      const resolved = isResolved(st);
      if(resolved) cls += ' cm-resolved';
      if(st === 'resolved-hidden') cls += ' cm-hidden';
      card.className = cls;
      card.dataset.cmid = c.cmid;
      const quoteHtml = (c.quoteHtml != null) ? c.quoteHtml : escapeHtml(c.quote);
      card.innerHTML = `
        <div class="cm-head">
          <span class="cm-tag tag-${c.color}">${c.tag}</span>
          ${c.page ? `<span class="cm-source-page">原文第 ${c.page} 页</span>` : ''}
          ${c.count ? `<span class="cm-count2">出现 ${c.count} 次</span>` : ''}
          ${resolved ? `<span class="cm-badge-resolved">✓ 已解决</span>` : ''}
          <button type="button" class="cm-copy" data-cmid="${c.cmid}" title="复制该卡片内容">⧉</button>
        </div>
        <div class="cm-quote">${quoteHtml}</div>
        <div class="cm-desc">${c.desc}</div>
        <div class="cm-foot">
          <span class="cm-actions">
            <button type="button" class="cm-act cm-resolve" data-cmid="${c.cmid}">${resolved ? '收起' : '已解决'}</button>
            <button type="button" class="cm-act cm-ignore" data-cmid="${c.cmid}">忽略</button>
          </span>
        </div>`;
      list.appendChild(card);
    }
  }

  // ==================================================================
  // 批注状态：open / resolved-hidden / resolved-shown / ignored
  // 键为 cmid（m*/y*/u*/f*），在重新检测时按相同键复用
  // ==================================================================
  const commentState = new Map();
  function isResolved(st){ return st === 'resolved-hidden' || st === 'resolved-shown'; }
  function commentStatus(cmid){ return commentState.get(cmid) || 'open'; }

  // 检测范围：full = 全文检测；refs = 仅检测参考文献（隐藏正文，仅检测参考文献格式）
  // 带有正文输入框的页面（index.html）固定为全文检测；无正文框的页面（格式检查独立页）固定为仅检查格式
  let checkMode;
  if(document.getElementById('txtBody')){
    checkMode = 'full';
    try { localStorage.setItem('crCheckMode', 'full'); } catch(e){}
  } else {
    checkMode = 'refs';
  }
  function setCheckMode(mode){
    checkMode = mode;
    localStorage.setItem('crCheckMode', mode);
    const radios = document.querySelectorAll('input[name="checkMode"]');
    radios.forEach(r => { r.checked = (r.value === mode); });
    const bg = document.getElementById('bodyGroup');
    if(bg) bg.hidden = (mode === 'refs');
  }

  function resolveToggle(cmid){
    const st = commentStatus(cmid);
    if(st === 'open') commentState.set(cmid, 'resolved-hidden');
    else if(st === 'resolved-hidden') commentState.set(cmid, 'resolved-shown');
    else if(st === 'resolved-shown') commentState.set(cmid, 'resolved-hidden');
    else return; // ignored：忽略的项不再处理
    runCheck();
  }
  function ignoreComment(cmid){
    commentState.set(cmid, 'ignored');
    runCheck();
  }
  function revealFromGreen(cmid){
    const st = commentStatus(cmid);
    if(isResolved(st)){
      commentState.set(cmid, 'resolved-shown');
      runCheck();
      setTimeout(() => scrollToComment(cmid), 40);
    } else {
      scrollToComment(cmid);
    }
  }

  // ==================================================================
  // 主检测流程（计算 + 构建文档与批注）
  // ==================================================================
  function runCheck(){
    const refOnly = (checkMode === 'refs');
    const body = refOnly ? '' : document.getElementById('txtBody').value;
    const bodyNorm = body.replace(/\r\n/g, "\n");
    const refBlocks = getReferenceBlocks();
    const globalItalic = refBlocks.some(b => b.italics && b.italics.length > 0);

    const parsedRefs = refBlocks.map((b, i) => {
      const pr = parseReferenceEntry(b.text);
      if(pr){ pr.italics = b.italics; pr.html = b.html; pr._idx = i; }
      return pr;
    }).filter(Boolean);

    const refKeyToRef = new Map();
    for(const pr of parsedRefs){
      for(const k of pr.keys){ if(!refKeyToRef.has(k)) refKeyToRef.set(k, pr); }
    }

    // 仅检测参考文献模式：不解析正文，跳过所有与正文相关的检测
    const rawCites = refOnly ? [] : extractCitationsFromBody(bodyNorm);
    const citeKeyItems = [];
    for(const c of rawCites){
      const keys = buildKeys(c.authors, c.etal, c.year);
      if(keys.length === 0) continue;
      citeKeyItems.push({
        key: keys[0], allKeys: keys,
        authorsRaw: c.authorsRaw, authors: c.authors, etal: c.etal,
        year: c.year, raw: c.raw, start: c.start, end: c.end
      });
    }

    const countByKey = new Map();
    const anyKeysByPrimary = new Map();
    const displayByPrimary = new Map();
    for(const item of citeKeyItems){
      const k = item.key;
      countByKey.set(k, (countByKey.get(k) || 0) + 1);
      if(!anyKeysByPrimary.has(k)) anyKeysByPrimary.set(k, item.allKeys);
      if(!displayByPrimary.has(k)) displayByPrimary.set(k, item);
    }
    const uniqueCites = [...displayByPrimary.values()].sort((a,b) => a.key.localeCompare(b.key));

    const missingCites = [];
    for(const cite of uniqueCites){
      const keys = anyKeysByPrimary.get(cite.key) ?? [cite.key];
      let ok = false;
      for(const k of keys){
        if(refKeyToRef.has(k)){ ok = true; break; }
      }
      if(ok) continue;
      // 即便参考文献中存在同作者但年份不同的条目，也无法判定为同一篇文献，
      // 故一律按「文献缺失」处理，交由用户自行核对文中作者 / 年份是否与参考文献一致。
      missingCites.push(cite);
    }

    const citePrimaryKeys = new Set(uniqueCites.map(c => c.key));
    const unusedRefs = [];
    if(!refOnly){
      for(const pr of parsedRefs){
        const used = pr.keys.some(k => citePrimaryKeys.has(k));
        if(!used){
          let altUsed = false;
          for(const cite of uniqueCites){
            const alt = anyKeysByPrimary.get(cite.key) ?? [];
            if(alt.some(k => pr.keys.includes(k))){ altUsed = true; break; }
          }
          if(!altUsed) unusedRefs.push(pr);
        }
      }
    }

    const formatByIdx = new Map();
    refBlocks.forEach((b, i) => {
      const { type, issues } = lintReference(b, globalItalic);
      if(issues && issues.length) formatByIdx.set(i, { type, issues });
    });

    // ---- 参考文献列表：字母顺序检查（APA 要求按作者姓氏 A–Z 排列）----
    const prByIdx = new Map();
    parsedRefs.forEach(pr => prByIdx.set(pr._idx, pr));
    for(let i = 1; i < refBlocks.length; i++){
      const prev = prByIdx.get(i - 1);
      const cur  = prByIdx.get(i);
      if(!prev || !cur) continue;                 // 跳过无法解析的条目
      if(refOrderKey(cur) < refOrderKey(prev)){   // 当前条目按字母应排在前一条之前 → 顺序错误
        if(!formatByIdx.has(i)) formatByIdx.set(i, { type: '参考文献列表', issues: [] });
        formatByIdx.get(i).issues.push(issue('warn',
          `参考文献未按字母顺序排列：该条目（${refLabel(cur)}）按作者姓氏应排在「${refLabel(prev)}」之前。`,
          '字母顺序'));
      }
    }

    // ---- In-Text 精细检测（移植自加载项 APA7：不匹配 / 结构 / 样式）----
    // 注意：detectInTextMismatches 的「引用缺失」分支与上方 missingCites 统一处理重复，故跳过；
    // 只保留更精细的「作者不匹配 / 年份不匹配 / 作者与年份不匹配」等。
    // 仅检测参考文献模式下跳过全部 In-Text 检测。
    const inTextComments = [];
    if(!refOnly){
      for(const cm of detectInTextMismatches(rawCites, parsedRefs, refKeyToRef)){
        if(cm.tag === '引用缺失') continue;
        inTextComments.push(cm);
      }
      for(const cm of detectInTextStructural(rawCites, parsedRefs)){
        inTextComments.push(cm);
      }
      for(const cm of detectInTextStyleWarnings(rawCites, parsedRefs)){
        inTextComments.push(cm);
      }
    }

    // ---- 左侧文档：正文（带高亮） ----
    const bodyRanges = [];
    missingCites.forEach((cite, i) => {
      if(cite.start != null){
        const id = 'm' + i;
        if(commentStatus(id) === 'ignored') return;
        const cls = isResolved(commentStatus(id)) ? 'hl-resolved' : 'hl-missing';
        bodyRanges.push({ s: cite.start, e: cite.end, cls, id, tip: '引用缺失：未在参考文献中找到' });
      }
    });
    inTextComments.forEach((cm, i) => {
      cm.cmid = 'y' + i;
      if(cm.start != null){
        if(commentStatus(cm.cmid) === 'ignored') return;
        const hlCls = cm.color === 'style' ? 'hl-style' : 'hl-mismatch';
        const cls = isResolved(commentStatus(cm.cmid)) ? 'hl-resolved' : hlCls;
        bodyRanges.push({ s: cm.start, e: cm.end, cls, id: cm.cmid, tip: cm.tag });
      }
    });
    const docBodyEl = document.getElementById('docBody');
    if(refOnly){
      // 仅检测参考文献：隐藏正文（含文中引用），仅展示参考文献列表
      docBodyEl.innerHTML = '';
      docBodyEl.hidden = true;
    } else {
      docBodyEl.hidden = false;
      const bodyPageHtml = (bodyNorm.trim() && lastBodyParagraphs) ? renderBodyHtml(bodyNorm, bodyRanges, lastBodyParagraphs) : null;
      docBodyEl.innerHTML = bodyNorm.trim()
        ? (bodyPageHtml != null ? bodyPageHtml : buildHighlightedHtml(bodyNorm, bodyRanges))
        : '<span class="doc-empty">（正文为空，请返回编辑视图粘贴正文后再检测。）</span>';
    }

    // ---- 左侧文档：参考文献列表（带高亮） ----
    const unusedIdx = new Set(unusedRefs.map(r => r._idx));
    const docRefsEl = document.getElementById('docRefs');
    docRefsEl.innerHTML = '';
    const comments = [];
    const unusedComments = [];
    const formatComments = [];

    refBlocks.forEach((b, i) => {
      const li = document.createElement('li');
      if(b.page && b.page > 0) li.dataset.page = b.page; // 原文件页码（状态栏定位用）
      const isUnused = unusedIdx.has(i);
      const fmt = formatByIdx.get(i);
      const hasFormatIssues = !!(fmt && fmt.issues.length);
      const issueIds = [];
      if(isUnused) issueIds.push('u' + i);
      if(hasFormatIssues) issueIds.push('f' + i);

      if(issueIds.length){
        const visibleIssueIds = issueIds.filter(id => commentStatus(id) !== 'ignored');
        const primaryId = visibleIssueIds.find(id => id[0] === 'f') || visibleIssueIds[0];
        li.classList.add('hl');
        li.dataset.cmids = issueIds.join(' ');
        if(primaryId) li.dataset.cmid = primaryId;
        if(!visibleIssueIds.length){
          li.classList.remove('hl');
          delete li.dataset.cmid;
          delete li.dataset.cmids;
        } else if(visibleIssueIds.every(id => isResolved(commentStatus(id)))){
          li.classList.add('hl-resolved');
          li.classList.remove('hl-unused', 'hl-format');
        } else {
          li.classList.add(hasFormatIssues ? 'hl-format' : 'hl-unused');
        }

        if(isUnused){
          unusedComments.push({
            cmid: 'u' + i,
            color: 'unused',
            tag: '未被引用',
            page: b.page || null,
            sourceAnchor: anchorFromBlock(b, i),
            quoteHtml: b.html || escapeHtml(b.text),
            desc: '该参考文献未在正文中被引用，请确认是否需要删除或补充正文引用。'
          });
        }
        if(hasFormatIssues){
          const issueHtml = fmt.issues.slice().sort((a,b) => severityRank(b.severity) - severityRank(a.severity)).map(it => {
            const pill = it.severity === 'bad'
              ? '<span class="cm-pill bad">错误</span>'
              : it.severity === 'warn'
                ? '<span class="cm-pill warn">警告</span>'
                : '<span class="cm-pill ok">提示</span>';
            return `<div class="cm-issue">${pill}<span>${escapeHtml(it.message)}</span></div>`;
          }).join('');
          formatComments.push({
            cmid: 'f' + i,
            color: 'format',
            tag: '格式问题',
            page: b.page || null,
            sourceAnchor: anchorFromBlock(b, i),
            quoteHtml: b.html || escapeHtml(b.text),
            desc: `<div class="cm-issues">${issueHtml}</div>`
          });
        }
      }

      const pageBadge = (b.page && b.page > 0)
        ? `<span class="ref-page" title="原文件页码（依据 Word 分页符估算，可能与实际打印页码略有出入）">p.${b.page}</span>`
        : '';
      li.innerHTML = pageBadge + (b.html || escapeHtml(b.text));
      docRefsEl.appendChild(li);
    });

    // ---- 批注：缺失引用 ----
    missingCites.forEach((cite, i) => {
      comments.push({
        cmid: 'm' + i, color: 'missing', tag: '引用缺失',
        page: bodyPageAtOffset(bodyNorm, cite.start),
        sourceAnchor: bodySourceAtRange(bodyNorm, cite.start, cite.end),
        quote: cite.raw, count: countByKey.get(cite.key) || 1,
        desc: '正文中出现该引用（作者 + 年份），但未在参考文献列表中找到「作者 + 年份」完全匹配的条目。若参考文献中存在同作者但年份不同的条目，可能是文中或参考文献的年份书写有误，请自行核对是否为同一篇文献；否则请补充对应参考文献。'
      });
    });

    // ---- 批注：In-Text 精细检测（mismatch / style）----
    inTextComments.forEach(c => { if(!c.cmid) c.cmid = 'y' + inTextComments.indexOf(c);c.page=bodyPageAtOffset(bodyNorm,c.start);c.sourceAnchor=bodySourceAtRange(bodyNorm,c.start,c.end);comments.push(c); });

    // ---- 批注：未被引用 ----
    unusedComments.forEach(c => comments.push(c));

    // ---- 批注：参考文献格式问题（放在最后）----
    formatComments.forEach(c => comments.push(c));

    renderComments(comments.filter(c => isTypeEnabled(c.color)), {});

    showReview();
    if(currentSourceType === 'pdf') hidePageStatus();
    else if(lastBodyParagraphs) showPageStatus();
    else hidePageStatus();
  }

  // ==================================================================
  // 深度分析（引用频次 / 年份区间 / 期刊出现次数）
  // ==================================================================
  function formatCiteLabel(cite){
    const names = cite.authors.map(a => normalizeSpace(a.surname)).filter(Boolean);
    let label;
    if(names.length === 0) label = (cite.authorsRaw || cite.raw || '');
    else if(cite.etal) label = names[0] + ' et al.';
    else if(names.length === 1) label = names[0];
    else if(names.length === 2) label = names[0] + ' & ' + names[1];
    else label = names[0] + ' et al.';
    const year = cite.year || '';
    return label + (year ? ' (' + year + ')' : '');
  }

  // 取斜体片段（APA 中期刊名通常为斜体；卷号也是斜体，须排除纯数字）
  function italicSegments(text, italics){
    const segs = [];
    for(const [s, e] of (italics || [])){
      const t = (text || "").slice(s, e);
      if(t) segs.push(t);
    }
    return segs;
  }

  // 从 APA 期刊条目中提取期刊名：
  // 1) 优先用导入保留的斜体信息（期刊名是第一个非纯数字的斜体片段）；
  // 2) 回退到「期刊名, 卷(期), 页码」正则。
  // 仅在疑似期刊条目（含卷期/页码/DOI）时才采用斜体法，避免把书名等误判为期刊。
  function extractJournalTitle(text, italics){
    const t = text || "";
    // 书籍判定：年份之后（跳过空白）紧接斜体片段，说明斜体的是书名。
    // APA 中书籍的书名斜体、且位于年份之后；期刊条目斜体的是期刊名，位于文章标题之后。
    // 因此“年份之后立即斜体”视为书籍，不计入期刊。
    const yearEnd = t.match(/\(\s*\d{4}(?:[,\s]+\d{4})*\s*\)\.\s*/);
    if(yearEnd){
      const after = yearEnd.index + yearEnd[0].length;
      const seg = (italics || []).find(([s]) => s >= after);
      if(seg && /^\s*$/.test(t.slice(after, seg[0]))) return null;
    }
    const journalLike = /\b\d+\s*\(\s*\d+\s*\)/.test(t)
      || /\b\d+\s*[–-]\s*\d+\b/.test(t)
      || /doi\.org\//i.test(t)
      || /\b10\.\d{4,9}\//.test(t);
    if(journalLike && italics && italics.length){
      for(const seg of italicSegments(t, italics)){
        const s = normalizeSpace(seg);
        if(s && !/^\d+$/.test(s)) return s;
      }
    }
    const rePages = /\)\.\s+(.+?)\.\s+(.+?),\s+(\d+)(\s*\(\s*\d+\s*\))?,\s+([^\.]+?)\./;
    const reELocator = /\)\.\s+(.+?)\.\s+(.+?),\s+(\d{1,4}),\s*(e\d+|\d{4,}|[A-Za-z]\d{4,})\./;
    const reAdvance = /\)\.\s+(.+?)\.\s+(.+?)\.\s+Advance online publication\./i;
    const m1 = t.match(rePages);
    const m2 = t.match(reELocator);
    const m3 = t.match(reAdvance);
    if(m1) return normalizeSpace(m1[2]);
    if(m2) return normalizeSpace(m2[2]);
    if(m3) return normalizeSpace(m3[2]);
    return null;
  }

  // 把年份集合按区间分桶，区间大小随跨度自适应（1 / 5 / 10 年），返回按起始年升序
  function buildYearBuckets(years){
    if(years.length === 0) return [];
    const min = Math.min(...years);
    const max = Math.max(...years);
    const span = max - min;
    const size = span <= 10 ? 1 : (span <= 30 ? 5 : 10);
    const buckets = new Map();
    for(const y of years){
      const bstart = Math.floor(y / size) * size;
      const label = size === 1 ? String(bstart) : `${bstart}–${bstart + size - 1}`;
      buckets.set(label, (buckets.get(label) || 0) + 1);
    }
    return [...buckets.entries()].map(([label, count]) => ({
      label, count, start: parseInt(label.split('–')[0], 10)
    })).sort((a, b) => a.start - b.start);
  }

  function renderDeepModal(citeList, yearBuckets, journalList, years){
    const body = document.getElementById('deepBody');
    let html = '';

    // ① 文中引用按出现次数排序
    html += '<div class="deep-section">';
    html += '<h3>① 文中引用按出现次数排序</h3>';
    const totalCite = citeList.reduce((s, x) => s + x.count, 0);
    html += `<p class="sub">共识别 ${citeList.length} 个不同引用，总出现 ${totalCite} 次（同一作者+年份合并计数）。</p>`;
    if(citeList.length === 0){
      html += '<div class="deep-empty">未识别到正文中的引用。请先在左侧粘贴正文并运行检测。</div>';
    } else {
      const max = citeList[0].count;
      citeList.forEach((x, i) => {
        const pct = Math.max(6, Math.round(x.count / max * 100));
        html += `<div class="deep-row"><div class="rank">${i + 1}</div>` +
                `<div class="name wide" title="${escapeHtml(x.label)}">${escapeHtml(x.label)}</div>` +
                `<div class="deep-bar"><span style="width:${pct}%"></span></div>` +
                `<div class="count">${x.count}</div></div>`;
      });
    }
    html += '</div>';

    // ② 参考文献年份区间排序
    html += '<div class="deep-section">';
    html += '<h3>② 参考文献年份区间排序</h3>';
    if(years.length === 0){
      html += '<div class="deep-empty">未识别到含有效年份的参考文献。</div>';
    } else {
      const min = Math.min(...years), max = Math.max(...years);
      html += `<p class="sub">共 ${years.length} 条参考文献含有效年份，年份区间为 ${min}–${max}。</p>`;
      const maxC = Math.max(...yearBuckets.map(b => b.count));
      yearBuckets.forEach(b => {
        const pct = Math.max(6, Math.round(b.count / maxC * 100));
        html += `<div class="deep-row"><div class="ylabel">${escapeHtml(b.label)}</div>` +
                `<div class="deep-bar"><span style="width:${pct}%"></span></div>` +
                `<div class="count">${b.count}</div></div>`;
      });
    }
    html += '</div>';

    // ③ 参考文献中期刊名字出现次数排序
    html += '<div class="deep-section">';
    html += '<h3>③ 参考文献中期刊名字出现次数排序</h3>';
    if(journalList.length === 0){
      html += '<div class="deep-empty">未识别到期刊类参考文献。期刊名通常以斜体呈现，或符合「期刊名, 卷(期), 页码」格式。</div>';
    } else {
      const max = journalList[0].count;
      html += `<p class="sub">共识别 ${journalList.length} 种期刊。</p>`;
      journalList.forEach((x, i) => {
        const pct = Math.max(6, Math.round(x.count / max * 100));
        html += `<div class="deep-row"><div class="rank">${i + 1}</div>` +
                `<div class="name wide" title="${escapeHtml(x.name)}">${escapeHtml(x.name)}</div>` +
                `<div class="deep-bar"><span style="width:${pct}%"></span></div>` +
                `<div class="count">${x.count}</div></div>`;
      });
    }
    html += '</div>';

    body.innerHTML = html;
  }

  function showDeepModal(){ document.getElementById('deepModal').hidden = false; }
  function hideDeepModal(){ document.getElementById('deepModal').hidden = true; }

  function runDeepAnalysis(){
    const tbDeep = document.getElementById('txtBody');
    const body = tbDeep ? tbDeep.value : '';
    const bodyNorm = body.replace(/\r\n/g, "\n");
    const refBlocks = getReferenceBlocks();

    // ① 文中引用出现次数（同一 作者+年份 合并）
    const rawCites = extractCitationsFromBody(bodyNorm);
    const citeCount = new Map();
    for(const c of rawCites){
      const names = c.authors.map(a => normalizeSpace(a.surname).toLowerCase()).filter(Boolean);
      if(names.length === 0) continue;
      const key = names.join('&') + '|' + c.year;
      const item = citeCount.get(key) || { key, label: formatCiteLabel(c), count: 0 };
      item.count++;
      citeCount.set(key, item);
    }
    const citeList = [...citeCount.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    // 解析参考文献
    const parsedRefs = refBlocks.map((b, i) => {
      const pr = parseReferenceEntry(b.text);
      if(pr){ pr._idx = i; pr.italics = b.italics; }
      return pr;
    }).filter(Boolean);

    // ② 年份区间
    const years = [];
    for(const pr of parsedRefs){
      const ym = (pr.year || '').match(/\d{4}/);
      if(ym) years.push(parseInt(ym[0], 10));
    }
    const yearBuckets = buildYearBuckets(years);

    // ③ 期刊名出现次数
    const journalCount = new Map();
    for(const pr of parsedRefs){
      const jt = extractJournalTitle(pr.raw, pr.italics);
      if(!jt) continue;
      const key = normalizeSpace(jt).toLowerCase();
      const item = journalCount.get(key) || { key, name: normalizeSpace(jt), count: 0 };
      item.count++;
      journalCount.set(key, item);
    }
    const journalList = [...journalCount.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    renderDeepModal(citeList, yearBuckets, journalList, years);
    showDeepModal();
  }

  // ==================================================================
  // 事件绑定
  // ==================================================================
  // 检测范围切换（全文 / 仅参考文献），切换后若已在审阅视图则立即重算
  document.querySelectorAll('input[name="checkMode"]').forEach(r => {
    r.addEventListener('change', () => {
      if(r.checked){
        setCheckMode(r.value);
        const docView = document.getElementById('docView');
        if(docView && !docView.hidden) runCheck();
      }
    });
  });
  // 初始化：根据已保存设置回显单选状态
  (function initCheckMode(){
    const saved = localStorage.getItem('crCheckMode');
    if(saved === 'refs' || saved === 'full'){
      document.querySelectorAll('input[name="checkMode"]').forEach(r => { r.checked = (r.value === saved); });
      const bg = document.getElementById('bodyGroup');
      if(bg) bg.hidden = (saved === 'refs');
    }
  })();

  document.getElementById("btnCheck").addEventListener("click", runCheck);
  document.getElementById("btnDeep").addEventListener("click", runDeepAnalysis);
  document.getElementById("btnDeepClose").addEventListener("click", hideDeepModal);
  document.querySelector("#deepModal .deep-modal-mask").addEventListener("click", hideDeepModal);
  document.getElementById("btnExample").addEventListener("click", () => { fillExample(); runCheck(); });
  document.getElementById("btnClear").addEventListener("click", clearAll);
  // 顶栏“编辑原文”按钮已移除；审阅视图中通过 docView 内的返回按钮回到编辑区
  const btnEditBack = document.getElementById("btnEditBack");
  if (btnEditBack) btnEditBack.addEventListener("click", showEdit);

  document.getElementById("btnImport").addEventListener("click", () => {
    document.getElementById("fileInput").click();
  });
  document.getElementById("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    document.documentElement.dataset.wordImportState = "running";
    document.documentElement.dataset.documentImportState = "running";
    try {
      if(file && (/\.pdf$/i.test(file.name || '') || file.type === 'application/pdf')) await importPdfFile(file);
      else await importWordFile(file);
    } finally {
      document.documentElement.dataset.wordImportState = "done";
      document.documentElement.dataset.documentImportState = "done";
      document.documentElement.dataset.wordImportMessage = document.getElementById("importMsg")?.textContent || "";
      document.documentElement.dataset.documentImportMessage = document.getElementById("importMsg")?.textContent || "";
      e.target.value = "";
    }
  });

  document.getElementById("btnItalic").addEventListener("click", () => exec("italic"));
  document.getElementById("btnBold").addEventListener("click", () => exec("bold"));
  document.getElementById("btnUnderline").addEventListener("click", () => exec("underline"));
  document.getElementById("btnClearFormat").addEventListener("click", clearFormatting);
  document.getElementById("btnPastePlain").addEventListener("click", pastePlain);

  editor.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if(!mod) return;
    const map = { i: "italic", b: "bold", u: "underline" };
    const cmd = map[e.key.toLowerCase()];
    if(cmd){ e.preventDefault(); exec(cmd); }
  });
  editor.addEventListener("paste", (e) => {
    e.preventDefault();
    const clipboard = e.clipboardData;
    const rich = clipboard && clipboard.getData('text/html');
    if(rich){
      insertSanitizedHtmlAtSelection(rich);
    } else {
      const plain = clipboard ? clipboard.getData('text/plain') : '';
      insertSanitizedHtmlAtSelection(escapeHtml(plain).replace(/\r?\n/g, '<br>'));
    }
    ensureLineStructure();
  });
  editor.addEventListener("drop", (e) => {
    e.preventDefault();
    const plain = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
    insertSanitizedHtmlAtSelection(escapeHtml(plain).replace(/\r?\n/g, '<br>'));
    ensureLineStructure();
  });

  // 点击文档中的高亮 → 已解决的绿色下划线重新显示批注；其余跳转对应批注
  document.getElementById("docView").addEventListener("click", (e) => {
    const t = e.target.closest("[data-cmid]");
    if(!t) return;
    const cmid = t.dataset.cmid;
    if(isResolved(commentStatus(cmid))) revealFromGreen(cmid);
    else scrollToComment(cmid);
  });
  // 点击批注卡片 → 跳转文档高亮；点击「已解决 / 忽略」按钮执行对应操作
  document.getElementById("cmList").addEventListener("click", (e) => {
    const copyBtn = e.target.closest(".cm-copy");
    if(copyBtn){
      e.stopPropagation();
      const card = copyBtn.closest(".cm-card");
      const tag = card.querySelector(".cm-tag") ? card.querySelector(".cm-tag").textContent.trim() : '';
      const quote = card.querySelector(".cm-quote") ? card.querySelector(".cm-quote").textContent.trim() : '';
      const desc = card.querySelector(".cm-desc") ? card.querySelector(".cm-desc").textContent.trim() : '';
      const text = [tag, quote, desc].filter(Boolean).join('\n\n');
      const done = () => {
        const old = copyBtn.textContent;
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = old; }, 1200);
      };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(done).catch(() => { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
      return;
    }
    const resolveBtn = e.target.closest(".cm-resolve");
    if(resolveBtn){
      e.stopPropagation();
      resolveToggle(resolveBtn.closest(".cm-card").dataset.cmid);
      return;
    }
    const ignoreBtn = e.target.closest(".cm-ignore");
    if(ignoreBtn){
      e.stopPropagation();
      ignoreComment(ignoreBtn.closest(".cm-card").dataset.cmid);
      return;
    }
    const t = e.target.closest(".cm-card");
    if(t) scrollToHighlight(t.dataset.cmid);
  });

  function fallbackCopy(text){
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // 审阅区滚动时更新底部状态栏的当前页码
  const _docScroll = document.querySelector('.td-doc-scroll');
  if(_docScroll) _docScroll.addEventListener('scroll', updatePageStatus, { passive: true });
  window.addEventListener('resize', updatePageStatus);

  // 统一工作区入口：接收首页已解析的正文、富文本参考文献和原文件定位信息。
  window.CitationReviewerPage = Object.freeze({
    applyWorkspaceDocument(d){
      d = d || {};
      if(d.sourceType === 'pdf'){
        applyPdfDocument({
          ...d,
          body:d.bodyText || '',
          references:d.referencesText || ''
        }, d.fileName || '', false).catch(error => showImportMsg('err', 'PDF 原文视图加载失败：' + (error?.message || error)));
        return;
      }
      currentSourceType = d.sourceType || 'paste';
      currentPdfBytes = null;
      currentPdfLabels = null;
      lastBodySourceBlocks = [];
      lastReferenceSourceBlocks = [];
      if(pdfViewer) pdfViewer.destroy();
      const body = document.getElementById('txtBody');
      if(body) body.value = d.bodyText || '';
      lastBodyParagraphs = d.hasPageInfo && Array.isArray(d.bodyBlocks)
        ? d.bodyBlocks.filter(x => x && x.text).map(x => ({ text:x.text, page:Number(x.page)||null }))
        : null;
      const blocks = Array.isArray(d.referenceBlocks) ? d.referenceBlocks : [];
      if(blocks.length){
        editor.innerHTML = sanitizeEditorHtml(blocks.map(x => `<div${Number(x.page)>0?` data-page="${Number(x.page)}"`:''}>${x.html || escapeHtml(x.text || '')}</div>`).join(''));
        Array.from(editor.children).forEach((line,index) => { const page=Number(blocks[index]?.page); if(page>0)line.dataset.page=String(page); });
      }else if(d.referencesHtml){
        editor.innerHTML = sanitizeEditorHtml(d.referencesHtml);
      }else{
        setEditorFromText(d.referencesText || '');
      }
      updateFileNameBadge(d.fileName || '');
    }
  });

  // 初始：进入编辑视图
  showEdit();
  document.documentElement.dataset.citationReviewerReady = "true";
