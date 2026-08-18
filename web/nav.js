/* =====================================================================
   统一导航栏（citerev/web 全站共用）
   - 根据当前页面 URL 自动高亮 active 项，无需在各页面手动加 class。
   - 使用 DOM 构建注入，兼容 file:// 与 https:// 两种打开方式（不依赖 fetch）。
   - 自动读取 localStorage["cr_current_file"] 显示当前导入的 Word 文件名，
     并在同域其他页面/页签写入时实时更新。
   - 若本页面位于 iframe 内（选项卡模式），则不重复注入导航栏。
   修改导航结构 / 链接 / 文案 / 品牌名，只需改本文件一处。
   ===================================================================== */
(function () {
  "use strict";

  // 选项卡模式下，iframe 内部页面不再注入顶部导航栏（外层已有），避免双层
  if (window.self !== window.top) return;

  // 当前页面是否位于 verifier 子目录
  var inVerifier = /(^|\/)verifier\//.test(location.pathname);
  var p = inVerifier ? "../" : ""; // 相对于 web 根的前缀

  // 导航项定义：key / 文案 / 链接 / 匹配规则（用于判定 active）
  var items = [
    { key: "home",    label: "开始",     href: p + "index.html",                       test: function (u) { return /(^|\/)citerev\/?$/i.test(u) || /(^|\/)citerev\/index\.html$/i.test(u); } },
    { key: "full",    label: "全文检查", href: p + "full-check.html",                 test: function (u) { return /full-check\.html$/i.test(u); } },
    { key: "format",  label: "格式检查", href: p + "format-only.html",                 test: function (u) { return /format-only\.html$/i.test(u); } },
    { key: "verify",  label: "真伪检查", href: p + "verify.html",                    test: function (u) { return /verify\.html$/i.test(u); } },
    { key: "dist",    label: "分析分布", href: p + "distribution.html",                test: function (u) { return /distribution\.html$/i.test(u); } },
    { key: "report",  label: "一键分析", href: p + "report.html",                      test: function (u) { return /report\.html$/i.test(u); } },
    { key: "about",   label: "关于",     href: p + "about.html",                         test: function (u) { return /about\.html$/i.test(u); } }
  ];

  var path = location.pathname;
  var activeKey = "home";
  for (var i = 0; i < items.length; i++) {
    if (items[i].test(path)) { activeKey = items[i].key; break; }
  }
  // 兜底：若未命中，按文件名推断
  if (activeKey === "home") {
    if (/format-only\.html$/i.test(path)) activeKey = "format";
    else if (/report\.html$/i.test(path)) activeKey = "report";
    else     if (/verify\.html$/i.test(path)) activeKey = "verify";
    else if (/distribution\.html$/.test(path)) activeKey = "dist";
    else if (/full-check\.html$/.test(path)) activeKey = "full";
    else if (/about\.html$/.test(path)) activeKey = "about";
  }

  var logoSrc = inVerifier ? "../logo.png" : "logo.png";

  // 构建 DOM
  var header = document.createElement("header");
  header.className = "cr-topbar";

  var brand = document.createElement("a");
  brand.className = "cr-brand";
  brand.href = p + "index.html";
  brand.setAttribute("aria-label", "引用审查网页版首页");
  var logo = document.createElement("img");
  logo.className = "logo";
  logo.src = logoSrc;
  logo.alt = "";
  brand.appendChild(logo);
  var span = document.createElement("span");
  span.textContent = "引用审查 CiteRev";
  brand.appendChild(span);
  var small = document.createElement("small");
  small.textContent = "Web";
  brand.appendChild(small);
  header.appendChild(brand);

  var nav = document.createElement("nav");
  nav.className = "cr-mainnav";
  nav.setAttribute("aria-label", "功能导航");
  items.forEach(function (it) {
    var a = document.createElement("a");
    a.href = it.href;
    a.textContent = it.label;
    if (it.key === activeKey) {
      a.className = "active";
      a.setAttribute("aria-current", "page");
    }
    nav.appendChild(a);
  });
  header.appendChild(nav);

  var desk = document.createElement("a");
  desk.className = "cr-desktop";
  desk.href = "https://charlieliucc.github.io/citerev/#download";
  desk.target = "_blank";
  desk.rel = "noopener";
  desk.innerHTML = '<span>桌面端</span><small>离线分析更放心</small><b aria-hidden="true">↗</b>';
  header.appendChild(desk);

  // 注入到 body 顶部
  document.body.insertBefore(header, document.body.firstChild);
})();
