/* APA 7 parameter-override profile loader. JSON profiles cannot execute code. */
(function () {
  'use strict';
  const profiles = Object.create(null);
  let activeId = 'apa7';
  function plainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function merge(base, override) {
    const result = plainObject(base) ? clone(base) : {};
    if (!plainObject(override)) return result;
    Object.keys(override).forEach(function (key) {
      const value = override[key];
      result[key] = plainObject(value) && plainObject(result[key]) ? merge(result[key], value) : clone(value);
    });
    return result;
  }
  function validate(profile) {
    const errors = [];
    if (!plainObject(profile)) return { ok: false, errors: ['规则必须是 JSON 对象。'] };
    if (profile.schemaVersion !== 1) errors.push('schemaVersion 必须为 1。');
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(profile.id || '')) errors.push('id 缺失或格式无效。');
    if (typeof profile.name !== 'string' || !profile.name.trim()) errors.push('name 缺失。');
    if (profile.baseStyle != null && typeof profile.baseStyle !== 'string') errors.push('baseStyle 必须是字符串。');
    if (profile.config != null && !plainObject(profile.config)) errors.push('config 必须是对象。');
    const independent = profile.ruleType === 'independent';
    if (profile.id === 'apa7' && (profile.baseStyle != null || independent)) {
      errors.push('内置 APA 7 规则不能继承其他规则。');
    } else if (independent) {
      if (profile.baseStyle != null) errors.push('独立引用体系不能设置 baseStyle。');
      if (!plainObject(profile.rules)) errors.push('独立引用体系必须提供 rules 对象。');
    } else if (profile.id && profile.id !== 'apa7' && profile.baseStyle !== 'apa7') {
      errors.push('当前版本的自定义规则必须继承 APA 7（baseStyle: "apa7"），且只能覆盖参数。');
    }
    return { ok: errors.length === 0, errors: errors };
  }
  function register(profile) {
    const checked = validate(profile);
    if (!checked.ok) return checked;
    profiles[profile.id] = clone(profile);
    return { ok: true, errors: [] };
  }
  function resolve(id, path) {
    const profile = profiles[id];
    if (!profile) throw new Error('找不到规则配置：' + id);
    path = path || [];
    if (path.indexOf(id) >= 0) throw new Error('规则继承出现循环：' + path.concat([id]).join(' -> '));
    // 当前只有 APA 7 是完整引用体系；其他 JSON 条目只是其参数覆盖层。
    // 将来支持 Chicago、MLA 等体系时，应注册独立算法规则包，而不是在此继承 APA 7。
    if (!profile.baseStyle) return clone(profile);
    const base = resolve(profile.baseStyle, path.concat([id]));
    const resolved = merge(base, profile);
    resolved.id = profile.id;
    resolved.name = profile.name;
    resolved.version = profile.version || base.version || '';
    resolved.baseStyle = profile.baseStyle;
    return resolved;
  }
  function activate(id) {
    try { resolve(id); activeId = id; return { ok: true, errors: [] }; }
    catch (error) { return { ok: false, errors: [String(error.message || error)] }; }
  }
  window.RuleProfiles = {
    register: register, validate: validate, resolve: resolve, activate: activate,
    getActive: function () { return resolve(activeId); },
    list: function () { return Object.keys(profiles).map(function (id) { return clone(profiles[id]); }); }
  };
})();
