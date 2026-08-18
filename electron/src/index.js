const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fsReal = require('fs');
const pathReal = require('path');

// Quit when all windows are closed (standard behavior on Windows/Linux)
app.on('window-all-closed', () => {
  app.quit();
});

// ---------- 规则管理（与 macOS RuleProfileStore 一致） ----------
const RULES_DIR = pathReal.join(app.getPath('userData'), 'Rules');
const ACTIVE_KEY = 'activeCitationRuleProfile';

function ensureRulesDir() {
  if (!fsReal.existsSync(RULES_DIR)) {
    fsReal.mkdirSync(RULES_DIR, { recursive: true });
  }
}

function builtInProfile() {
  return {
    schemaVersion: 1,
    id: 'apa7',
    name: 'APA 7th（内置）',
    version: '1.0.0',
    baseStyle: undefined,
    ruleType: undefined,
    description: '内置 APA 第 7 版引用检查规则。',
    isIndependentStyle: false,
    config: {
      headingKeywords: ['references', 'reference list', 'references cited', 'bibliography', 'bibliographies', 'works cited', 'works consulted', 'literature cited', 'sources consulted', 'sources referenced', '参考文献'],
      nonRefMarkers: ['response to feedback', '本次修改', '本次修订', '修订', '修改', '反馈', 'reviewer', 'comment', 'comments', 'revision', "editor's comment", 'note', '说明', '回复'],
      referenceOrder: 'author-year',
      referenceTypeLabel: '参考文献',
    },
  };
}

function userProfiles() {
  ensureRulesDir();
  const out = [];
  let entries = [];
  try {
    entries = fsReal.readdirSync(RULES_DIR);
  } catch {
    return out;
  }
  for (const file of entries) {
    if (!file.toLowerCase().endsWith('.json')) continue;
    const full = pathReal.join(RULES_DIR, file);
    try {
      const data = JSON.parse(fsReal.readFileSync(full, 'utf8'));
      if (data.id === 'apa7') continue; // 保留内置 ID
      out.push({
        schemaVersion: data.schemaVersion,
        id: data.id,
        name: data.name,
        version: data.version,
        baseStyle: data.baseStyle,
        ruleType: data.ruleType,
        description: data.description,
        isIndependentStyle: data.ruleType === 'independent',
      });
    } catch {
      // 忽略损坏文件
    }
  }
  return out;
}

function listProfiles() {
  const profiles = [builtInProfile(), ...userProfiles()];
  profiles.sort((a, b) => {
    if (a.id === 'apa7') return -1;
    if (b.id === 'apa7') return 1;
    return String(a.name).localeCompare(String(b.name));
  });
  return profiles;
}

function runtimeBundle() {
  const profiles = [builtInProfile()];
  ensureRulesDir();
  for (const file of fsReal.readdirSync(RULES_DIR)) {
    if (!file.toLowerCase().endsWith('.json')) continue;
    try {
      const profile = JSON.parse(fsReal.readFileSync(pathReal.join(RULES_DIR, file), 'utf8'));
      const checked = validateRuleObject(profile);
      if (checked.ok && profile.id !== 'apa7') profiles.push(profile);
    } catch {
      // 忽略已损坏或无效的规则文件。
    }
  }
  return { activeID: getActiveID(), profiles };
}

function notifyRuleUpdated(activeID) {
  const payload = { activeID, profiles: listProfiles() };
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('rule:updated', payload));
}

function getActiveID() {
  const saved = (() => {
    try {
      return fsReal.readFileSync(pathReal.join(app.getPath('userData'), ACTIVE_KEY), 'utf8').trim();
    } catch {
      return null;
    }
  })();
  const valid = listProfiles().some((p) => p.id === saved);
  return valid ? saved : 'apa7';
}

function setActiveID(id) {
  if (!listProfiles().some((p) => p.id === id)) return false;
  fsReal.writeFileSync(pathReal.join(app.getPath('userData'), ACTIVE_KEY), id, 'utf8');
  return true;
}

function validateRuleObject(obj) {
  const errors = [];
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { ok: false, errors: ['规则 JSON 不是合法的对象。'] };
  }
  if (obj.schemaVersion !== 1) errors.push('schemaVersion 必须为 1。');
  const id = obj.id;
  if (typeof id !== 'string' || !id) errors.push('缺少合法的 id。');
  else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) errors.push('id 格式不合法（只能包含字母、数字、. _ -，且不能以符号开头）。');
  const name = obj.name;
  if (typeof name !== 'string' || !name.trim()) errors.push('缺少合法的 name。');
  if (id === 'apa7') {
    if (obj.baseStyle !== undefined || obj.ruleType === 'independent') errors.push('apa7 是内置规则 ID，不能被用户规则覆盖。');
  } else {
    const isIndependent = obj.ruleType === 'independent';
    if (isIndependent) {
      if (obj.baseStyle !== undefined) errors.push('独立体系规则不应包含 baseStyle。');
      if (typeof obj.rules !== 'object' || obj.rules === null) errors.push('独立体系规则需要 rules 对象。');
      if (typeof obj.config !== 'object' || obj.config === null) errors.push('独立体系规则需要 config 对象。');
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
    } else if (obj.baseStyle !== 'apa7') {
      errors.push('APA 参数覆盖须使用 baseStyle: "apa7"；其他体系须使用不含 baseStyle 的 independent JSON 规则。');
    }
  }
  if (obj.config !== undefined && (typeof obj.config !== 'object' || obj.config === null)) errors.push('config 必须是对象。');
  return { ok: errors.length === 0, errors };
}

