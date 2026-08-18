// 引用审查页 → 引证核验台 的跳转桥接
// 独立成外部文件，以满足 index.html 的 CSP（script-src 'self'，禁止内联脚本）
(function () {
  var overlay = document.getElementById('verifyOverlay');
  var editor = document.getElementById('editor');
  var VERIFY_URL = 'verify.html';

  function openOverlay() { if (overlay) overlay.classList.add('open'); }
  function closeOverlay() { if (overlay) overlay.classList.remove('open'); }

  function getEditorText() {
    return (editor && (editor.innerText || editor.textContent || '')).trim();
  }

  function getEditorHtml() {
    return (editor && editor.innerHTML || '').trim();
  }

  var btnVerify = document.getElementById('btnVerify');
  if (btnVerify) {
    btnVerify.addEventListener('click', function () {
      var text = getEditorText();
      if (!text && !window.confirm('参考文献框为空，仍要打开核验页面吗？')) return;
      openOverlay();
    });
  }

  var verifyCancel = document.getElementById('verifyCancel');
  if (verifyCancel) verifyCancel.addEventListener('click', closeOverlay);

  if (overlay) {
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
  }

  var verifyConfirm = document.getElementById('verifyConfirm');
  if (verifyConfirm) {
    verifyConfirm.addEventListener('click', function () {
      var text = getEditorText();
      try {
        if (text) {
          localStorage.setItem('citationReviewerRefs', text);
          localStorage.setItem('citationReviewerRefsHtml', getEditorHtml());
        }
      } catch (err) { /* file:// 或配额异常时忽略，新标签内用户可手动粘贴 */ }
      closeOverlay();
      // 新标签页打开核验页面（localStorage 同源跨标签页共享，故用 localStorage 传参）
      window.open(VERIFY_URL, '_blank');
    });
  }
})();
