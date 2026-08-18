/* 手机端增强：批注抽屉开关、计数同步、点击高亮打开抽屉并跳转对应批注 */
(function () {
  'use strict';

  var panel = document.getElementById('commentsPanel');
  var toggle = document.getElementById('mobileCommentsToggle');
  var mobileCount = document.getElementById('mobileCmCount');
  var cmCount = document.getElementById('cmCount');
  var cmList = document.getElementById('cmList');
  var docView = document.getElementById('docView');

  /* ---------- 1. 批注抽屉开关 ---------- */
  if (panel && toggle) {
    toggle.addEventListener('click', function (e) {
      e.stopPropagation(); // 防止冒泡到 document 的"点外部收起"
      panel.classList.toggle('open');
    });
  }

  /* ---------- 2. 计数同步（cmCount 实时同步到悬浮按钮 badge） ---------- */
  function syncCount() {
    if (cmCount && mobileCount) {
      mobileCount.textContent = cmCount.textContent;
    }
  }
  if (cmList && 'MutationObserver' in window) {
    new MutationObserver(syncCount).observe(cmList, { childList: true, subtree: true });
  }
  if (cmCount && 'MutationObserver' in window) {
    new MutationObserver(syncCount).observe(cmCount, { childList: true, characterData: true });
  }
  syncCount();

  /* ---------- 3. 点击高亮 → 打开抽屉并跳转对应批注卡片 ---------- */
  function openCommentForCmid(cmid) {
    if (!panel || !cmid) return;
    panel.classList.add('open');
    var card = cmList ? cmList.querySelector('.cm-card[data-cmid="' + cmid + '"]') : null;
    if (!card) return;
    // 等抽屉展开动画后再滚动，确保定位正确
    requestAnimationFrame(function () {
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card.classList.add('flash-cm');
      setTimeout(function () { card.classList.remove('flash-cm'); }, 1000);
    });
  }

  // 手机端：拦截高亮的点击，打开抽屉并跳转，阻止 app.js 的页面滚动跳转
  if (docView && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
    docView.addEventListener('click', function (e) {
      var hl = e.target.closest && e.target.closest('.hl');
      if (!hl) return;
      e.stopPropagation(); // 阻止 app.js 的 scrollToComment（页面滚动）
      e.preventDefault();
      openCommentForCmid(hl.getAttribute('data-cmid'));
    }, true);

    // 抽屉展开后，点击抽屉外部区域即收起（排除悬浮触发按钮与抽屉内部）
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(e.target)) return;
      if (toggle && toggle.contains(e.target)) return;
      panel.classList.remove('open');
    });
  }
})();