function importRuleFromFile() {
  const result = dialog.showOpenDialogSync({
    title: '导入 JSON 引用检查规则',
    buttonLabel: '导入',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!result || !result[0]) return { ok: false, canceled: true };
  let data;
  try {
    data = fsReal.readFileSync(result[0], 'utf8');
  } catch (e) {
    return { ok: false, message: '无法读取文件：' + e.message };
  }
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch (e) {
    return { ok: false, message: 'JSON 解析失败：' + e.message };
  }
  const v = validateRuleObject(parsed);
  if (!v.ok) return { ok: false, message: '规则 JSON 格式无效：' + v.errors.join(' ') };
  const id = parsed.id;
  const dest = pathReal.join(RULES_DIR, id + '.json');
  ensureRulesDir();
  try {
    fsReal.writeFileSync(dest, data, 'utf8');
  } catch (e) {
    return { ok: false, message: '保存失败：' + e.message };
  }
  setActiveID(id);
  return { ok: true, id, name: parsed.name };
}

// 关于内容（与 macOS 版本关于页保持一致）
const ABOUT_TITLE = '引用审查轻量版 CiteRev Lite';
const ABOUT_CONTENT = [
  'CiteRev Lite',
  '引用与参考文献一致性校对工具',
  'v1.0.0 · Electron 跨平台版',
  '',
  '【功能简介】',
  '自动扫描当前 Word 文档中的文中引用与参考文献列表，识别引用一致性、格式与结构问题并汇总，支持按分类筛选、在文中定位、按次数 / 年份 / 期刊等维度统计。目前仅支持 APA 7th 风格，后续将开放其他引用风格。',
  '',
  '【主要检测的问题】',
  '· 文中引用的作者 / 年份与参考文献列表是否匹配、是否缺失或未被引用',
  '· et al. 使用是否恰当、是否足够作者以消除同作者同年份歧义',
  '· 作者姓名格式（姓倒置、首字母句点）、& / and 的规范用法',
  '· 年份括号、页码记号、DOI / URL 写法等 APA 7 格式细节',
  '· 参考文献是否按字母顺序排列、是否存在重复条目',
  '· 标题大小写（sentence case）与斜体等排版规范',
  '',
  '【隐私与安全】',
  '完全离线使用。所有检测均在本地完成，不会上传任何内容，无需联网。本工具不收集任何数据，不会记录、保存或向任何服务器发送你的文档、引用或操作信息，不必担心数据外泄。',
  '',
  '【获取更新】',
  'GitHub: github.com/charlieliucc/citerev',
  '',
  '【联系方式】',
  'GitHub: charlieliucc',
  'Email: charlieliucc@outlook.com',
  '',
  '【创作声明】',
  '本工具使用 AI 辅助编写。本项目开源且免费使用，采用 MIT 许可证。禁止以任何方式转卖本工具或其衍生作品。',
].join('\n');

function showAbout() {
  dialog.showMessageBox({
    type: 'info',
    title: '关于',
    message: ABOUT_TITLE,
    detail: ABOUT_CONTENT,
    buttons: ['确定'],
    noLink: true,
  });
}

function openSettingsPage(win, section) {
  if (!win) return;
  win.webContents.send('nav:settings', section || 'main');
}

function buildMenu(win) {
  if (process.platform === 'darwin') {
    const template = [
      {
        label: app.name,
        submenu: [
          { label: '关于 引用审查轻量版', click: () => showAbout() },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: '文件',
        submenu: [
          { label: '导入 Word 文档', click: () => { if (win) win.webContents.send('menu:importWord'); } },
          { label: '设置', click: () => openSettingsPage(win, 'main') },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
          { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        ],
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
          { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: '帮助',
        submenu: [{ label: '关于', click: () => showAbout() }],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    const template = [
      {
        label: '文件',
        submenu: [
          { label: '导入 Word 文档', click: () => { if (win) win.webContents.send('menu:importWord'); } },
          { label: '设置', click: () => openSettingsPage(win, 'main') },
          { type: 'separator' },
          { role: 'quit', label: '退出' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
          { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' },
        ],
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload', label: '重新加载' }, { role: 'toggleDevTools', label: '开发者工具' }, { type: 'separator' },
          { role: 'resetZoom', label: '重置缩放' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { type: 'separator' },
          { role: 'togglefullscreen', label: '全屏' },
        ],
      },
      {
        label: '帮助',
        submenu: [{ label: '关于', click: () => showAbout() }],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
}

function importRuleFromFileAndNotify(win) {
  const r = importRuleFromFile();
  if (r.ok) notifyRuleUpdated(r.id);
  if (win) {
    win.webContents.send('rule:importResult', r);
    win.webContents.send('nav:settings', 'lab');
  }
}

// IPC 处理
ipcMain.handle('rule:import', () => {
  const result = importRuleFromFile();
  if (result.ok) notifyRuleUpdated(result.id);
  return result;
});
ipcMain.handle('rule:list', () => listProfiles());
ipcMain.handle('rule:getRuntimeBundle', () => runtimeBundle());
ipcMain.handle('rule:getActive', () => getActiveID());
ipcMain.handle('rule:setActive', (e, id) => {
  const ok = setActiveID(id);
  if (ok) {
    notifyRuleUpdated(id);
  }
  return ok;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: '引用审查轻量版 CiteRev Lite',
    backgroundColor: '#f3f4f6',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: pathReal.join(__dirname, 'preload.js'),
    },
  });

  const htmlPath = pathReal.join(__dirname, 'index.html');
  win.loadFile(htmlPath);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  buildMenu(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      buildMenu(w);
    }
  });
});
