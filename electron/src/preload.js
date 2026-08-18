const { contextBridge, ipcRenderer } = require('electron');

// 与 macOS RuleProfileStore 一致的校验逻辑
function validateRuleObject(obj) {
  const errors = [];
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { ok: false, errors: ['规则 JSON 不是合法的对象。'] };
  }
  if (obj.schemaVersion !== 1) {
    errors.push('schemaVersion 必须为 1。');
  }
  const id = obj.id;
  if (typeof id !== 'string' || !id) {
    errors.push('缺少合法的 id。');
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    errors.push('id 格式不合法（只能包含字母、数字、. _ -，且不能以符号开头）。');
  }
  const name = obj.name;
  if (typeof name !== 'string' || !name.trim()) {
    errors.push('缺少合法的 name。');
  }
  if (id === 'apa7') {
    if (obj.baseStyle !== undefined || obj.ruleType === 'independent') {
      errors.push('apa7 是内置规则 ID，不能被用户规则覆盖。');
    }
  } else {
    const isIndependent = obj.ruleType === 'independent';
    if (isIndependent) {
      if (obj.baseStyle !== undefined) {
        errors.push('独立体系规则不应包含 baseStyle。');
      }
      if (typeof obj.rules !== 'object' || obj.rules === null) {
        errors.push('独立体系规则需要 rules 对象。');
      }
      if (typeof obj.config !== 'object' || obj.config === null) {
        errors.push('独立体系规则需要 config 对象。');
      }
      for (const group of ['reference', 'inTextStructural', 'inTextStyle']) {
        const rules = obj.rules && obj.rules[group];
        if (rules !== undefined && !Array.isArray(rules)) {
          errors.push(`rules.${group} 必须是数组。`);
          continue;
        }
        for (const rule of (rules || [])) {
          if (!rule || typeof rule.pattern !== 'string') {
            errors.push(`rules.${group} 中的检查项缺少字符串 pattern。`);
            continue;
          }
          if (!['mustMatch', 'mustNotMatch'].includes(rule.condition)) {
            errors.push(`规则 ${rule.id || '(no id)'} 的 condition 必须是 mustMatch 或 mustNotMatch。`);
          }
          try { new RegExp(rule.pattern, rule.flags || 'i'); }
          catch (e) { errors.push(`规则 ${rule.id || '(no id)'} 的正则表达式无效：${e.message}`); }
        }
      }
    } else {
      if (obj.baseStyle !== 'apa7') {
        errors.push('APA 参数覆盖须使用 baseStyle: "apa7"；其他体系须使用不含 baseStyle 的 independent JSON 规则。');
      }
    }
  }
  if (obj.config !== undefined && (typeof obj.config !== 'object' || obj.config === null)) {
    errors.push('config 必须是对象。');
  }
  return { ok: errors.length === 0, errors };
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 触发原生文件选择对话框导入规则 JSON
  importRuleFile: () => ipcRenderer.invoke('rule:import'),
  // 读取已安装规则列表（含内置 apa7）
  getProfiles: () => ipcRenderer.invoke('rule:list'),
  // 获取经主进程校验的完整规则，供本地声明式规则运行时使用。
  getRuleRuntimeBundle: () => ipcRenderer.invoke('rule:getRuntimeBundle'),
  // 设置当前激活规则
  setActiveProfile: (id) => ipcRenderer.invoke('rule:setActive', id),
  // 读取当前激活规则 id
  getActiveProfile: () => ipcRenderer.invoke('rule:getActive'),
  // 主进程通知规则变化
  onProfilesUpdated: (cb) => ipcRenderer.on('rule:updated', (_e, payload) => cb(payload)),
  // 主进程导航到设置页（文件菜单触发）
  onNavSettings: (cb) => ipcRenderer.on('nav:settings', (_e, section) => cb(section)),
  // 主进程菜单触发导入后的结果回传
  onRuleImportResult: (cb) => ipcRenderer.on('rule:importResult', (_e, r) => cb(r)),
  // 主进程菜单“导入 Word 文档”触发页面内导入
  onMenuImportWord: (cb) => ipcRenderer.on('menu:importWord', () => cb()),
  // 校验规则对象（供页面在导入前预览）
  validateRule: (obj) => validateRuleObject(obj),
});
