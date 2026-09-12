(function () {
  'use strict';
  if (window.self !== window.top) document.documentElement.classList.add('in-iframe');
  const $ = id => document.getElementById(id);
  const input = $('docInput'), msg = $('distMessage'), results = $('results');
  const TOP_LIMIT = 10;
  const PIE_COLORS = ['#2f8f63','#55ad83','#88c7a7','#a9d6c0','#5c8f7a','#7aa79a','#d3a85d','#dfc37e','#8aa7c2','#af9ac7','#d58f86','#87b8b4'];
  const chartViews = Object.create(null), chartVisibleItems = Object.create(null);
  const SAMPLE = 'Recent research shows that formative feedback improves student writing (Bader et al., 2019). Earlier work also reviewed major approaches to data clustering (Jain et al., 1999).\n\nReferences\nBader, M., Burner, T., Hoem Iversen, S., & Varga, Z. (2019). Student perspectives on formative feedback as part of writing portfolios. Assessment & Evaluation in Higher Education, 44(7), 1017–1028. https://doi.org/10.1080/02602938.2018.1564812\n\nJain, A. K., Murty, M. N., & Flynn, P. J. (1999). Data clustering: A review. ACM Computing Surveys, 31(3), 264–323. https://doi.org/10.1145/331499.331504';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setMsg = (text, error) => { msg.textContent = text; msg.className = 'dist-message' + (error ? ' error' : ''); };
  const countItems = values => {
    const map = new Map();
    values.filter(Boolean).forEach(label => map.set(label, (map.get(label) || 0) + 1));
    return [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const pct = (n, max) => max > 0 ? Math.max(4, Math.round(n / max * 100)) : 0;
  function renderHBars(el, items) {
    el.className = 'hbars';
    const max = items.reduce((m, item) => Math.max(m, item.count), 0);
    el.innerHTML = items.length ? items.map(item => '<div class="hbar"><div class="lab" title="' + esc(item.label) + '">' + esc(item.label) + '</div><div class="track"><span style="width:' + pct(item.count, max) + '%"></span></div><div class="val">' + item.count + '</div></div>').join('') : '<div class="empty-note">没有可用数据。</div>';
  }
  function renderVBars(el, items) {
    el.className = 'vbars';
    const max = items.reduce((m, item) => Math.max(m, item.count), 0);
    el.innerHTML = items.length ? items.map(item => '<div class="vbar"><div class="cval">' + item.count + '</div><div class="col" style="height:' + pct(item.count, max) + '%"></div><div class="cyear">' + esc(item.label) + '</div></div>').join('') : '<div class="empty-note">未解析到有效年份。</div>';
  }
  function renderPie(el, items) {
    el.className = 'pie-chart-wrap';
    if (!items.length) { el.innerHTML = '<div class="empty-note">没有可用数据。</div>'; return; }
    const total = items.reduce((sum, item) => sum + item.count, 0);
    let cursor = 0;
    const stops = items.map((item, index) => {
      const start = cursor;
      cursor += item.count / total * 100;
      return PIE_COLORS[index % PIE_COLORS.length] + ' ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%';
    });
    const legend = items.map((item, index) => '<div class="pie-legend-item"><span class="pie-dot" style="background:' + PIE_COLORS[index % PIE_COLORS.length] + '"></span><span>' + esc(item.label) + '</span><b>' + item.count + '</b></div>').join('');
    el.innerHTML = '<div class="pie-chart" style="background:conic-gradient(' + stops.join(',') + ')" role="img" aria-label="分布饼状图"></div><div class="pie-legend">' + legend + '</div>';
  }
  function renderChart(el, items) {
    if (!el) return;
    chartVisibleItems[el.id] = items;
    if (chartViews[el.id] === 'pie') renderPie(el, items);
    else if (el.id === 'yearChart') renderVBars(el, items);
    else renderHBars(el, items);
  }
  function renderLimited(el, items, renderer, options) {
    if (!el) return;
    const all = [...items];
    const chronological = options?.chronological;
    const sortYears = values => values.sort((a, b) => (parseInt(a.label, 10) || 0) - (parseInt(b.label, 10) || 0));
    // 年份默认先按数量选 TOP 10，再按年份摆放；展开后显示全部并保持从老到新。
    const top = options?.noLimit
      ? (chronological ? sortYears([...all]) : all)
      : chronological
      ? sortYears([...all].sort((a, b) => b.count - a.count).slice(0, TOP_LIMIT))
      : all.slice(0, TOP_LIMIT);
    const expandedItems = chronological ? sortYears([...all]) : all;
    const oldToggle = el.parentElement.querySelector('.chart-toggle');
    if (oldToggle) oldToggle.remove();
    renderer(el, top);
    if (options?.noLimit || all.length <= TOP_LIMIT) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chart-toggle';
    button.textContent = '展开全部（共 ' + all.length + ' 项）';
    button.setAttribute('aria-expanded', 'false');
    let expanded = false;
    button.addEventListener('click', () => {
      expanded = !expanded;
      renderer(el, expanded ? expandedItems : top);
      button.textContent = expanded ? '收起至 TOP 10' : '展开全部（共 ' + all.length + ' 项）';
      button.setAttribute('aria-expanded', String(expanded));
    });
    el.insertAdjacentElement('afterend', button);
  }
  // 文献类型推断仍需识别 DOI；这只是分类辅助，不会恢复已删除的标识符完整度模块。
  function hasDoi(text) { return /(?:doi\.org\/|doi:\s*)10\.\d{4,9}\//i.test(text); }
  function inferType(text) {
    if (/\b(?:proceedings|conference|symposium)\b/i.test(text)) return '会议论文';
    if (/\b(?:thesis|dissertation)\b|学位论文/i.test(text)) return '学位论文';
    if (/https?:\/\/\S+/i.test(text) && !hasDoi(text) && !/\b\d+\s*\(\d+\)/.test(text)) return '网页/在线资料';
    if (/\b(?:press|publisher|publishing)\b/i.test(text) && !/\b\d+\s*\(\d+\)/.test(text)) return '图书/章节';
    if (hasDoi(text) || /\b\d+\s*\(\d+\)\s*,\s*\d+/.test(text)) return '期刊论文';
    return '其他/待识别';
  }
  const TEXT_STOP = new Set('about after again also among been being between can could data from have into more most other over paper papers research results such than that their these those through using were which with within study studies review based method methods analysis approach article articles journal university press https doi org'.split(/\s+/));
  function extractTitle(text) {
    const match = text.match(/\((?:19|20)\d{2}[a-z]?\)\.\s*(.+)/i);
    if (!match) return text;
    return (match[1].split(/\.\s+(?=[A-Z\u4e00-\u9fff])/)[0] || match[1]).replace(/https?:\/\/\S+/gi, '');
  }
  function keywords(text) {
    const source = extractTitle(text).toLowerCase().replace(/https?:\/\/\S+|10\.\d{4,9}\/\S+/gi, ' ');
    const english = source.match(/[a-z][a-z-]{3,}/g) || [];
    const chinese = source.match(/[\u4e00-\u9fff]{2,6}/g) || [];
    return [...english, ...chinese].filter(word => !TEXT_STOP.has(word) && !/^\d+$/.test(word));
  }
  function ageInfo(parsed) {
    const current = new Date().getFullYear();
    const ages = parsed.filter(ref => ref.year).map(ref => Number(current) - Number(String(ref.year).slice(0, 4))).filter(age => Number.isFinite(age) && age >= 0);
    const sorted = [...ages].sort((a, b) => a - b);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
    const recent5 = ages.filter(age => age <= 5).length, recent10 = ages.filter(age => age <= 10).length;
    return { current, ages, median, recent5, recent10 };
  }
  function isCited(reference, citations) {
    return citations.some(citation => citation.keys && reference.keys && citation.keys.some(key => reference.keys.includes(key)));
  }
  function renderCards(data) {
    const cards = [
      ['参考文献', data.refs, '条'],
      ['正文引用', data.cites, '处'],
      ['引用最多', data.topCited?.label || '—', data.topCited ? data.topCited.count + ' 次' : '暂无'],
      ['引用期刊第一', data.topJournal?.label || '—', data.topJournal ? data.topJournal.count + ' 条' : '暂无'],
      ['关键词第一', data.topKeyword?.label || '—', data.topKeyword ? data.topKeyword.count + ' 次' : '暂无'],
      ['来源期刊', data.journals, '种']
    ];
    $('cards').innerHTML = cards.map(item => '<div class="card"><span>' + item[0] + '</span><b>' + item[1] + '</b><em>' + item[2] + '</em></div>').join('');
  }
  function run() {
    const text = input.value.trim();
    if (!text) { setMsg('请先粘贴内容或导入 Word / PDF 文档。', true); return; }
    if (!window.CitationReferenceSplitter || !window.CitationReportEngine?.distributionAnalysis) { setMsg('分析模块未加载，请刷新页面后重试。', true); return; }
    try {
      setMsg('正在分析分布……');
      const sec = CitationReferenceSplitter.splitDocumentSections(text);
      const refs = CitationReferenceSplitter.splitReferences(sec.references).filter(x => x.length > 15);
      const analysis = CitationReportEngine.distributionAnalysis(sec.body || '', refs, null);
      const dist = CitationReportEngine.distribution(analysis);
      const parsed = analysis.parsed || [], citations = analysis.citations || [];
      const cited = parsed.filter(ref => isCited(ref, citations)).length;
      const age = ageInfo(parsed);
      const keywordCounts = countItems(refs.flatMap(keywords));
      renderCards({
        refs: refs.length,
        cites: citations.length,
        topCited: dist[0]?.items?.[0] || null,
        topJournal: dist[2]?.items?.[0] || null,
        topKeyword: keywordCounts[0] || null,
        journals: dist[2]?.items?.length || 0
      });
      renderLimited($('citeChart'), dist[0]?.items || [], renderChart);
      renderLimited($('yearChart'), dist[1]?.items || [], renderChart, {chronological:true,noLimit:true});
      renderLimited($('journalChart'), dist[2]?.items || [], renderChart);
      renderLimited($('typeChart'), countItems(refs.map(inferType)), renderChart);
      renderLimited($('coverageChart'), [{label:'正文已引用',count:cited},{label:'正文未识别引用',count:Math.max(0, parsed.length-cited)}].filter(x => x.count), renderChart);
      renderLimited($('keywordChart'), keywordCounts, renderChart);
      const totalRefs = age.ages.length || 1;
      $('yearRecency').innerHTML = age.ages.length
        ? [['近 5 年', Math.round(age.recent5 / totalRefs * 100) + '%', age.recent5 + ' 条'],['近 10 年', Math.round(age.recent10 / totalRefs * 100) + '%', age.recent10 + ' 条']].map(item => '<div class="card"><span>' + item[0] + '</span><b>' + item[1] + '</b><em>' + item[2] + '</em></div>').join('')
        : '<div class="empty-note">暂无可解析的参考文献年份。</div>';
      results.style.display = 'block';
      setMsg('分析完成：共 ' + refs.length + ' 条参考文献，正文引用 ' + citations.length + ' 处。');
    } catch (error) { setMsg('分析出错：' + (error.message || error), true); }
  }
  $('btnSample').addEventListener('click', () => { input.value = SAMPLE; input.dispatchEvent(new Event('input', {bubbles:true})); setMsg('已载入样例，点击「分析分布」。'); });
  $('btnImport').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async function () {
    const file = this.files && this.files[0]; if (!file) return;
    const isPdf = /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';
    setMsg('正在读取 ' + file.name + ' …');
    try { const doc = isPdf ? await CitationPdfImporter.parse(file, (page,total) => setMsg('正在本地解析 PDF：' + page + ' / ' + total + ' 页…')) : await CitationReportEngine.parseDocx(file); input.value = doc.text || [doc.body, doc.references].filter(Boolean).join('\n\nReferences\n'); input.dispatchEvent(new Event('input', {bubbles:true})); setMsg('已导入 ' + file.name + (isPdf ? '，已读取分页和字体信息' : '') + '，点击「分析分布」。'); }
    catch (error) { setMsg('导入失败：' + (error.message || error), true); }
    this.value = '';
  });
  $('btnRun').addEventListener('click', run);
  function addChartSwitch(id) {
    const chart = $(id);
    if (!chart) return;
    const section = chart.closest('.chart-section'), heading = section && section.querySelector('h3');
    if (!heading) return;
    chartViews[id] = 'bar';
    const row = document.createElement('div');
    row.className = 'chart-heading';
    heading.parentNode.insertBefore(row, heading);
    row.appendChild(heading);
    const controls = document.createElement('div');
    controls.className = 'chart-view-switch';
    controls.setAttribute('aria-label', heading.textContent + '图表类型');
    const bar = document.createElement('button'), pie = document.createElement('button');
    bar.type = pie.type = 'button'; bar.textContent = '柱状图'; pie.textContent = '饼状图';
    bar.className = 'active'; bar.setAttribute('aria-pressed', 'true'); pie.setAttribute('aria-pressed', 'false');
    const setView = view => {
      chartViews[id] = view;
      bar.classList.toggle('active', view === 'bar'); pie.classList.toggle('active', view === 'pie');
      bar.setAttribute('aria-pressed', String(view === 'bar')); pie.setAttribute('aria-pressed', String(view === 'pie'));
      renderChart(chart, chartVisibleItems[id] || []);
    };
    bar.addEventListener('click', () => setView('bar')); pie.addEventListener('click', () => setView('pie'));
    controls.append(bar, pie); row.appendChild(controls);
  }
  ['citeChart','yearChart','journalChart','typeChart','coverageChart','keywordChart'].forEach(addChartSwitch);
})();
