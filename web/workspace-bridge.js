(function () {
  'use strict';
  const targetOrigin = () => location.protocol === 'file:' ? '*' : location.origin;
  const acceptsOrigin = e => location.protocol === 'file:' ? true : e.origin === location.origin;
  if (window.parent !== window) document.documentElement.dataset.workspaceEmbedded = 'true';
  let applying = false;
  let lastAutoRunKey = '';
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function refsHtml(d) {
    if (d.referencesHtml) return d.referencesHtml;
    const blocks = d.referenceBlocks && d.referenceBlocks.length ? d.referenceBlocks.map(b => b.html || esc(b.text)) : String(d.referencesText || '').split(/\n\s*\n|\n/).filter(Boolean).map(esc);
    return blocks.map(html => '<div>' + html + '</div>').join('');
  }
  function apply(d) {
    applying = true;
    if (window.CitationReviewerPage?.applyWorkspaceDocument) window.CitationReviewerPage.applyWorkspaceDocument(d);
    if (window.CitationReportPage?.applyWorkspaceDocument) window.CitationReportPage.applyWorkspaceDocument(d);
    const body = document.getElementById('txtBody');
    const editor = document.getElementById('editor');
    const report = document.getElementById('documentInput');
    const refs = document.getElementById('refs');
    const distribution = document.getElementById('docInput');
    if (body && !window.CitationReviewerPage) { body.value = d.bodyText || ''; body.dispatchEvent(new Event('input', { bubbles: true })); }
    if (editor && !window.CitationReviewerPage) { editor.innerHTML = refsHtml(d); editor.dispatchEvent(new Event('input', { bubbles: true })); }
    if (report && !window.CitationReportPage) { report.value = d.fullText || [d.bodyText, d.referencesText].filter(Boolean).join('\n\nReferences\n'); report.dispatchEvent(new Event('input', { bubbles: true })); }
    if (refs) {
      if (refs.isContentEditable && window.CitationVerifierEditor) window.CitationVerifierEditor.setHtml(refsHtml(d));
      else if (refs.isContentEditable) refs.textContent = d.referencesText || d.fullText || '';
      else refs.value = d.referencesText || d.fullText || '';
      refs.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (distribution) { distribution.value = d.fullText || [d.bodyText, d.referencesText].filter(Boolean).join('\n\nReferences\n'); distribution.dispatchEvent(new Event('input', { bubbles: true })); }
    applying = false;
    autoRun(d);
  }
  function autoRun(d) {
    const content = String(d.fullText || d.referencesText || '').trim();
    if (!content) return;
    const key = location.pathname + '|' + content.length + '|' + content.slice(0, 80) + '|' + content.slice(-80);
    if (key === lastAutoRunKey) return;
    lastAutoRunKey = key;
    const button = document.getElementById('btnCheck') || document.getElementById('run') || document.getElementById('runReport') || document.getElementById('btnRun');
    if (!button) return;
    setTimeout(() => { if (!button.disabled) button.click(); }, 80);
  }
  function notify() {
    if (applying) return;
    const body = document.getElementById('txtBody'), editor = document.getElementById('editor'), report = document.getElementById('documentInput'), refs = document.getElementById('refs'), distribution = document.getElementById('docInput');
    const refsText = editor?.textContent || (refs?.isContentEditable ? refs.textContent : refs?.value) || '';
    const refsRichHtml = editor?.innerHTML || (refs?.isContentEditable ? refs.innerHTML : '') || '';
    const fullText = report?.value || distribution?.value || [body?.value || '', refsText].filter(Boolean).join('\n\nReferences\n');
    window.parent !== window && window.parent.postMessage({ type: 'cr:document-update', document: { fullText, bodyText: body?.value || '', referencesText: refsText, referencesHtml: refsRichHtml } }, targetOrigin());
  }
  window.addEventListener('message', e => { if (e.source !== window.parent || !acceptsOrigin(e) || e.data?.type !== 'cr:document') return; apply(e.data.document || {}); });
  window.CitationWorkspaceBridge = Object.freeze({ apply });
  ['txtBody', 'editor', 'documentInput', 'refs', 'docInput'].forEach(id => document.getElementById(id)?.addEventListener('input', notify));
  window.parent !== window && window.parent.postMessage({ type: 'cr:request-document' }, targetOrigin());
})();
