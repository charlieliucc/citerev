// ==================================================================
  // 基础工具函数
  // ==================================================================
  function normalizeSpace(s){
    return (s ?? "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(str){
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 参考文献编辑器只需要少量排版标签。将粘贴内容重建到全新的 DOM 中，
  // 不复制任何属性，避免事件处理器、URL、图片、SVG 等主动内容进入页面。
  const SAFE_EDITOR_TAGS = new Set(['DIV', 'P', 'BR', 'EM', 'I', 'STRONG', 'B', 'U']);
  function sanitizeEditorHtml(html){
    const source = document.createElement('template');
    source.innerHTML = String(html || '');
    const output = document.createElement('div');

    function appendSafe(node, parent){
      if(node.nodeType === Node.TEXT_NODE){
        parent.appendChild(document.createTextNode(node.nodeValue || ''));
        return;
      }
      if(node.nodeType !== Node.ELEMENT_NODE) return;
      if(!SAFE_EDITOR_TAGS.has(node.tagName)){
        node.childNodes.forEach(child => appendSafe(child, parent));
        return;
      }
      const clean = document.createElement(node.tagName.toLowerCase());
      node.childNodes.forEach(child => appendSafe(child, clean));
      parent.appendChild(clean);
    }

    source.content.childNodes.forEach(node => appendSafe(node, output));
    return output.innerHTML;
  }

  function insertSanitizedHtmlAtSelection(html){
    const template = document.createElement('template');
    template.innerHTML = sanitizeEditorHtml(html);
    const selection = window.getSelection();
    if(!selection || selection.rangeCount === 0){
      editor.appendChild(template.content);
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const last = template.content.lastChild;
    range.insertNode(template.content);
    if(last){
      range.setStartAfter(last);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function stripOuterPunct(s){
    return normalizeSpace((s ?? "")
      .replace(/^[\s,;:]+/g, "")
      .replace(/[\s,;:]+$/g, ""));
  }

  function normalizeYear(y){
    return (y ?? "").toLowerCase();
  }

  function isInitialToken(tok){
    return /^([A-Za-z])\.?$/.test((tok ?? "").trim());
  }

  function isAllInitials(tok){
    const w = (tok ?? "").trim().split(/\s+/).filter(Boolean);
    return w.length > 0 && w.every(x => /^([A-Za-z])\.?$/.test(x));
  }

  // ==================================================================
  // 作者 / 引用解析（APA 常见写法）
  // ==================================================================
  function parseSingleAuthorToken(token){
    let t = normalizeSpace(token).replace(/\.$/, "");
    t = t.replace(/['’‘]s?$/u, "");
    if(!t) return { surname:"", initial:"" };

    const words = t.split(/\s+/).filter(Boolean);

    const initials = [];
    let i = 0;
    while(i < words.length - 1 && /^([A-Za-z])\.?$/.test(words[i])){
      initials.push(words[i].replace(/\./g, "").toLowerCase());
      i++;
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
    if(/\bet\s+al\.?\b/i.test(s)){
      etal = true;
      s = s.replace(/\bet\s+al\.?\b.*$/i, "").trim();
    }

    s = s.replace(/as\s+cited\s+in\s+/gi, " ");
    s = s.replace(/(^|[\s(,;:])(?:see(?:\s+also)?|e\.g\.|i\.e\.|cf\.)\s*,?/gi, "$1");
    s = normalizeSpace(s);
    if(!s) return { authors: [], etal:false };

    const sep = allowAnd ? /\s*(?:&|\band\b)\s*/i : /\s*&\s*/;
    const groups = s.split(sep).map(x => x.trim()).filter(Boolean);
    const authors = [];
    for(const g of groups){
      const segs = g.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
      let pendingInitial = "";
      let i = 0;
      while(i < segs.length){
        const seg = segs[i];
        if(isInitialToken(seg) || isAllInitials(seg)){
          if(authors.length === 0 && i === 0){
            pendingInitial = seg.replace(/\./g, "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 1);
            i++;
            continue;
          }
          const last = authors[authors.length - 1];
          if(last && !last.initial){
            last.initial = seg.replace(/\./g, "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 1);
          }
          i++;
          continue;
        }
        const a = parseSingleAuthorToken(seg);
        if(a && normalizeSpace(a.surname)){
          if(!a.initial && pendingInitial){ a.initial = pendingInitial; pendingInitial = ""; }
          if(i + 1 < segs.length && isInitialToken(segs[i + 1]) && !a.initial){
            a.initial = segs[i + 1].replace(/\./g, "").toLowerCase();
            i += 2;
          } else {
            i += 1;
          }
          authors.push(a);
        } else {
          i++;
        }
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
      addFirstEtal();
      addFirst();
      return [...keys];
    }
    keys.add(`${surnames.join("&")}-${y}`);
    if(parts.length === clean.length) keys.add(`${parts.join("&")}-${y}`);
    addFirstEtal();
    addFirst();
    return [...keys];
  }

  function splitReferenceEntries(refText){
    return window.CitationReferenceSplitter.splitReferences(refText ?? "");
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
    while((m = reSurnameInitial.exec(authorsPart))){
      authors.push({ surname: m[1], initial: (m[2] ?? "").toLowerCase() });
    }

    if(authors.length === 0){
      const org = authorsPart.trim().split(/[\.(,]/)[0]?.trim();
      if(org) authors.push({ surname: org, initial: "" });
    }

    const keys = buildKeys(authors, false, year);

    return {
      raw: entry,
      year,
      surnames: authors.map(a => a.surname),
      authors,
      keys: [...keys]
    };
  }

  // ---- 参考文献字母排序辅助 ----
  // 用于字母排序的键：按姓氏原样（含 de/van 等前缀词）字母顺序 → 全部作者 → 年份
  // 注意：不忽略前置词，因为「de Kleijn」应排在「Fairley」之前（d 在 f 之前）。
  function refOrderKey(pr){
    const first = (pr.surnames && pr.surnames[0]) ? pr.surnames[0].toLowerCase() : '￿';
    const authors = (pr.authors || []).map(a => ((a.surname || '') + ' ' + (a.initial || '')).toLowerCase()).join(' ');
    return first.replace(/[^a-z]/g, '') + ' ' + authors.replace(/[^a-z]/g, '') + ' ' + (pr.year || '');
  }
  // 用于批注说明的简短条目标签，例如 "Goffman, E. (1955)"
  function refLabel(pr){
    const a = pr.authors && pr.authors[0];
    if(!a) return (pr.raw || '').slice(0, 40).trim() || '(无法识别的条目)';
    let s = `${a.surname}, ${a.initial ? a.initial.toUpperCase() + '.' : ''}`;
    if(pr.authors.length > 1) s += ' et al.';
    if(pr.year) s += ` (${pr.year})`;
    return s.trim();
  }

  function stableIdFromString(s){
    const str = String(s ?? "");
    let h = 0x811c9dc5;
    for(let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return `h${h.toString(16)}`;
  }

  // ==================================================================
  // 文中引用提取
  // ==================================================================
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

  function extractCitationsFromBody(bodyText){
    const text = (bodyText ?? "").replace(/\r\n/g, "\n");
    const citations = [];
    const stopwords = new Set(["figure","table","section","chapter","note","appendix","equation","example","vol","no","pp","p","eq","ref","ibid","see","note","id"]);

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
        citations.push({ authorsRaw: ap, year: normalizeYear(years[0]), authors, etal, raw: `(${chunk})`, start: pm.index, end: pm.index + pm[0].length });
      }
    }

    const narrativeRe = /\b([A-Z][A-Za-z'’\-]*(?:\.?\s+(?:[A-Z][A-Za-z'’\-]*\.?|and|&|et\s+al\.?|of|the|for|on|in|to|by|with|de|van|der|la|du|des|del|y))*)\s*'?s?\s*\((\d{4}[a-z]?)\)/g;
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
      citations.push({ authorsRaw: authorToken, year: normalizeYear(nm[2]), authors, etal, raw: nm[0], start: nm.index, end: nm.index + nm[0].length });
    }

    return citations;
  }

function contextSnippet(text, start, end){
    if(start == null) return '';
    const a = Math.max(0, start - 60);
    const b = Math.min(text.length, (end == null ? start : end) + 60);
    let s = text.slice(a, b).replace(/\s+/g, ' ').trim();
    return (a > 0 ? '…' : '') + s + (b < text.length ? '…' : '');
  }

function overlapsItalic(italicRanges, start, end){
    if(start == null || end == null) return false;
    for(const [s,e] of (italicRanges || [])){
      const ov = Math.max(0, Math.min(e,end) - Math.max(s,start));
      if(ov > 0) return true;
    }
    return false;
  }
