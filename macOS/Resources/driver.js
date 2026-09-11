/* ==================================================================
 * driver.js — JavaScriptCore 检测驱动
 * ------------------------------------------------------------------
 * 供 Swift 通过 JavaScriptCore 调用，替代原来的 Node 入口 detect.js。
 * 本文件内嵌了 detect.js 中的纯算法函数（不依赖 Node API），并：
 *   1. 模拟 window / localStorage / console 全局对象
 *   2. 加载 rules-apa7.js + rules-loader.js
 *   3. 注入规则包 ctx 并恢复默认风格（APA7）
 *   4. 暴露全局可调用函数 citationRunDetection(docJSONString)，
 *      返回 { stats, comments } 对象，Swift 直接读取。
 *
 * 输入 docJSONString 形如：
 *   {"paragraphs":[{"text":"...","entireItalic":false,"italicRanges":[]},...]}
 * ================================================================== */

'use strict';

/* ---------- 模拟浏览器全局对象 ---------- */
var memStore = {};
if (typeof window === 'undefined') { window = globalThis; }
window.window = window;
window.localStorage = {
  getItem: function (k) { return (k in memStore) ? memStore[k] : null; },
  setItem: function (k, v) { memStore[k] = String(v); },
  removeItem: function (k) { delete memStore[k]; }
};
if (typeof console === 'undefined') { console = { log: function(){}, error: function(){} }; }

/* ==================================================================
 * 以下为从 detect.js 提取的纯算法函数（不依赖 Node / Office）
 * ================================================================== */

