/* ==================================================================
 * prelude.js — JavaScriptCore 全局环境初始化
 * ------------------------------------------------------------------
 * 在加载 rules-apa7.js / rules-loader.js / driver.js 之前执行，
 * 模拟浏览器环境（window / localStorage / console），
 * 与 Node 版 detect.js 中的 global.window = global 等价。
 * ================================================================== */

// 注意：此文件不可使用 'use strict'，因为需要给未声明的全局标识符 window/localStorage/console 赋值。
var memStore = {};

var window = globalThis;
window.window = window;

window.localStorage = {
  getItem: function (k) { return (k in memStore) ? memStore[k] : null; },
  setItem: function (k, v) { memStore[k] = String(v); },
  removeItem: function (k) { delete memStore[k]; }
};

if (typeof console === 'undefined') {
  console = { log: function () {}, error: function () {}, warn: function () {} };
}
