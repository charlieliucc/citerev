// 检测分类（识别类型）开关 —— 需在 IIFE 外定义为全局，供主脚本 runCheck 使用
  const DETECTION_TYPES = [
    { key: 'missing',  label: '引用缺失', desc: '正文中引用但未在参考文献列表找到匹配条目' },
    { key: 'mismatch', label: '作者/年份不匹配', desc: '作者、年份与参考文献不一致或 et al. 使用问题' },
    { key: 'style',    label: '样式警告', desc: '文内引用格式风格提示（如 &、斜体、ibid 等）' },
    { key: 'unused',   label: '未被引用', desc: '参考文献列表中存在但正文未引用的条目' },
    { key: 'format',   label: '格式问题', desc: '参考文献条目格式错误与警告' }
  ];
  function loadEnabledTypes(){
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('crTypes') || '{}') || {}; } catch (e) { saved = {}; }
    const out = {};
    DETECTION_TYPES.forEach(t => { out[t.key] = (t.key in saved) ? !!saved[t.key] : true; });
    return out;
  }
  function saveEnabledTypes(obj){ localStorage.setItem('crTypes', JSON.stringify(obj)); }
  function isTypeEnabled(color){
    const enabled = loadEnabledTypes();
    return (color in enabled) ? enabled[color] : true;
  }

  (function () {
    const api = window.electronAPI;
    const overlay = document.getElementById('settingsOverlay');
    const main = document.getElementById('settingsMain');
    const types = document.getElementById('settingsTypes');
    const trigger = document.getElementById('btnSettings');
    if (!trigger || !overlay || !main || !types) return;

    const openSettings = (section) => {
      overlay.classList.add('open');
      if (section === 'types') showTypes();
      else showMain();
    };
    const closeSettings = () => overlay.classList.remove('open');
    const showMain = () => { main.classList.remove('hidden'); types.classList.add('hidden'); };
    const showTypes = () => { main.classList.add('hidden'); types.classList.remove('hidden'); renderTypeToggles(); };

    function renderTypeToggles(){
      const enabled = loadEnabledTypes();
      const box = document.getElementById('typeToggles');
      box.innerHTML = '';
      DETECTION_TYPES.forEach(t => {
        const row = document.createElement('label');
        row.className = 'type-row';
        row.innerHTML =
          '<div class="type-meta"><div class="type-name">' + t.label + '</div>' +
          '<div class="type-desc">' + t.desc + '</div></div>' +
          '<span class="switch"><input type="checkbox" data-type="' + t.key + '"' + (enabled[t.key] ? ' checked' : '') + '><span class="slider"></span></span>';
        box.appendChild(row);
      });
      box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const cur = loadEnabledTypes();
          cur[cb.dataset.type] = cb.checked;
          saveEnabledTypes(cur);
        });
      });
    }

    trigger.addEventListener('click', () => openSettings('main'));
    document.getElementById('settingsClose').addEventListener('click', closeSettings);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSettings(); });
    document.getElementById('entryTypes').addEventListener('click', showTypes);
    document.getElementById('typesBack').addEventListener('click', showMain);
    document.getElementById('entryAbout').addEventListener('click', () => {
      overlay.classList.remove('open');
      document.getElementById('aboutOverlay').classList.add('open');
    });
    document.getElementById('entrySite').addEventListener('click', () => {
      window.open('https://charlieliucc.github.io/citerev/', '_blank', 'noopener');
    });
    document.getElementById('entryFeedback').addEventListener('click', () => {
      window.open('https://wj.qq.com/s2/27597409/trx3/', '_blank', 'noopener');
    });

    // 主进程菜单“导入 Word 文档”触发页面内导入按钮（Electron 专属，Web 下自动跳过）
    if (api && api.onMenuImportWord) api.onMenuImportWord(() => {
      const btn = document.getElementById('btnImport');
      if (btn) btn.click();
    });
  })();