function normalizeSpace(s){ return (s ?? "").replace(/\s+/g, " ").trim(); }
function escapeHtml(str){
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function normalizeYear(y){ return (y ?? "").toLowerCase(); }
function issue(sev, msg, meta){ return { severity: sev, message: msg, meta: meta || '' }; }
function severityRank(sev){ return sev === 'bad' ? 2 : sev === 'warn' ? 1 : 0; }
function isInitialToken(tok){ return /^([A-Za-z])\.?$/.test((tok ?? "").trim()); }
function isAllInitials(tok){
  const w = (tok ?? "").trim().split(/\s+/).filter(Boolean);
  return w.length > 0 && w.every(x => /^([A-Za-z])\.?$/.test(x));
}

function parseSingleAuthorToken(token){
  let t = normalizeSpace(token).replace(/\.$/, "");
  t = t.replace(/['’‘]s?$/u, "");
  if(!t) return { surname:"", initial:"" };
  const words = t.split(/\s+/).filter(Boolean);
  const initials = [];
  let i = 0;
  while(i < words.length - 1 && /^([A-Za-z])\.?$/.test(words[i])){
    initials.push(words[i].replace(/\./g, "").toLowerCase()); i++;
  }
  if(initials.length > 0){
    const surname = words.slice(i).join(" ");
    if(surname) return { surname: normalizeSpace(surname), initial: initials[0] };
  }
  if(t.includes(",")){
    const parts = t.split(",").map(p => p.trim()).filter(Boolean);
    const surname = parts[0];
    const rest = parts.slice(1).join(" ");
    const rw = rest.split(/\s+/).filter(Boolean);
    let j = 0; const inits = [];
    while(j < rw.length && /^([A-Za-z])\.?$/.test(rw[j])){ inits.push(rw[j].replace(/\./g, "").toLowerCase()); j++; }
    return { surname: normalizeSpace(surname), initial: inits[0] || "" };
  }
  return { surname: t, initial: "" };
}
function authorKeyPart(author){
  const surname = normalizeSpace(author?.surname ?? "");
  const initial = (author?.initial ?? "").toLowerCase();
  if(!surname) return "";
  if(initial && !/\s/.test(surname)) return `${surname}-${initial}`;
  return surname;
}
function parseInTextAuthorList(raw, opts){
  const allowAnd = !!(opts && opts.allowAnd);
  let s = normalizeSpace(raw);
  s = s.replace(/^[\s,;:().]+|[\s,;:().]+$/g, "");
  if(!s) return { authors: [], etal:false };
  let etal = false;
  if(/\bet\s+al\.?\b/i.test(s)){ etal = true; s = s.replace(/\bet\s+al\.?\b.*$/i, "").trim(); }
  s = s.replace(/as\s+cited\s+in\s+/gi, " ");
  s = s.replace(/(^|[\s(,;:])(?:see(?:\s+also)?|e\.g\.|i\.e\.|cf\.)\s*,?/gi, "$1");
  s = normalizeSpace(s);
  if(!s) return { authors: [], etal:false };
  const sep = allowAnd ? /\s*(?:&|\band\b)\s*/i : /\s*&\s*/;
  const groups = s.split(sep).map(x => x.trim()).filter(Boolean);
  const authors = [];
  for(const g of groups){
    const segs = g.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
    let pendingInitial = ""; let i = 0;
    while(i < segs.length){
      const seg = segs[i];
      if(isInitialToken(seg) || isAllInitials(seg)){
        if(authors.length === 0 && i === 0){
          pendingInitial = seg.replace(/\./g, "").toLowerCase().replace(/[^a-z]/g, "").slice(0,1); i++; continue;
        }
        const last = authors[authors.length - 1];
        if(last && !last.initial){ last.initial = seg.replace(/\./g, "").toLowerCase().replace(/[^a-z]/g, "").slice(0,1); }
        i++; continue;
      }
      const a = parseSingleAuthorToken(seg);
      if(a && normalizeSpace(a.surname)){
        if(!a.initial && pendingInitial){ a.initial = pendingInitial; pendingInitial = ""; }
        if(i + 1 < segs.length && isInitialToken(segs[i + 1]) && !a.initial){
          a.initial = segs[i + 1].replace(/\./g, "").toLowerCase(); i += 2;
        } else { i += 1; }
        authors.push(a);
      } else { i++; }
    }
  }
  return { authors, etal };
}
function buildKeys(authors, etal, year){
  const y = normalizeYear(year);
  const keys = new Set();
  const clean = (authors ?? []).filter(a => normalizeSpace(a.surname));
  if(clean.length === 0 || !y) return [];
  const surnames = clean.map(a => normalizeSpace(a.surname).toLowerCase());
  const parts = clean.map(authorKeyPart).filter(Boolean).map(p => p.toLowerCase());
  const firstSurname = surnames[0];
  const firstPart = parts[0];
  const addFirst = () => {
    if(firstPart && firstPart !== firstSurname) keys.add(`${firstPart}-${y}`);
    keys.add(`${firstSurname}-${y}`);
  };
  const addFirstEtal = () => {
    if(firstPart && firstPart !== firstSurname) keys.add(`${firstPart}-etal-${y}`);
    keys.add(`${firstSurname}-etal-${y}`);
  };
  if(etal){ addFirstEtal(); addFirst(); return [...keys]; }
  if(clean.length === 1){ addFirst(); return [...keys]; }
  if(clean.length === 2){
    keys.add(`${surnames[0]}&${surnames[1]}-${y}`);
    if(parts[0] && parts[1]) keys.add(`${parts[0]}&${parts[1]}-${y}`);
    addFirstEtal(); addFirst(); return [...keys];
  }
  keys.add(`${surnames.join("&")}-${y}`);
  if(parts.length === clean.length) keys.add(`${parts.join("&")}-${y}`);
  addFirstEtal(); addFirst(); return [...keys];
}

function parseReferenceEntry(entry){
  const text = normalizeSpace(entry);
  if(!text) return null;
  const yearMatch = text.match(/\(([^()]*?(\d{4}[a-z]?)[^()]*?)\)/i);
  const year = yearMatch ? normalizeYear(yearMatch[2]) : "";
  const authorsPart = yearMatch ? text.slice(0, yearMatch.index).trim() : text;
  const authors = [];
  const reSurnameInitial = /([A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+(?:\s+[A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+)*)\s*,\s*([A-Z])/g;
  let m;
  while((m = reSurnameInitial.exec(authorsPart))){ authors.push({ surname: m[1], initial: (m[2] ?? "").toLowerCase() }); }
  if(authors.length === 0){
    const org = authorsPart.trim().split(/[\.(,]/)[0]?.trim();
    if(org) authors.push({ surname: org, initial: "" });
  }
  return {
    raw: entry, year,
    surnames: authors.map(a => a.surname),
    authors, keys: buildKeys(authors, false, year)
  };
}
function refLabel(pr){
  const a = pr.authors && pr.authors[0];
  if(!a) return (pr.raw || '').slice(0, 40).trim() || '(无法识别的条目)';
  let s = `${a.surname}, ${a.initial ? a.initial.toUpperCase() + '.' : ''}`;
  if(pr.authors.length === 2){
    const b = pr.authors[1];
    const bInitial = b.initial ? ' ' + b.initial.toUpperCase() + '.' : '';
    s += `, & ${b.surname}${bInitial}`;
  } else if(pr.authors.length > 2){
    const b = pr.authors[1];
    if(b){
      const bInitial = b.initial ? ' ' + b.initial.toUpperCase() + '.' : '';
      s += `, ${b.surname}${bInitial}, et al.`;
    } else {
      s += ' et al.';
    }
  }
  if(pr.year) s += ` (${pr.year})`;
  return s.trim();
}

function cleanParentheticalAuthor(pre){
  let s = normalizeSpace(pre).replace(/[,;:\s]+$/g, "");
  s = s.replace(/\b(?:see|e\.g\.|i\.e\.|cf\.|viz\.)\.?[,\s:]*/gi, " ");
  s = s.replace(/\b(?:based\s+on|according\s+to|as\s+(?:discussed|noted|shown|reported|argued|demonstrated|mentioned)\s+(?:by)?|in\s+line\s+with|following|for\s+(?:example|instance)|as\s+cited\s+in)\b[,\s:]*/gi, " ");
  s = normalizeSpace(s);
  let segs = s.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
  while(segs.length > 1){
    const first = segs[0];
    const fw = first.split(/\s+/)[0] || "";
    const looksDiscourse = /^[a-z]/.test(fw) ||
      /\b(prior|studies|study|research|analysis|results|findings|evidence|literature|review|discussion|example|instance|note|notes|report|reports|article|paper|papers|book|books|chapter|section|table|figure|theory|approach|method|methods|data|model|models|case|work|works|text|author|authors|claim|claims|argument|view|views)\b/i.test(first);
    if(looksDiscourse){ segs.shift(); continue; }
    break;
  }
  return segs.join(", ");
}
function extractCitationsFromBody(text){
  const citations = [];
  const stopwords = new Set(["figure","table","section","chapter","note","appendix","equation","example","vol","no","pp","p","eq","ref","ibid","see","id"]);
  const parenRe = /\(([^()]*?\d{4}[a-z]?[^()]*?)\)/gi;
  let pm;
  while((pm = parenRe.exec(text))){
    const inside = pm[1];
    const chunks = inside.split(/\s*;\s*/g).map(s => s.trim()).filter(Boolean);
    for(const chunk of chunks){
      const cleaned = chunk.replace(/\bpp?\.?\s*\d+(?:[\-–]\d+)?\b/gi, "");
      const years = cleaned.match(/\d{4}[a-z]?/gi) || [];
      if(years.length === 0) continue;
      const firstYearIdx = cleaned.search(/\d{4}[a-z]?/i);
      const authorPart = firstYearIdx >= 0 ? cleaned.slice(0, firstYearIdx) : cleaned;
      const ap = normalizeSpace(cleanParentheticalAuthor(authorPart));
      if(!ap) continue;
      if(!/[A-Za-z\u00C0-\u017F]/.test(ap)) continue;
      const { authors, etal } = parseInTextAuthorList(ap, { allowAnd:false });
      if(authors.length === 0) continue;
      citations.push({
        authorsRaw: ap, year: normalizeYear(years[0]), authors, etal,
        raw: `(${chunk})`,
        // 单条括号引用可连同括号选中；分号分隔的多条引用中，文档内不存在
        // 人工补出的右括号，因此仅定位实际存在的该条 author-year 片段。
        locateRaw: chunks.length === 1 ? pm[0] : chunk,
        start: pm.index, end: pm.index + pm[0].length
      });
    }
  }
  const narrativeRe = /\b([A-Z][A-Za-z'’\-]*(?:\.?\s+(?:[A-Z][A-Za-z'’\-]*\.?|and|&|et\s+al\.?))*)\s*'?s?\s*\((\d{4}[a-z]?)\)/g;
  let nm;
  while((nm = narrativeRe.exec(text))){
    let authorToken = nm[1];
    if(/\)\s*$/.test(authorToken)) continue;
    authorToken = normalizeSpace(authorToken.replace(/^(?:see(?:\s+also)?|according\s+to|as\s+(?:shown|noted|reported)\s+by|citing|cf\.?|e\.g\.?|i\.e\.?|viz\.?)\b\s*/gi, ""));
    let guard = 0;
    let firstWord = normalizeSpace(authorToken).toLowerCase().split(/\s+/)[0];
    while(stopwords.has(firstWord) && guard++ < 4){
      authorToken = normalizeSpace(authorToken.replace(/^\S+\s+/, ""));
      firstWord = normalizeSpace(authorToken).toLowerCase().split(/\s+/)[0];
    }
    if(!authorToken || stopwords.has(firstWord)) continue;
    const { authors, etal } = parseInTextAuthorList(authorToken, { allowAnd:true });
    if(authors.length === 0) continue;
    citations.push({ authorsRaw: authorToken, year: normalizeYear(nm[2]), authors, etal, raw: nm[0], locateRaw: nm[0], start: nm.index, end: nm.index + nm[0].length });
  }
  return citations;
}

/* ---------- 规则包 ctx ---------- */
function buildRuleCtx(){
  return {
    normalizeSpace, normalizeYear, escapeHtml, issue, buildKeys,
    parseInTextAuthorList, parseReferenceEntry, refLabel,
    makeSearchText, extractJournalName, severityRank
  };
}

/* ---------- 文档结构拆分 ---------- */
function isLikelyReferenceEntry(text, rules){
  const t = (text || '').trim();
  if(!t) return false;
  if(rules.nonRefMarkerRegex.test(t)) return false;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const ascii = (t.match(/[A-Za-z]/g) || []).length;
  if(cjk > 0 && ascii === 0) return false;
  if(/\(\s*(?:\d{4}[a-z]?|n\.d\.)\s*\)/i.test(t)) return true;
  if(/doi\.org|\b10\.\d{4,9}\//i.test(t)) return true;
  if(/https?:\/\//i.test(t) && /\(/.test(t)) return true;
  if(t.length < 15) return false;
  return /^[A-Z\u00C0-\u017F]/.test(t);
}
function isReferenceEndHeading(text){
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if(!t || t.length > 90) return false;
  if(/^(?:\d+[.)]\s*)?(?:appendix|appendices)(?:\s+[A-Z0-9IVX]+)?(?:\s*[:.\-–—]\s*[^.!?]{1,60})?$/i.test(t)) return true;
  return /^(?:\d+[.)]\s*)?附录(?:\s*[A-Z0-9IVX一二三四五六七八九十]+)?(?:\s*[:：.\-–—]\s*[^。！？]{1,60})?$/.test(t);
}
function splitBodyAndReferences(paragraphs){
  const rules = window.RulesManager.getCurrent();
  let headingIdx = -1;
  for(let i = 0; i < paragraphs.length; i++){
    const line = (paragraphs[i].text || "").trim();
    if(!line) continue;
    if(line.length <= 60 && rules.headingRegex.test(line)){ headingIdx = i; break; }
  }
  if(headingIdx < 0){
    return {
      body: paragraphs.map(p => p.text).join("\n\n"),
      bodyParagraphs: paragraphs.filter(p => p.text),
      refsParagraphs: []
    };
  }
  const bodyParagraphs = paragraphs.slice(0, headingIdx).filter(p => p.text);
  let endIdx = paragraphs.length;
  for(let i = headingIdx + 1; i < paragraphs.length; i++){
    if(isReferenceEndHeading(paragraphs[i].text)){ endIdx = i; break; }
  }
  let refParas = paragraphs.slice(headingIdx + 1, endIdx).filter(p => p.text);
  const TRAILING_META_RE = /^\s*(word\s*count|words\s*:|page\s*count|pages\s*:|character\s*count|characters\s*:)/i;
  refParas = refParas.filter(p => {
    const t = p.text || "";
    return !TRAILING_META_RE.test(t) && isLikelyReferenceEntry(t, rules);
  });
  return {
    body: bodyParagraphs.map(p => p.text).join("\n\n"),
    bodyParagraphs,
    refsParagraphs: refParas
  };
}

/* ---------- 搜索串 / 期刊名 ---------- */
function makeSearchText(s, maxLen){
  if(!s) return "";
  let t = String(s)
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[–—]/g, "-")
    .trim();
  if(!t) return "";
  const limit = (maxLen && maxLen > 0) ? maxLen : 100;
  if(t.length > limit) t = t.slice(0, limit);
  return t;
}
function refSearchText(text){
  const m = (text || '').match(/^.*?\((?:(?:n\.d\.)|\d{4}[a-z]?)\)/i);
  const head = m ? m[0] : text;
  return makeSearchText(head, 120);
}
function extractJournalName(text){
  if(!text) return "";
  const t = String(text);
  let volMatch = t.match(/,\s*\d{1,4}\s*\(\s*\d+\s*\),\s*(?:[\d–-]+\s*\d|[A-Za-z]?\d+)/);
  if(!volMatch) volMatch = t.match(/,\s*\d{1,4}\s*,\s*(?:[\d–-]+\s*\d|[A-Za-z]?\d{4,})\b/);
  if(!volMatch) return "";
  const beforeVol = t.slice(0, volMatch.index);
  const m = beforeVol.match(/([.!?])[^.!?]*$/);
  let journal = m ? beforeVol.slice(m.index + 1) : beforeVol;
  journal = journal.trim().replace(/^['"“‘”’]+\s*/, '');
  return journal;
}

/* ==================================================================
 * runDetection — 主检测（从 detect.js 提取，无 Node 依赖）
 * ================================================================== */
function runDetection(bodyText, refBlocks){
  const rules = window.RulesManager.getCurrent();
  const bodyNorm = (bodyText || "").replace(/\r\n/g, "\n");
  const globalItalic = refBlocks.some(b => b.italics && b.italics.length > 0);

  const parsedRefs = refBlocks.map((b, i) => {
    const pr = parseReferenceEntry(b.text);
    if(pr){ pr.italics = b.italics; pr._idx = i; }
    return pr;
  }).filter(Boolean);

  const refKeyToRef = new Map();
  for(const pr of parsedRefs){ for(const k of pr.keys){ if(!refKeyToRef.has(k)) refKeyToRef.set(k, pr); } }

  const rawCites = extractCitationsFromBody(bodyNorm);
  const citeKeyItems = [];
  for(const c of rawCites){
    const keys = buildKeys(c.authors, c.etal, c.year);
    if(keys.length === 0) continue;
    citeKeyItems.push({ key: keys[0], allKeys: keys, authorsRaw: c.authorsRaw, authors: c.authors, etal: c.etal, year: c.year, raw: c.raw, locateRaw: c.locateRaw || c.raw, start: c.start, end: c.end });
  }

  const countByKey = new Map();
  const anyKeysByPrimary = new Map();
  const displayByPrimary = new Map();
  for(const item of citeKeyItems){
    const k = item.key;
    countByKey.set(k, (countByKey.get(k) || 0) + 1);
    if(!anyKeysByPrimary.has(k)) anyKeysByPrimary.set(k, item.allKeys);
    if(!displayByPrimary.has(k)) displayByPrimary.set(k, item);
  }
  const uniqueCites = [...displayByPrimary.values()].sort((a,b) => a.key.localeCompare(b.key));

  const missingCites = [];
  for(const cite of uniqueCites){
    const keys = anyKeysByPrimary.get(cite.key) ?? [cite.key];
    let ok = false;
    for(const k of keys){ if(refKeyToRef.has(k)){ ok = true; break; } }
    if(ok) continue;
    missingCites.push(cite);
  }

  const citePrimaryKeys = new Set(uniqueCites.map(c => c.key));
  const unusedRefs = [];
  for(const pr of parsedRefs){
    const used = pr.keys.some(k => citePrimaryKeys.has(k));
    if(!used){
      let altUsed = false;
      for(const cite of uniqueCites){
        const alt = anyKeysByPrimary.get(cite.key) ?? [];
        if(alt.some(k => pr.keys.includes(k))){ altUsed = true; break; }
      }
      if(!altUsed) unusedRefs.push(pr);
    }
  }

  const formatByIdx = new Map();
  refBlocks.forEach((b, i) => {
    const { type, issues } = rules.lintReference({ text: b.text, rawText: b.rawText, italics: b.italics }, {
      ...window.RulesManager.ctx, globalItalic, currentRules: rules
    });
    if(issues && issues.length) formatByIdx.set(i, { type, issues });
  });

  const prByIdx = new Map();
  parsedRefs.forEach(pr => prByIdx.set(pr._idx, pr));
  for(let i = 1; i < refBlocks.length; i++){
    const prev = prByIdx.get(i - 1);
    const cur = prByIdx.get(i);
    if(!prev || !cur) continue;
    if(rules.refOrderCompare(cur, prev) < 0){
      if(!formatByIdx.has(i)) formatByIdx.set(i, { type: '参考文献列表', issues: [] });
      formatByIdx.get(i).issues.push(issue('warn', `参考文献未按字母顺序排列：该条目（${refLabel(cur)}）按作者姓氏应排在「${refLabel(prev)}」之前。`, '字母顺序'));
    }
  }

  // duplicate-entry 检测
  {
    const dupMap = new Map();
    for(const pr of parsedRefs){
      if(!pr) continue;
      const t = pr.raw || '';
      let surname = (pr.surnames && pr.surnames[0] ? pr.surnames[0] : '').toLowerCase();
      for(const art of (rules.config.ignoreLeadingArticles || ['a','an','the'])){
        surname = surname.replace(new RegExp('^' + art + '\\s+'), '');
      }
      surname = surname.replace(/[^a-z0-9]/g, '');
      const yearMatch = t.match(/\(([^()]*?(\d{4}[a-z]?)[^()]*?)\)/i);
      const afterYear = yearMatch ? t.slice(yearMatch.index + yearMatch[0].length) : t;
      const title = (afterYear.replace(/^\.\s*/, '').match(/^([^.]+?)/) || ['', ''])[1].trim();
      const titleKey = title.replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase();
      const year = pr.year || '';
      const key = `${surname}|${year}|${titleKey}`;
      if(!key.replace(/\|/g, '')) continue;
      if(!dupMap.has(key)){
        dupMap.set(key, pr);
        continue;
      }
      const prev = dupMap.get(key);
      if(!formatByIdx.has(pr._idx)) formatByIdx.set(pr._idx, { type: '参考文献列表', issues: [] });
      formatByIdx.get(pr._idx).issues.push(issue('warn', `该条目可能与条目 ${prev._idx + 1} 重复（作者、年份、标题开头相同）。参考文献列表应每条来源只列出一次。`, '重复条目'));
    }
  }

  const unusedIdx = new Set(unusedRefs.map(r => r._idx));

  const comments = [];
  const mismatchComments = rules.detectInTextMismatches(rawCites, parsedRefs, { ...window.RulesManager.ctx, refKeyToRef }, refKeyToRef);
  comments.push(...mismatchComments);
  const structuralComments = rules.detectInTextStructural(rawCites, parsedRefs, window.RulesManager.ctx);
  comments.push(...structuralComments);
  const styleComments = rules.detectInTextStyleWarnings(rawCites, parsedRefs, window.RulesManager.ctx);
  comments.push(...styleComments);
  missingCites.forEach((cite, i) => {
    const searchText = makeSearchText((cite.authorsRaw || '') + ', ' + (cite.year || ''), 120);
    comments.push({
      id: 'm' + i, color: 'missing', tag: '引用缺失',
      quote: cite.raw, count: countByKey.get(cite.key) || 1,
      desc: '正文中出现该引用（作者 + 年份），但未在参考文献列表中找到完全匹配的条目。请核对文中或参考文献的年份/作者，或补充对应参考文献。',
      inText: cite.raw, searchText, inRef: false
    });
  });
  refBlocks.forEach((b, i) => {
    const isUnused = unusedIdx.has(i);
    const fmt = formatByIdx.get(i);
    if(!isUnused && !(fmt && fmt.issues.length)) return;
    const searchText = refSearchText(b.text);
    if(isUnused){
      const pr = prByIdx.get(i);
      const possibleMatches = [];
      if(pr){
        for(const item of citeKeyItems){
          const cAuth = (item.authors || []);
          const cSurname = cAuth.length ? normalizeSpace(cAuth[0].surname).toLowerCase() : '';
          const refSurnames = (pr.surnames || []).map(s => s.toLowerCase());
          const yearMatch = item.year === pr.year;
          const authorMatch = cSurname && (refSurnames.includes(cSurname));
          if(authorMatch && !yearMatch){
            possibleMatches.push(normalizeSpace((item.authorsRaw || '') + ', ' + (item.year || '')));
          }
        }
      }
      let desc = '该参考文献未在正文中被引用，请确认是否需要删除或补充正文引用。';
      if(possibleMatches.length > 0){
        desc += `<br/>存在 ${possibleMatches.length} 个可能匹配（作者或年份部分对应）：${escapeHtml(possibleMatches.slice(0, 3).join('；'))}。请核对正文引用，修正后该问题通常会随之消失。`;
      }
      comments.push({
        id: 'r' + i, color: 'unused', tag: '未被引用',
        quote: b.text, count: 1, searchText, desc,
        inRef: true, refIndex: i
      });
    } else if(fmt && fmt.issues.length){
      const sorted = fmt.issues.slice().sort((a,b) => severityRank(b.severity) - severityRank(a.severity));
      const issuesHtml = sorted.map(it => {
        const pill = it.severity === 'bad' ? '[错误]' : it.severity === 'warn' ? '[警告]' : '[提示]';
        return `${pill} ${it.message}`;
      }).join('；');
      comments.push({
        id: 'r' + i, color: 'format', tag: '格式问题',
        quote: b.text, count: 1, searchText,
        desc: issuesHtml, inRef: true, refIndex: i
      });
    }
  });

  // ---- 统计功能数据（与 citation-word-addin taskpane.js 一致）----
  // 按文档中实际出现的完整引用形式分组。若同一来源同时写成叙事式
  // "To et al. (2023)" 和括号式 "(To et al., 2023)"，它们是两个可准确
  // 定位的文本形式，分别计数，避免显示总数为 2 却只能导航其中一种。
  const citeFormRows = new Map();
  for(const item of citeKeyItems){
    // 定位完整的正文引用，而不是只搜索第一作者姓氏。只搜 "To" 会命中普通单词，
    // 只搜 "Yuan" 也无法区分 "K. Yuan" 与 "R. Yuan"；raw 保留作者、首字母、
    // et al.、年份及括号等实际引用文本，可让 Word 选中完整引用并消除歧义。
    const citationText = String(item.locateRaw || item.raw || '').replace(/\s+/g, ' ').trim();
    if(!citationText) continue;
    const formKey = item.key + '|' + citationText.toLowerCase();
    const existing = citeFormRows.get(formKey);
    if(existing){
      existing.count += 1;
    } else {
      citeFormRows.set(formKey, {
        label: citationText,
        count: 1,
        searchText: citationText.slice(0, 120)
      });
    }
  }
  const citeCountRows = [...citeFormRows.values()];
  citeCountRows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const yearGroup = new Map();
  for(const pr of parsedRefs){
    const y = (pr.year || '').match(/\d{4}/);
    const year = y ? y[0] : '未知';
    yearGroup.set(year, (yearGroup.get(year) || 0) + 1);
  }
  const yearRows = [...yearGroup.entries()].map(([year, count]) => {
    return {
      year, label: year, count,
      // 每条同年份参考文献都包含年份本身；使用样例参考文献只能命中一条，
      // 无法在该年份的全部条目间前后导航。
      searchText: year === '未知' ? '' : year
    };
  });
  yearRows.sort((a, b) => b.count - a.count || a.year.localeCompare(b.year));

  const journalGroup = new Map();
  const journalSamples = new Map();
  for(const b of refBlocks){
    const jn = extractJournalName(b.text);
    if(!jn) continue;
    const key = jn.toLowerCase();
    journalGroup.set(key, (journalGroup.get(key) || 0) + 1);
    if(!journalSamples.has(key)) journalSamples.set(key, { name: jn, text: b.text });
  }
  const journalRows = [...journalGroup.entries()].map(([key, count]) => ({
    label: (journalSamples.get(key) || {}).name || key,
    count,
    // 期刊名才是分组内各条参考文献共有的文本。
    searchText: (journalSamples.get(key) || {}).name || key
  }));
  journalRows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    comments,
    stats: {
      missing: missingCites.length,
      unused: unusedRefs.length,
      format: [...formatByIdx.keys()].length,
      mismatch: mismatchComments.length,
      style: styleComments.length
    },
    bodyNorm, refBlocks,
    statsData: { citeCountRows, yearRows, journalRows }
  };
}

/* ==================================================================
 * 对外入口 — 供 Swift 调用
 * ================================================================== */
// 注入规则包 ctx 并恢复默认风格（APA7）
window.RulesManager.setCtx(buildRuleCtx());
window.RulesManager.restoreActive();

// 返回 JSON 字符串（Swift 直接 toString 解析）
window.citationRunDetection = function (docJSONString) {
  var doc;
  try {
    doc = JSON.parse(docJSONString || '{}');
  } catch (e) {
    return JSON.stringify({ error: '解析输入 JSON 失败: ' + e.message, stats: {}, comments: [] });
  }
  var paragraphs = (doc && doc.paragraphs) || [];
  var split = splitBodyAndReferences(paragraphs);
  var refBlocks = split.refsParagraphs.map(function (p) {
    var isEntire = !!p.entireItalic;
    return {
      text: p.text,
      rawText: p.text,
      italics: isEntire ? [[0, p.text.length]] : (p.italicRanges || []),
      html: escapeHtml(p.text)
    };
  });
  var result = runDetection(split.body, refBlocks);
  var out = {
    stats: result.stats,
    comments: (result.comments || []).map(function (c) {
      return {
        id: c.id, color: c.color, tag: c.tag,
        quote: c.quote, count: c.count || 1,
        desc: c.desc, searchText: c.searchText || '', inRef: !!c.inRef
      };
    }),
    statsData: result.statsData || null
  };
  return JSON.stringify(out);
};
