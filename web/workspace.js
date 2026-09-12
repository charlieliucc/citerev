(function () {
  'use strict';
  const KEY = 'cr_workspace_document_v1';
  const $ = id => document.getElementById(id);
  const input = $('workspaceInput'), file = $('workspaceFile'), message = $('workspaceMessage');
  const start = $('workspaceStart'), workspace = $('workspaceMain'), frame = $('workspaceFrame'), fileName = $('workspaceFileName');
  const startNav = $('workspaceStartNav');
  const tabs = [...document.querySelectorAll('[data-workspace-tab]')];
  const sloganLead = $('sloganLead'), sloganAccent = $('sloganAccent');
  const routes = { full: 'full-check.html', format: 'format-only.html', verify: 'verify.html', dist: 'distribution.html', report: 'report.html' };
  const labels = { full: '全文检查', format: '格式检查', verify: '真伪检查', dist: '分析分布', report: '一键分析' };
  let preferredTab = 'full';
  const slogans = [
    { lead: '交稿前，先用', accent: '引用审查' },
    { lead: '查全文·查格式·查真伪·查分布，', accent: '一键出报告' }
  ];
  function startSloganTyping() {
    if (!sloganLead || !sloganAccent) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { sloganLead.textContent = slogans[0].lead; sloganAccent.textContent = slogans[0].accent; return; }
    let phrase = 0, position = 0;
    const tick = () => {
      const item = slogans[phrase], full = item.lead + item.accent;
      position += 1;
      const shown = full.slice(0, position);
      sloganLead.textContent = shown.slice(0, item.lead.length);
      sloganAccent.textContent = shown.slice(item.lead.length);
      if (position >= full.length) {
        setTimeout(() => {
          sloganLead.textContent = '';
          sloganAccent.textContent = '';
          phrase = (phrase + 1) % slogans.length;
          position = 0;
          setTimeout(tick, 500);
        }, 4000);
      } else setTimeout(tick, 92);
    };
    setTimeout(tick, 320);
  }
  const engineReady = window.CitationReportEngine?.parseDocx ? Promise.resolve() : new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'report-engine.js?v=20260818-rich2'; script.onload = resolve; script.onerror = () => reject(new Error('Word 解析模块加载失败')); document.head.appendChild(script); });
  let doc = { fileName: '', sourceType: 'paste', fullText: '', fullHtml: '', bodyText: '', referencesText: '', referencesHtml: '', bodyBlocks: [], referenceBlocks: [], hasPageInfo: false, pdfBytes: null, pageCount: 0, pageLabels: null };
  let framePdfSent = false;
  function save() { try { const { pdfBytes, ...persisted } = doc; sessionStorage.setItem(KEY, JSON.stringify(persisted)); } catch (_) {} }
  function load() { try { const x = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (x && typeof x === 'object') doc = Object.assign(doc, x); } catch (_) {} }
  function splitText(text) { const s = window.CitationReferenceSplitter?.splitDocumentSections(text) || { found: false, body: '', references: text }; return { bodyText: s.found ? s.body : '', referencesText: (s.found ? s.references : text).trim() }; }
  function setMessage(text, error) { message.textContent = text || ''; message.className = error ? 'workspace-message error' : 'workspace-message'; }
  function inputText() { return (input.innerText || input.textContent || '').replace(/\u00a0/g, ' ').trim(); }
  function safePasteHtml(html) { const parsed = new DOMParser().parseFromString(html || '', 'text/html'); const out = document.createElement('div'); const copy = (node, parent) => { if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.nodeValue || '')); return; } if (node.nodeType !== Node.ELEMENT_NODE) return; const tag = node.tagName.toLowerCase(), allowed = {p:'div',div:'div',br:'br',em:'em',i:'em',strong:'strong',b:'strong'}[tag]; const next = allowed ? document.createElement(allowed) : parent; if (allowed) parent.appendChild(next); [...node.childNodes].forEach(child => copy(child, next)); }; [...parsed.body.childNodes].forEach(node => copy(node, out)); return out.innerHTML; }
  function referenceHtmlFromFull(html) { if (!html) return ''; const box = document.createElement('div'); box.innerHTML = safePasteHtml(html); const blocks = [...box.children]; let heading = -1; blocks.forEach((el, i) => { if (/^(?:references?|reference\s+list|works\s+cited|bibliograph(?:y|ies)|literature\s+cited|参考文献|参考资料)\s*[:：.]?$/i.test((el.textContent || '').trim())) heading = i; }); return (heading >= 0 ? blocks.slice(heading + 1) : blocks).map(el => el.outerHTML).join(''); }
  function setStartActive(active) { startNav.classList.toggle('active', active); if (active) startNav.setAttribute('aria-current', 'page'); else startNav.removeAttribute('aria-current'); }
  function updateStart(forceStart) { const showStart = !!forceStart || !doc.fullText; if (showStart) input.innerHTML = doc.fullHtml || (doc.fullText || doc.referencesText || '').split(/\n/).map(x => '<div>' + x.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) + '</div>').join(''); fileName.textContent = doc.fileName ? '📄 ' + doc.fileName : ''; fileName.hidden = !doc.fileName; start.hidden = !showStart; workspace.hidden = showStart; document.body.classList.toggle('workspace-active', !showStart); setStartActive(showStart); if (showStart) tabs.forEach(t => { t.classList.remove('active'); t.removeAttribute('aria-current'); }); }
  const targetOrigin = () => location.protocol === 'file:' ? '*' : location.origin;
  const acceptsOrigin = e => location.protocol === 'file:' ? true : e.origin === location.origin;
  function send() {
    if (!frame.contentWindow) return;
    let appliedDirectly = false;
    const directPayload = doc.pdfBytes && framePdfSent ? { ...doc, pdfBytes: null, pdfDocumentRetained: true } : doc;
    try { if (frame.contentWindow.CitationWorkspaceBridge?.apply) { frame.contentWindow.CitationWorkspaceBridge.apply(directPayload); appliedDirectly = true; } } catch (_) {}
    const omitPdf = doc.pdfBytes && (appliedDirectly || framePdfSent);
    const payload = omitPdf ? { ...doc, pdfBytes: null, pdfDocumentRetained: true } : doc;
    frame.contentWindow.postMessage({ type: 'cr:document', document: payload }, targetOrigin());
    if (doc.pdfBytes) framePdfSent = true;
  }
  function markFrameEmbedded() {
    try {
      const cd = frame.contentDocument;
      if (!cd) return;
      cd.documentElement.dataset.workspaceEmbedded = 'true';
    } catch (_) {}
  }
  function syncFrame() { markFrameEmbedded(); send(); setTimeout(send, 100); setTimeout(send, 400); }
  function selectFeature(key) { preferredTab = routes[key] ? key : 'full'; document.querySelectorAll('[data-start-feature]').forEach(button => { const active = button.dataset.startFeature === preferredTab; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active ? 'true' : 'false'); }); const pasted = inputText(); if (!doc.fullText && pasted) return setDocument(pasted, { sourceType: 'paste' }); if (doc.fullText) { updateStart(false); openTab(preferredTab); } else setMessage('请先粘贴论文全文或参考文献，或导入 Word / PDF 文档。'); }
  function openTab(key) { preferredTab = routes[key] ? key : 'full'; framePdfSent = false; setStartActive(false); tabs.forEach(t => { const active = t.dataset.workspaceTab === preferredTab; t.classList.toggle('active', active); if (active) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); }); frame.src = routes[preferredTab] + '?embed=1'; }
  function setDocument(text, meta) { const parts = splitText(text),fullHtml=safePasteHtml(input.innerHTML); doc = Object.assign(doc, { ...parts, fullText: text.trim(), fullHtml, referencesHtml: referenceHtmlFromFull(fullHtml), sourceType: meta?.sourceType || 'paste', fileName: meta?.fileName || '', bodyBlocks: [], referenceBlocks: [], hasPageInfo: false, pdfBytes: null, pageCount: 0, pageLabels: null }); save(); updateStart(); openTab(preferredTab); setMessage('文档已准备好，已进入“' + labels[preferredTab] + '”。'); }
  async function importFile() {
    const f = file.files?.[0];
    if (!f) return;
    const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    setMessage('正在本地读取 ' + f.name + ' …');
    try {
      let result;
      if (isPdf) {
        if (!window.CitationPdfImporter?.parse) throw new Error('PDF 解析模块未加载');
        result = await window.CitationPdfImporter.parse(f, (page, total) => setMessage('正在本地解析 PDF：' + page + ' / ' + total + ' 页…'));
      } else {
        await engineReady;
        if (!window.CitationReportEngine?.parseDocx) throw new Error('Word 解析模块未加载');
        result = await window.CitationReportEngine.parseDocx(f);
      }
      doc = Object.assign(doc, {
        fileName: f.name,
        sourceType: isPdf ? 'pdf' : 'word',
        fullText: result.text || '',
        fullHtml: '',
        bodyText: result.body || '',
        referencesText: result.references || '',
        bodyBlocks: result.bodyBlocks || [],
        referenceBlocks: result.referenceBlocks || [],
        referencesHtml: '',
        hasPageInfo: !!result.hasPageInfo,
        pdfBytes: result.pdfBytes || null,
        pageCount: result.pageCount || 0,
        pageLabels: result.pageLabels || null,
        styleInfoAvailable: result.styleInfoAvailable !== false
      });
      save();
      updateStart(true);
      setMessage('已导入 ' + f.name + (isPdf ? '，已保留原版式与定位信息' : '') + '，点击「开始」进入“' + labels[preferredTab] + '”。');
    } catch (e) {
      setMessage((isPdf ? 'PDF' : 'Word') + ' 导入失败：' + (e.message || e), true);
    } finally { file.value = ''; }
  }
  const featurePicker = document.createElement('div');
  featurePicker.className = 'workspace-feature-picker';
  featurePicker.setAttribute('aria-label', '选择要使用的功能');
  featurePicker.innerHTML = '<button type="button" class="workspace-feature active" data-start-feature="full" aria-pressed="true"><b>全文检查</b><span>核对正文引用与参考文献</span></button><button type="button" class="workspace-feature" data-start-feature="format" aria-pressed="false"><b>格式检查</b><span>只检查参考文献格式</span></button><button type="button" class="workspace-feature" data-start-feature="verify" aria-pressed="false"><b>真伪检查</b><span>与公开来源逐字段核对</span></button><button type="button" class="workspace-feature" data-start-feature="dist" aria-pressed="false"><b>分析分布</b><span>图表查看引用、年份、作者与类型</span></button><button type="button" class="workspace-feature" data-start-feature="report" aria-pressed="false"><b>一键分析</b><span>一次生成综合报告</span></button>';
  input.parentNode.insertBefore(featurePicker, input);
  const featureStyle = document.createElement('style');
  featureStyle.textContent = '.workspace-feature-picker{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 20px}.workspace-feature{border:1px solid var(--ws-line);background:#f8fbff;color:var(--ws-ink);border-radius:11px;padding:14px 15px;text-align:left;cursor:pointer}.workspace-feature b,.workspace-feature span{display:block}.workspace-feature b{font-size:15px;margin-bottom:4px}.workspace-feature span{color:var(--ws-muted);font-size:12px}.workspace-feature.active{border-color:var(--ws-green);background:var(--ws-soft);box-shadow:0 0 0 1px var(--ws-green)}@media(max-width:700px){.workspace-feature-picker{grid-template-columns:1fr}}';
  document.head.appendChild(featureStyle);
  featurePicker.querySelectorAll('[data-start-feature]').forEach(button => button.addEventListener('click', () => { preferredTab = button.dataset.startFeature; document.querySelectorAll('[data-start-feature]').forEach(b => { const active = b.dataset.startFeature === preferredTab; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active ? 'true' : 'false'); }); setMessage('已选择「' + labels[preferredTab] + '」，点击「开始」进入。'); }));
  const startBtn = $('workspaceStartBtn');
  if (startBtn) startBtn.addEventListener('click', () => { const pasted = inputText(); if (!doc.fullText && !(pasted || doc.referencesText)) { setMessage('请先粘贴论文全文或参考文献，或导入 Word / PDF 文档。'); return; } selectFeature(preferredTab); });
  startNav.addEventListener('click', () => updateStart(true));
  $('workspaceImport').addEventListener('click', () => file.click()); file.addEventListener('change', importFile);
  input.addEventListener('paste', e => { const html = e.clipboardData?.getData('text/html'); if (!html) return; e.preventDefault(); const safe = safePasteHtml(html); document.execCommand('insertHTML', false, safe); });
  $('workspaceClear').addEventListener('click', () => { doc = { fileName: '', sourceType: 'paste', fullText: '', fullHtml: '', bodyText: '', referencesText: '', referencesHtml: '', bodyBlocks: [], referenceBlocks: [], hasPageInfo: false, pdfBytes: null, pageCount: 0, pageLabels: null }; try { sessionStorage.removeItem(KEY); } catch (_) {} input.innerHTML=''; updateStart(); setMessage('已清空当前文档。'); });
  tabs.forEach(t => t.addEventListener('click', () => selectFeature(t.dataset.workspaceTab))); frame.addEventListener('load', syncFrame);
  window.addEventListener('message', e => { if (e.source !== frame.contentWindow || !acceptsOrigin(e) || !e.data) return; if (e.data.type === 'cr:request-document') send(); if (e.data.type === 'cr:document-update' && e.data.document) { doc = Object.assign(doc, e.data.document); save(); updateStart(); } });
  startSloganTyping(); load(); updateStart(); if (doc.fullText) openTab('full');
})();
