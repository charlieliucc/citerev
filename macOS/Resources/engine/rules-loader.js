/* ==================================================================
 * 规则加载器（rules-loader.js）
 * ------------------------------------------------------------------
 * 负责：
 *   - 内置风格包注册表（默认 APA7）
 *   - 加载 / 切换当前风格包
 *   - 校验风格包结构是否合法
 *   - 管理完整算法风格包（当前仅内置 APA 7）
 *   - 向规则包注入共享工具 ctx
 * 主引擎（taskpane.js）只通过 window.RulesManager.current 使用规则。
 * ================================================================== */

(function () {
  'use strict';

  // 预留给未来独立算法规则包；APA 7 参数覆盖由 RuleProfiles 管理。
  const CUSTOM_KEY = 'citationRulesCustomPacks';
  // 当前选中的风格包 id
  const ACTIVE_KEY = 'citationRulesActiveId';

  const BUILT_IN = ['apa7'];

  // 从 localStorage 读取
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
  }

  // 读取已导入的自定义包（数组）
  function getCustomPacks() {
    return loadJSON(CUSTOM_KEY, []);
  }
  function setCustomPacks(list) {
    saveJSON(CUSTOM_KEY, list);
  }

  /* ------------------------------------------------------------
   * 共享工具 ctx：主引擎注入，供规则包调用。
   * ------------------------------------------------------------ */
  const ctx = {};

  // 由主引擎调用，注入基础工具（在主引擎脚本执行时调用一次）
  function setCtx(helpers) {
    for (const k of Object.keys(helpers)) ctx[k] = helpers[k];
    ctx.getCurrent = getCurrent; // 供规则内部引用当前包（可选）
  }

  /* ------------------------------------------------------------
   * 校验一个候选包结构是否合法。
   * 返回 { ok:true, errors:[] } 或 { ok:false, errors:[...] }
   * ------------------------------------------------------------ */
  function validate(ruleSet) {
    const errors = [];
    if (!ruleSet || typeof ruleSet !== 'object') {
      return { ok: false, errors: ['规则包必须是一个对象。'] };
    }
    if (!ruleSet.id || typeof ruleSet.id !== 'string') {
      errors.push('缺少字符串字段 id。');
    }
    if (typeof ruleSet.lintReference !== 'function') {
      errors.push('缺少 lintReference 函数（单条参考条目检查）。');
    }
    if (typeof ruleSet.classify !== 'function') {
      errors.push('缺少 classify 函数（参考条目类型判定）。');
    }
    if (typeof ruleSet.detectInTextMismatches !== 'function') {
      errors.push('缺少 detectInTextMismatches 函数（文中引用不匹配检测）。');
    }
    if (typeof ruleSet.detectInTextStructural !== 'function') {
      errors.push('缺少 detectInTextStructural 函数（文中引用结构检测）。');
    }
    if (typeof ruleSet.detectInTextStyleWarnings !== 'function') {
      errors.push('缺少 detectInTextStyleWarnings 函数（文中引用样式警告）。');
    }
    if (typeof ruleSet.refOrderCompare !== 'function') {
      errors.push('缺少 refOrderCompare 函数（参考列表排序比较）。');
    }
    if (!(ruleSet.headingRegex instanceof RegExp)) {
      errors.push('缺少 headingRegex（参考文献标题识别正则）。');
    }
    if (!(ruleSet.nonRefMarkerRegex instanceof RegExp)) {
      errors.push('缺少 nonRefMarkerRegex（非参考文献条目过滤正则）。');
    }
    return { ok: errors.length === 0, errors };
  }

  // 当前生效的规则包（默认 APA7）
  let current = window.CitationRules || null;

  // 获取可用的规则包列表（内置 + 自定义导入的元信息）
  function listPacks() {
    const packs = [];
    const add = (id, name, version, builtin, source) => {
      packs.push({ id, name: name || id, version: version || '', builtin, source });
    };
    for (const id of BUILT_IN) {
      const rs = window[id + 'Rules'] || window.CitationRules;
      if (rs && rs.id === id) add(id, rs.name, rs.version, true, 'builtin');
    }
    for (const cp of getCustomPacks()) {
      add(cp.id, cp.name, cp.version, false, 'custom');
    }
    return packs;
  }

  // 按 id 找到已加载的规则对象（内置或自定义）
  function findLoaded(id) {
    if (window.CitationRules && window.CitationRules.id === id) return window.CitationRules;
    for (const b of BUILT_IN) {
      const rs = window[b + 'Rules'];
      if (rs && rs.id === id) return rs;
    }
    for (const cp of getCustomPacks()) {
      if (cp.id === id && window[cp._windowKey]) return window[cp._windowKey];
    }
    return null;
  }

  /* ------------------------------------------------------------
   * 切换 / 激活指定 id 的风格包。
   * 返回 { ok, errors }。
   * ------------------------------------------------------------ */
  function activate(id) {
    const rs = findLoaded(id);
    if (!rs) return { ok: false, errors: [`找不到风格包 "${id}"。`] };
    const v = validate(rs);
    if (!v.ok) return { ok: false, errors: v.errors };
    current = rs;
    saveJSON(ACTIVE_KEY, id);
    return { ok: true, errors: [] };
  }

  // 恢复上次激活的风格包
  function restoreActive() {
    const id = loadJSON(ACTIVE_KEY, 'apa7');
    activate(id);
  }

  // 获取当前规则包
  function getCurrent() {
    return current || window.CitationRules;
  }

  /* ------------------------------------------------------------
   * 注册已加载的独立算法风格包（预留能力，当前 App 不开放此入口）。
   * 支持：
   *   - JS 源码（IIFE 形式，自行挂到 window.xxxRules 或 window.CitationRules）
   *   - JSON 描述（{ id, name, version, source }）
   * 这里主要负责注册已挂载的全局对象为自定义包。
   * 返回 { ok, errors, id }
   * ------------------------------------------------------------ */
  function importPack(meta) {
    // meta: { id, name, version, source }
    if (!meta || !meta.id) return { ok: false, errors: ['缺少 id。'] };
    let loaded = null;
    // 若提供了全局键则从全局读取
    if (meta._windowKey && window[meta._windowKey]) {
      loaded = window[meta._windowKey];
    }
    if (!loaded) {
      // 兼容：id 对应的全局变量名（如 rules-chicago → window.chicagoRules）
      const guessed = window[meta.id + 'Rules'];
      if (guessed) loaded = guessed;
    }
    if (!loaded) {
      return { ok: false, errors: ['未找到该风格包的全局对象（需挂载为 window.<id>Rules）。'] };
    }
    const v = validate(loaded);
    if (!v.ok) return { ok: false, errors: v.errors };

    const list = getCustomPacks().filter(p => p.id !== meta.id);
    list.push({
      id: loaded.id,
      name: loaded.name || meta.name || loaded.id,
      version: loaded.version || meta.version || '',
      _windowKey: meta._windowKey || (meta.id + 'Rules')
    });
    setCustomPacks(list);
    return { ok: true, errors: [], id: loaded.id };
  }

  // 移除已导入的自定义包
  function removePack(id) {
    setCustomPacks(getCustomPacks().filter(p => p.id !== id));
    if (current && current.id === id) activate('apa7');
  }

  window.RulesManager = {
    ctx,
    setCtx,
    validate,
    listPacks,
    activate,
    restoreActive,
    getCurrent,
    importPack,
    removePack
  };
})();
