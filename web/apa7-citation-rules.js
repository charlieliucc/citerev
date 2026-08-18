// ==================================================================
  // In-Text 精细检测规则（移植自加载项 APA7 风格包 rules-apa7.js）
  // 分类体系：mismatch（红）＝ 引用不匹配/结构问题；style（橙）＝ 样式警告
  // 每个 comment 携带 start/end，供左侧正文高亮定位
  // ==================================================================
  function isNarrativeCitation(c){ return !/^\(.*\)$/.test((c.raw || "").trim()); }
  function splitSubCitesInChunk(chunkText){
    let s = String(chunkText || '').replace(/\s+/g, ' ').trim().replace(/^\(+/, "").replace(/\)+$/, "");
    return s.split(/\s*;\s*/).map(x => x.trim()).filter(Boolean);
  }
  function yearsInChunk(chunkText){
    const years = (chunkText || "").match(/\d{4}[a-z]?/gi) || [];
    return years.map(y => String(y).toLowerCase());
  }
  function hasAmpersand(chunkText){ return /&/.test(chunkText || ""); }
  function hasPageNotation(chunkText){
    const t = chunkText || "";
    return /\bp(?:p)?\.\s*\d+(?:\s*[–-]\s*\d+)?/i.test(t);
  }
  function isSecondarySource(chunkText){ return /\bas\s+cited\s+in\b/i.test(chunkText || ""); }
  function hasIbid(chunkText){ return /\bibid\.?/i.test(chunkText || ""); }
  function hasPersonalComm(chunkText){
    return /\b(?:personal\s+communication|personal\s+correspondence|pers\.\s*comm\.?|personal\s+interview|personal\s+email|personal\s+conversation)\b/i.test(chunkText || "");
  }
  function hasPageButNoYear(chunkText){
    const t = chunkText || "";
    const hasPage = /\b(?:p|pp)\.\s*\d+|\b\d+\s*[–-]\s*\d+\b/.test(t);
    const hasYear = /\d{4}[a-z]?/.test(t);
    return hasPage && !hasYear;
  }
  function findRefsByAuthorKey(parsedRefs, surname, initial){
    const out = [];
    for(const pr of parsedRefs){
      for(const a of pr.authors){
        const s = normalizeSpace(a.surname).toLowerCase();
        if(s === (surname || "").toLowerCase()){
          if(!initial || !a.initial || a.initial.toLowerCase() === initial.toLowerCase()){ out.push(pr); break; }
        }
      }
    }
    return out;
  }
  function findRefsByYear(parsedRefs, year){
    const y = normalizeYear(year);
    return parsedRefs.filter(pr => pr.year === y);
  }
  function authorsToDisplay(c){
    const authors = c.authors || [];
    if(authors.length === 0) return c.authorsRaw || '';
    const parts = authors.map(a => {
      let s = a.surname || '';
      if(a.initial) s = s + ', ' + a.initial.toUpperCase() + '.';
      return s;
    });
    if(authors.length === 1) return parts[0];
    if(authors.length === 2) return parts[0] + ' & ' + parts[1];
    return parts[0] + ' et al.';
  }
  function detectInTextMismatches(rawCites, parsedRefs, refKeyToRef){
    const comments = [];
    let idx = 0;
    for(const c of rawCites){
      const authors = c.authors || [];
      const year = c.year;
      const keys = buildKeys(authors, c.etal, year);
      const exactMatch = keys.some(k => refKeyToRef.has(k));
      if(exactMatch) continue;

      const displayAuthor = authorsToDisplay(c);
      const surname = authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : "";
      const initial = authors.length ? (authors[0].initial || "").toLowerCase() : "";
      const yearRefs = findRefsByYear(parsedRefs, year);
      const authorRefs = surname ? findRefsByAuthorKey(parsedRefs, surname, initial) : [];

      if(yearRefs.length === 0 && authorRefs.length === 0){
        comments.push({
          id: 'im' + (idx++), color: 'mismatch', tag: '引用缺失',
          quote: c.raw, count: 1, start: c.start, end: c.end,
          desc: `正文中出现引用（${escapeHtml(displayAuthor)}, ${escapeHtml(year)}），但在参考文献列表中既找不到该作者，也找不到该年份。可能是漏列参考文献，或文中年份不需要引用。`
        });
        continue;
      }
      if(yearRefs.length > 0 && authorRefs.length === 0){
        const suggestions = yearRefs.slice(0, 3).map(pr => refLabel(pr)).join('；');
        comments.push({
          id: 'im' + (idx++), color: 'mismatch', tag: '作者不匹配',
          quote: c.raw, count: 1, start: c.start, end: c.end,
          desc: `参考文献中有 ${year} 年的条目，但没有与作者「${escapeHtml(displayAuthor)}」匹配的。疑似漏列参考文献或作者拼写错误。可能的匹配：${escapeHtml(suggestions)}`
        });
        continue;
      }
      if(authorRefs.length > 0 && yearRefs.length === 0){
        const suggestions = authorRefs.slice(0, 3).map(pr => refLabel(pr)).join('；');
        comments.push({
          id: 'im' + (idx++), color: 'mismatch', tag: '年份不匹配',
          quote: c.raw, count: 1, start: c.start, end: c.end,
          desc: `参考文献中有作者「${escapeHtml(displayAuthor)}」的条目，但年份 ${escapeHtml(year)} 不匹配。疑似年份笔误或漏列。可能的匹配：${escapeHtml(suggestions)}`
        });
        continue;
      }
      if(authorRefs.length > 0 && yearRefs.length > 0){
        const suggestions = authorRefs.slice(0, 3).map(pr => refLabel(pr)).join('；');
        comments.push({
          id: 'im' + (idx++), color: 'mismatch', tag: '作者与年份不匹配',
          quote: c.raw, count: 1, start: c.start, end: c.end,
          desc: `找到了作者「${escapeHtml(displayAuthor)}」的条目，但年份 ${escapeHtml(year)} 不一致。可能的匹配：${escapeHtml(suggestions)}`
        });
        continue;
      }
    }
    return comments;
  }

  function detectInTextStructural(rawCites, parsedRefs){
    const comments = [];
    let idx = 0;
    for(const c of rawCites){
      const authors = c.authors || [];
      const chunk = c.raw || "";

      if(isSecondarySource(chunk)){
        comments.push({
          id: 'is' + (idx++), color: 'mismatch', tag: '疑似二次文献',
          quote: chunk, count: 1, start: c.start, end: c.end,
          desc: '该引用看起来是二次文献（如 Jones, 2010, as cited in Smith, 2020）。请确认是否确实需要使用二次来源，APA 7 要求使用 "as cited in" 格式，且只在参考文献中列出二级来源（被引者）。'
        });
      }
      if(hasPersonalComm(chunk)){
        comments.push({
          id: 'is' + (idx++), color: 'mismatch', tag: '个人通讯',
          quote: chunk, count: 1, start: c.start, end: c.end,
          desc: '个人通讯（personal communication）不属于可检索来源，不应列入参考文献列表。请确认参考文献中未包含该条目（若已包含，应删除）。'
        });
      }
      if(hasPageButNoYear(chunk)){
        comments.push({
          id: 'is' + (idx++), color: 'mismatch', tag: '页码无年份',
          quote: chunk, count: 1, start: c.start, end: c.end,
          desc: '该括号中似乎包含页码，但没有明显的年份来匹配参考文献，请检查是否遗漏了年份。'
        });
      }
      if(c.etal && authors.length >= 1){
        const leadSurname = normalizeSpace(authors[0].surname).toLowerCase();
        const leadInitial = authors[0].initial ? authors[0].initial.toLowerCase() : '';
        const sameKeyRefs = parsedRefs.filter(pr =>
          pr.authors.length >= 1 &&
          normalizeSpace(pr.authors[0].surname).toLowerCase() === leadSurname &&
          pr.year === c.year
        );
        const etalTargets = sameKeyRefs.filter(pr => pr.authors.length >= 3);
        if(sameKeyRefs.length > 0){
          if(etalTargets.length === 0){
            const ref = sameKeyRefs[0];
            comments.push({
              id: 'is' + (idx++), color: 'mismatch', tag: 'et al. 使用不当',
              quote: chunk, count: 1, start: c.start, end: c.end,
              desc: `引用使用了 "et al."，但匹配的参考文献「${escapeHtml(refLabel(ref))}」作者数不足 3 人。APA 7 中 "et al." 仅用于 3 位及以上作者的文献，此处应列出全部作者。`
            });
          }
          const ambiguousTargets = etalTargets.filter(pr => {
            const fi = pr.authors[0].initial ? pr.authors[0].initial.toLowerCase() : '';
            return !leadInitial || fi === leadInitial;
          });
          if(ambiguousTargets.length > 1){
            const matchesListedAuthors = (pr) => {
              for(let i = 1; i < authors.length; i++){
                const cSurname = normalizeSpace(authors[i].surname).toLowerCase();
                const prSurname = pr.authors[i] ? normalizeSpace(pr.authors[i].surname).toLowerCase() : '';
                if(!cSurname || cSurname !== prSurname) return false;
              }
              return true;
            };
            const disambiguated = ambiguousTargets.filter(pr => matchesListedAuthors(pr));
            if(disambiguated.length !== 1){
              const labels = ambiguousTargets.slice(0, 3).map(pr => refLabel(pr)).join('；');
              comments.push({
                id: 'is' + (idx++), color: 'mismatch', tag: 'et al. 歧义',
                quote: chunk, count: 1, start: c.start, end: c.end,
                desc: `使用 "et al." 无法区分多条同作者同年份的参考文献。APA 7（8.18）要求写出足够多作者直到 "et al." 能唯一确定条目，如 (Smith, Jones, et al., ${escapeHtml(c.year)})。候选条目：${escapeHtml(labels)}`
              });
            }
          }
        }
      }
      if(!c.etal && authors.length >= 3){
        const leadSurname = normalizeSpace(authors[0].surname).toLowerCase();
        const matchingRefs = parsedRefs.filter(pr =>
          pr.authors.length >= 3 &&
          normalizeSpace(pr.authors[0].surname).toLowerCase() === leadSurname &&
          pr.year === c.year
        );
        if(matchingRefs.length > 0){
          if(matchingRefs.length > 1){
            const labels = matchingRefs.slice(0, 3).map(pr => refLabel(pr)).join('；');
            comments.push({
              id: 'is' + (idx++), color: 'mismatch', tag: '应使用 et al. 或展开消歧',
              quote: chunk, count: 1, start: c.start, end: c.end,
              desc: `该文献有 3 位及以上作者。但因存在多条「${escapeHtml(authors[0].surname)} + ${escapeHtml(c.year)}」的文献，直接缩略成 "et al." 会产生歧义。应写出足够多作者直到可区分，如 (${escapeHtml(authors[0].surname)}, ${escapeHtml(authors[1] ? authors[1].surname : '…')}, ${escapeHtml(authors[2] ? authors[2].surname : '…')}, et al., ${escapeHtml(c.year)})。候选条目：${escapeHtml(labels)}`
            });
          } else {
            comments.push({
              id: 'is' + (idx++), color: 'mismatch', tag: '应使用 et al.',
              quote: chunk, count: 1, start: c.start, end: c.end,
              desc: `该文献有 3 位及以上作者，APA 7 要求首次及所有后续引用均使用第一作者 + "et al."。应改为「${escapeHtml(authors[0].surname)} et al., ${escapeHtml(c.year)}」。`
            });
          }
        }
      }
      const dualYear = (chunk.match(/\(\s*(?:[A-Za-z]?\d{4}[a-z]?)\s*\/\s*(\d{4}[a-z]?)\s*\)/) ||
                        chunk.match(/(\d{4}[a-z]?)\s*\/\s*(\d{4}[a-z]?)/));
      if(dualYear){
        const originalYear = dualYear[1] ? String(dualYear[1]).toLowerCase() : null;
        if(originalYear){
          const leadSurname = authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : "";
          const ref = parsedRefs.find(pr =>
            pr.year === c.year &&
            (!leadSurname || (pr.authors[0] && normalizeSpace(pr.authors[0].surname).toLowerCase() === leadSurname)) &&
            !/\b(?:original|orig\.|first published|originally published)\b/i.test(pr.raw)
          );
          if(ref){
            const dy = chunk.match(/\d{4}[a-z]?\s*\/\s*\d{4}[a-z]?/);
            comments.push({
              id: 'is' + (idx++), color: 'mismatch', tag: '原版年份缺失',
              quote: chunk, count: 1, start: c.start, end: c.end,
              desc: `该引用为再版/重印文献（双年份 ${escapeHtml(dy ? dy[0] : '')}），但参考文献条目未注明原始出版年。APA 7 要求在参考文献中加注原版信息（如 "Original work published 20XX"）。`
            });
          }
        }
      }
    }
    return comments;
  }

  function detectInTextStyleWarnings(rawCites, parsedRefs){
    const comments = [];
    let idx = 0;
    for(const c of rawCites){
      const chunk = c.raw || "";
      const narrative = isNarrativeCitation(c);
      const subCites = splitSubCitesInChunk(chunk);
      const isMulti = subCites.length > 1;

      if(isMulti && !narrative){
        const order = subCites.map(sc => {
          const { authors } = parseInTextAuthorList(sc, { allowAnd: false });
          return authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : '\uffff';
        });
        let ok = true;
        for(let i = 1; i < order.length; i++){
          if(order[i] < order[i - 1]){ ok = false; break; }
        }
        if(!ok){
          comments.push({
            id: 'sw' + (idx++), color: 'style', tag: '样式警告',
            quote: chunk, count: 1, start: c.start, end: c.end,
            desc: '同一括号内的多个引用应按字母顺序排列（与参考文献列表规则一致）。请调整为作者姓氏的字母序。'
          });
        }
      }

      if(isMulti && !narrative){
        const years = yearsInChunk(chunk);
        if(years.length >= 2){
          let chronoOk = true;
          for(let i = 1; i < years.length; i++){
            if(years[i] < years[i - 1]){ chronoOk = false; break; }
          }
          const firstSurnames = subCites.map(sc => {
            const { authors } = parseInTextAuthorList(sc, { allowAnd: false });
            return authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : null;
          }).filter(Boolean);
          const allSameAuthor = firstSurnames.length > 0 && firstSurnames.every(s => s === firstSurnames[0]);
          if(!chronoOk && allSameAuthor){
            comments.push({
              id: 'sw' + (idx++), color: 'style', tag: '样式警告',
              quote: chunk, count: 1, start: c.start, end: c.end,
              desc: '同一作者/作者的多个年份引用应按时间顺序排列，如 (Author, 2012, 2013)。'
            });
          }
        }
      }

      if(!narrative && isMulti){
        const inner = chunk.replace(/^\(|\)$/g, '');
        const multiPattern = inner.split(/\s*;\s*/).length < 2 &&
          /\b[A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+\s*,?\s*\d{4}[a-z]?\s*,\s+[A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+/i.test(inner);
        if(multiPattern){
          comments.push({
            id: 'sw' + (idx++), color: 'style', tag: '样式警告',
            quote: chunk, count: 1, start: c.start, end: c.end,
            desc: '同一括号内的多个引用应以分号（;）加空格分隔，而非逗号。'
          });
        }
      }

      if(!narrative){
        const inner = chunk.replace(/^\(|\)$/g, '');
        if(/[A-Za-z\u00C0-\u017F]\d{4}[a-z]?/.test(inner) && !/(?:,|\s)\d{4}[a-z]?/.test(inner)){
          comments.push({
            id: 'sw' + (idx++), color: 'style', tag: '样式警告',
            quote: chunk, count: 1, start: c.start, end: c.end,
            desc: '括号引用中作者与年份之间应有逗号加空格，如 (Author, 2020)。'
          });
        }
      }

      if(/\bet\s+al\b(?![\.!\?])/i.test(chunk) && !/\bet\s+al\.(\s|$|[\)])/i.test(chunk)){
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1, start: c.start, end: c.end,
          desc: '"et al." 拼写不规范：应为 "et al."（al 后需有句点）。'
        });
      }

      if(narrative && hasAmpersand(chunk)){
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1, start: c.start, end: c.end,
          desc: '叙事引用（文内非括号）中，最后两位作者之间应使用 "and" 而非 "&"（& 仅用于括号引用）。'
        });
      }

      if(isMulti && !narrative){
        const firstSurnames = subCites.map(sc => {
          const { authors } = parseInTextAuthorList(sc, { allowAnd: false });
          return authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : null;
        }).filter(Boolean);
        const allSameAuthor = firstSurnames.length > 0 && firstSurnames.every(s => s === firstSurnames[0]);
        if(allSameAuthor && subCites.some(sc => sc.includes(',') && /\d{4}/.test(sc))){
          const repeated = subCites.filter(sc => {
            const { authors } = parseInTextAuthorList(sc, { allowAnd: false });
            return authors.length && normalizeSpace(authors[0].surname).toLowerCase() === firstSurnames[0];
          }).length >= 2;
          if(repeated){
            comments.push({
              id: 'sw' + (idx++), color: 'style', tag: '样式警告',
              quote: chunk, count: 1, start: c.start, end: c.end,
              desc: '同一作者的多个年份引用应使用收缩形式，如 (Smith, 2012, 2013)，不必重复作者姓氏。'
            });
          }
        }
      }

      if(!hasPageNotation(chunk) && /\b\d+\s*[–-]\s*\d+\b/.test(chunk) && !hasPageButNoYear(chunk)){
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1, start: c.start, end: c.end,
          desc: '页码应使用 "p."（单页）或 "pp."（多页）记号，如 (Author, 2020, pp. 12–34)。'
        });
      }

      if(/\b\d{4}[a-z]?\s*,?\s*(?:cited|see)\b/i.test(chunk) && !isSecondarySource(chunk)){
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1, start: c.start, end: c.end,
          desc: '该引用疑似二次文献但格式不正确。APA 7 应使用 "as cited in" 格式，如 (Original, 2010, as cited in Secondary, 2020)。'
        });
      }

      if(hasIbid(chunk)){
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1, start: c.start, end: c.end,
          desc: '"ibid." 记号在 APA 格式中无效，请改为完整作者-年份引用。'
        });
      }
    }

    for(const c of rawCites){
      const chunk = c.raw || "";
      const etAlMatch = chunk.match(/\b[A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+\s*,\s*et\s+al\./i);
      if(etAlMatch){
        const before = chunk.slice(0, etAlMatch.index + etAlMatch[0].indexOf('et'));
        const nameSegs = before.split(',').map(s => s.trim()).filter(Boolean);
        if(nameSegs.length <= 1){
          comments.push({
            id: 'sw' + (idx++), color: 'style', tag: '样式警告',
            quote: chunk, count: 1, start: c.start, end: c.end,
            desc: '单作者与 "et al." 之间只需空格，不需要逗号，应为 (Author et al., 2020)。'
          });
        }
      }
    }

    {
      const surnameToInitials = new Map();
      for(const pr of parsedRefs){
        if(!pr.authors.length) continue;
        const s = normalizeSpace(pr.authors[0].surname).toLowerCase();
        if(!surnameToInitials.has(s)) surnameToInitials.set(s, new Set());
        if(pr.authors[0].initial) surnameToInitials.get(s).add(pr.authors[0].initial.toLowerCase());
      }
      for(const [surname, inits] of surnameToInitials){
        if(inits.size <= 1) continue;
        for(const c of rawCites){
          const { authors } = parseInTextAuthorList((c.raw || '').replace(/^\(|\)$/g, ''), { allowAnd: false });
          const sameSurnameInCite = authors.filter(a => normalizeSpace(a.surname).toLowerCase() === surname).length >= 2;
          if(sameSurnameInCite) continue;
          const hit = authors.find(a => normalizeSpace(a.surname).toLowerCase() === surname);
          if(hit && !hit.initial){
            const initialsLabel = [...inits].map(x => x.toUpperCase()).join('/');
            comments.push({
              id: 'sw' + (idx++), color: 'style', tag: '样式警告',
              quote: c.raw, count: 1, start: c.start, end: c.end,
              desc: `参考文献中有多位第一作者同姓「${escapeHtml(surname)}」但首字母不同（${escapeHtml(initialsLabel)}）。APA 7（§8.20）要求在引用时写出首字母以消除歧义，如 (${escapeHtml(surname[0].toUpperCase() + surname.slice(1))} ${[...inits][0].toUpperCase()}, 年份)。请先确认参考文献条目中的首字母准确。`
            });
            break;
          }
        }
      }
    }

    return comments;
  }

// ==================================================================
  // APA 7 格式检查
  // ==================================================================
  function classifyReference(text, italics){
    const t = text;
    const tPages = stripUrlsForPages(t);
    const hasDoi = /doi\.org\//i.test(t) || /\b10\.\d{4,9}\//.test(t);
    const hasUrl = /https?:\/\//i.test(t);
    const hasPages = /\b\d+\s*[–-]\s*\d+\b/.test(tPages);
    const hasVolumeIssue = /\b\d+\s*\(\s*\d+\s*\)/.test(t);
    const hasAdvanceOnline = /\bAdvance online publication\b/i.test(t);
    const hasVolPages = /,\s*\d{1,4}\s*(?:\([^)]*\))?\s*,\s*[\d–]+\s*\d/.test(t);
    const hasVolumeCommaArticle = /,\s*\d{1,4}\s*,\s*(?:e\d+|\d{4,}|[A-Za-z]\d{4,})\b/.test(t);
    const isDissertation = /\[(?:[^\]]*\b(?:doctoral dissertation|master['’]s thesis|ph\.?d\.?|d\.?phil\.?|dissertation|thesis)\b[^\]]*)\]/i.test(t);
    // 书籍章节：含 "In" 且 "In" 后跟编者 "(Ed./Eds.)" 或页码 "(pp./p. ...)"。
    const hasEditorsAfterIn = (() => {
      const inIdx = t.search(/\bIn\s+/i);
      if(inIdx < 0) return false;
      return /\(Eds?\.\)/.test(t.slice(inIdx));
    })();
    const hasPagesAfterIn = (() => {
      const inIdx = t.search(/\bIn\s+/i);
      if(inIdx < 0) return false;
      return /\(pp?\.\s*\d+\s*[–-]\s*\d+\)/i.test(t.slice(inIdx));
    })();
    const isChapter = hasEditorsAfterIn || hasPagesAfterIn;
    const isWebReport = /\bRetrieved from\b|\bAvailable at\b|\bAccessed\b/i.test(t);
    const hasEdition = /\(\s*\d+(?:st|nd|rd|th)\s+ed\.?\s*\)/i.test(t);
    // 缺少卷期页码的期刊条目仍可能由排版明确识别：年份后有文章标题，
    // 而末尾第二个元素（期刊名）为斜体。图书恰好相反，通常是第一个
    // 标题元素斜体、末尾为出版社，因此不能只靠纯文本将两者都归为图书。
    const trailingSource = t.match(/\)\.\s+.+?\.\s+([^\.]+)\.\s*$/);
    const trailingSourceStart = trailingSource && trailingSource.index != null
      ? trailingSource.index + trailingSource[0].lastIndexOf(trailingSource[1])
      : -1;
    const hasItalicTrailingSource = trailingSourceStart >= 0 &&
      overlapsItalic(italics, trailingSourceStart, trailingSourceStart + trailingSource[1].length);
    const isBook = hasEdition ||
      (hasDoi && !isChapter && !hasVolPages && !hasVolumeCommaArticle) ||
      (!hasDoi && /\)\.\s+.+\.\s+[A-Z][A-Za-z\s&'’\-]+\.?\s*(?:https?:\/\/\S+)?\s*$/i.test(t));

    if(isWebReport && !hasDoi) return '网页/在线资源（推测）';
    if(isDissertation) return '学位论文（推测）';
    if(isChapter) return '书籍章节（推测）';
    if(hasItalicTrailingSource) return '期刊文章（推测，出版信息不完整）';
    if(isBook) return '图书/报告（推测）';
    if(hasDoi) return '期刊文章（推测）';
    if(hasVolumeIssue && (hasPages || hasUrl)) return '期刊文章（推测）';
    if(hasVolPages || hasVolumeCommaArticle) return '期刊文章（推测）';
    if(hasUrl && /\)\.\s+.+\./.test(t)) return '网页/在线资源（推测）';
    return '未识别类型（按通用规则检查）';
  }

  function issue(sev, msg, meta){
    return { severity: sev, message: msg, meta: meta || '' };
  }

  function stripUrlsForPages(t){
    return (t || '')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/\b10\.\d{4,9}\/\S+/g, ' ')
      .replace(/\bdoi:\S+/gi, ' ');
  }

  function checkGeneral(line){
    const issues = [];
    const t = line.text;
    if(!t) return issues;

    if(/\s{2,}/.test(line.rawText)) issues.push(issue('warn', '存在连续空格，建议压缩为空格。', '空格'));

    // ★ terminal-period：条目结尾缺句号（APA 7 多数条目以句号结尾；以 URL/DOI 结尾的不加句号）
    const endsWithUrlOrDoi = /(https?:\/\/\S+|\b10\.\d{4,}\/\S+)$/.test(t);
    if(!endsWithUrlOrDoi && !/[.?!]$/.test(t) && /\S/.test(t)){
      issues.push(issue('warn', '该参考条目结尾缺少句号。APA 7 中大多数条目以句号结尾（以 URL 或 DOI 结尾的除外）。', '标点'));
    }

    // APA 7 括号内的日期格式：(2020) / (2020a) / (2020, November 11) / (2020, Spring) / (n.d.)
    const yearMatch = t.match(/\((n\.d\.|\d{4}(?:[a-z])?(?:,\s*[A-Za-z]+(?:\s+\d{1,2})?)?)\)/i);
    if(!yearMatch){
      issues.push(issue('bad', '未找到年份括号格式：应类似 (2020). 或 (n.d.).', '年份'));
    } else {
      const yearIdx = yearMatch.index != null ? yearMatch.index : -1;
      const after = t.slice(yearIdx + yearMatch[0].length);
      if(!/^\./.test(after.trimStart())){
        issues.push(issue('bad', '年份括号后通常需要句号：...(2020). Title...', '标点'));
      }
    }

    if(/\bdoi\s*:/i.test(t)){
      issues.push(issue('warn', '检测到 doi: 前缀；APA 7 推荐改为 DOI URL（https://doi.org/...）。', 'DOI'));
    }

    // ★ doi-url-format 增强：检测 dx.doi.org 前缀和 http://（非 https）的 DOI URL
    if(/dx\.doi\.org/i.test(t)){
      const dxDoi = t.match(/https?:\/\/(?:dx\.)?doi\.org\/(\S+)/i);
      issues.push(issue('warn', '检测到 dx.doi.org 前缀的 DOI；APA 7 推荐写成 https://doi.org/' + (dxDoi ? dxDoi[1] : '...') + '。', 'DOI'));
    } else if(/http:\/\/doi\.org/i.test(t)){
      const httpDoi = t.match(/http:\/\/doi\.org\/(\S+)/i);
      issues.push(issue('warn', '检测到 http:// 非加密的 DOI URL；APA 7 推荐使用 https://doi.org/' + (httpDoi ? httpDoi[1] : '...') + '。', 'DOI'));
    }

    const urlMatch = t.match(/(https?:\/\/\S+)$/i);
    if(urlMatch){
      const url = urlMatch[1];
      if(/[\)\]\>\,\;\:]+$/.test(url)){
        issues.push(issue('warn', 'URL 末尾疑似粘连了多余符号（括号/逗号等）。', 'URL'));
      }
      if(/[\.]$/.test(url)){
        issues.push(issue('warn', 'URL/DOI 行末一般不加句号。', 'URL/DOI'));
      }
    } else {
      const bareDoi = t.match(/\b10\.\d{4,9}\/[^\s]+/);
      if(bareDoi){
        issues.push(issue('warn', '检测到疑似裸 DOI；APA 7 推荐写成 https://doi.org/ + DOI。', 'DOI'));
      }
    }

    const tPages = stripUrlsForPages(t);
    const hyphenPages = tPages.match(/\b\d+\s*-\s*\d+\b/);
    const enDashPages = tPages.match(/\b\d+\s*–\s*\d+\b/);
    if(hyphenPages && !enDashPages){
      issues.push(issue('warn', '页码范围建议使用连接号 “–”（en dash），而不是连字符 “-”。', '页码'));
    }

    if(/\b(et al\.)\b/i.test(t) && /\bet\s+al\b(?!\.)/i.test(t)){
      issues.push(issue('warn', 'et al. 需要句点：et al.', '作者'));
    }
    if(/\w,&\w/.test(t)){
      issues.push(issue('warn', '“,&” 前后建议加空格：", &"。', '作者'));
    }
    // 裸首字母后应直接进入作者分隔符或日期。不能只判断下一个字符
    // “不是字母”：弯引号姓氏（如分隔符后的 O’Connor）会被误认成裸 O。
    if(/,\s*[A-Z](?!\.)(?=\s*(?:[,;&]|\(|$))/.test(t)){
      issues.push(issue('warn', '作者名字首字母通常带句点："Wang, H."', '作者首字母'));
    }

    // 独立的日期检查
    issues.push(...checkReferenceDate(t));
    // ★ title-case-smell：对年份括号之后的标题做 Title Case 嗅探
    checkTitleCaseSmell(t, issues);

    return issues;
  }

  function checkReferenceDate(t){
    const issues = [];
    if(!t) return issues;
    const dateMatch = t.match(/\(([^()]*?(\d{4}[a-z]?)[^()]*?)\)/i);
    const hasYearParen = /\(\s*(?:\d{4}[a-z]?|n\.d\.)/i.test(t);
    if(/\(n\.?d\.?\s*\)/i.test(t) && !/\(n\.d\./i.test(t))
      issues.push(issue('bad', '无日期应写为 "n.d."（两个点都要），当前写法缺少句点。', '日期'));
    if(!hasYearParen && /[A-Za-z\u00C0-\u017F]/.test(t) && /\S/.test(t)){
      issues.push(issue('bad', '未找到日期括号。APA 7 要求作者后紧跟日期并置于括号中，如 (2020).', '日期'));
    }
    const openParenNoYear = /\([^)]*\)/.test(t) && !/\([^()]*\d{4}[a-z]?[^()]*\)/.test(t) && /\(\s*[^)\d]/.test(t);
    if(openParenNoYear && /\([^()]*\)/.test(t) && !hasYearParen){
      issues.push(issue('bad', '检测到括号，但括号内没有年份。请确认日期是否写在括号内，如 (2020).', '日期'));
    }
    const yearComma = t.match(/\((\d{4}[a-z]?)\s*,\s*([^)]*)\)/);
    if(yearComma){
      const afterComma = yearComma[2].trim();
      if(afterComma && !/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Spring|Summer|Fall|Winter|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(afterComma)){
        issues.push(issue('warn', '年份后跟随逗号，但未识别到月份或季节（用于杂志/新闻等）。当前内容："' + afterComma + '"。', '日期'));
      } else if(/[A-Za-z]+/i.test(afterComma) && !/\d{1,2}(?:\s*[–-]\s*\d{1,2})?/.test(afterComma)){
        issues.push(issue('warn', '已识别到月份/季节，但缺少具体日期或日期范围，如 (2014, January 12–14)。', '日期'));
      }
    }
    if(/\(n\.d\.\s*[^\-)]/.test(t) || /\(n\.d\.\s*\w(?![-a-z])/i.test(t)){
      const nd = t.match(/\(n\.d\.\s*([a-z])\s*\)/i);
      if(nd) issues.push(issue('warn', '无日期消歧应使用连字符：应为 (n.d.-' + nd[1] + '.' + ')，当前缺少连字符。', '日期'));
    }
    if(/\bet\s+al\.?\b/i.test(t)){
      issues.push(issue('bad', 'APA 不允许在参考文献列表中写 "et al."，应列出所有作者。', '作者'));
    }
    return issues;
  }

  // 通用 Title Case 嗅探（APA 7 标题用 sentence case）
  function checkTitleCaseSmell(t, issues){
    if(!t || /\bIn\s+.+\(Eds?\.\)/.test(t)) return; // 跳过书籍章节（其章节标题规则不同）
    const yearMatch = t.match(/\(([^()]*?\d{4}[a-z]?[^()]*?)\)/i);
    if(!yearMatch) return;
    // 取年份括号之后的标题区
    let titleZone = t.slice(yearMatch.index + yearMatch[0].length);
    titleZone = titleZone.replace(/^\.\s*/, '').replace(/\s*https?:\/\/\S+$/, '').replace(/\s*10\.\d{4,9}\/\S+$/, '').trim();
    // 期刊文章：剔除期刊名（含其后的卷期页码），避免期刊名中的专有名词干扰标题判断
    const jn = extractJournalName(t);
    if(jn){
      const jnIdx = titleZone.indexOf(jn);
      if(jnIdx > 0) titleZone = titleZone.slice(0, jnIdx).trim();
    }
    // 取第一个句号前的完整句子
    const firstSentence = titleZone.split(/\.\s+(?=[A-Z0-9])/)[0] || titleZone;
    // 专门术语的全称后紧跟括号缩写时，其组成词可能按作者采用的专名形式
    // 保留大写（如 “Generative Artificial Intelligence (GenAI)”）。这些词
    // 不能作为整篇标题采用 Title Case 的证据。
    const caseScanSentence = firstSentence.replace(
      /\b(?:[A-Z][A-Za-zÀ-ÿ'’\-]+\s+){1,5}[A-Z][A-Za-zÀ-ÿ'’\-]+\s*\([A-Z][A-Za-z0-9\-]{1,}\)/g,
      phrase => phrase.toLowerCase()
    );
    const words = caseScanSentence.split(/\s+/).filter(Boolean);
    const meaningful = [];
    for(let i = 0; i < words.length; i++){
      const clean = words[i].replace(/[^A-Za-z\u00C0-\u017F]/g, '');
      if(clean.length >= 4){
        const prev = i > 0 ? words[i - 1] : '';
        const atSentenceStart = i === 0 || /[:;–—]\s*$/.test(prev);
        meaningful.push({ word: clean, atSentenceStart });
      }
    }
    if(meaningful.length < 3) return;
    const capCount = meaningful.filter(w => !w.atSentenceStart && /^[A-Z\u00C0-\u017F]/.test(w.word)).length;
    if(capCount >= 3){
      issues.push(issue('warn', '标题疑似使用了 Title Case。APA 7 中文章、章节、书名标题通常使用 sentence case（仅首词、冒号后首词与专有名词大写），如 "The effects of climate change on coral reefs"。', '大小写'));
    }
  }

  function checkReferenceAuthorFormat(line){
    const issues = [];
    const t = line.text;
    if(!t) return issues;
    const dateMatch = t.match(/\([^()]*?(\d{4}[a-z]?)[^()]*?\)/i);
    let authorPart = dateMatch ? t.slice(0, dateMatch.index) : t;
    authorPart = authorPart.trim();
    if(!authorPart) return issues;

    const authorLetters = (authorPart.match(/[A-Za-z\u00C0-\u017F]/g) || []).length;
    if(authorLetters < 2 && /[A-Za-z]/.test(t)){
      issues.push(issue('bad', '未检测到作者。请检查该条目是否符合 APA 参考格式（含作者与日期）。', '作者'));
    }

    // ★ author-name-order：作者名以 "First Last" 顺序开头（APA 7 要求倒置为 "Surname, Initials"）
    const authorWords = authorPart.trim().split(/\s+/).filter(Boolean);
    const properWordCount = authorWords.filter(w => /^[A-Z][a-z]+/.test(w)).length;
    const hasInitialTokens = authorWords.some(w => /^[A-Z]\.?$/.test(w));
    const firstNameOrder = /^[A-Z][a-z]+(?:\s+[A-Z]\.?)*\s+[A-Z][a-z]+\b/.test(authorPart);
    const noCommaInAuthorPart = !/,/.test(authorPart) && !/&/.test(authorPart);
    if(firstNameOrder && noCommaInAuthorPart && (properWordCount === 2 || hasInitialTokens)){
      const fL = authorPart.match(/^([A-Z][a-z]+)\s+([A-Z][a-z]+)$/);
      const suggestion = fL ? fL[2] + ', ' + fL[1].charAt(0) + '.' : undefined;
      issues.push(issue('bad',
        '作者名疑似为 "First Last" 顺序。APA 7 要求作者姓倒置为 "Surname, Initials" 格式（如 "Smith, J."）。' +
        (suggestion ? '建议改为 "' + suggestion + '"。' : ''),
        '作者'));
    }

    const orgDot = authorPart.match(/^([A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]*\.)\s*([,;:])/);
    if(orgDot) issues.push(issue('warn', '组织作者 "' + orgDot[1] + '" 后不应跟 "' + orgDot[2] + '"，应直接以句点结束作者区。', '作者'));

    const andJoin = authorPart.match(/([A-Za-z\u00C0-\u017F][\u00C0-\u017F'’\-]*\s+(?:[A-Z]\.?\s*)*)(\band\b)(\s+[A-Za-z\u00C0-\u017F][\u00C0-\u017F'’\-]*,?\s*[A-Z]\.)/i);
    if(andJoin) issues.push(issue('warn', '参考文献末两位作者之间应使用 "&" 而非 "and"，如 "Wang, H., & Chen, L."。', '作者'));
    // ★ and-vs-ampersand 增强：作者部分中出现 ", and X" 或 "and X"（X 为大写）即提示
    const andLoose = authorPart.match(/,?\s+and\s+(?=[A-Z])/);
    if(!andJoin && andLoose){
      issues.push(issue('warn', '参考文献末两位作者之间应使用 "&" 而非 "and"，如 "Wang, H., & Chen, L."。', '作者'));
    }
    if(/&[A-Za-z]/i.test(authorPart) && !/&\s/.test(authorPart))
      issues.push(issue('warn', '"&" 后应有空格。', '作者'));
    const ampCount = (authorPart.match(/&/g) || []).length;
    if(ampCount > 1) issues.push(issue('bad', '"&" 仅应用于连接最后两位作者，不能用于其它作者之间。', '作者'));

    const isIndividualAuthor = /,\s*[A-Z]\./.test(authorPart);
    if(isIndividualAuthor){
      const authorTokenRe = /([A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+)\s*,\s*([A-Z](?:\.[A-Z])*\.?)/g;
      let am;
      while((am = authorTokenRe.exec(authorPart))){
        const initials = am[2];
        if(/^[A-Z]$/.test(initials)){
          issues.push(issue('warn', '作者首字母 "' + initials + '" 后应有句点，如 "' + initials + '."。', '作者'));
        }
        if(/,\s*[A-Z]\./.test(initials)){
          issues.push(issue('warn', '首字母之间不应有逗号，如 "M. A."（用点号和空格分隔）。', '作者'));
        }
        if(/^[A-Z]\.[A-Z]\.$/.test(initials) && !/^[A-Z]\.\s+[A-Z]\.$/.test(initials)){
          issues.push(issue('warn', '作者首字母之间应有空格，如 "M. A." 而非 "M.A."。', '作者'));
        }
      }
      const noCommaPerson = authorPart.match(/\b([A-Z][a-z\u00C0-\u017F'’\-]+)\s+([A-Z])\.\b/g);
      if(noCommaPerson){
        for(const nc of noCommaPerson){
          const sp = nc.match(/\b([A-Z][a-z\u00C0-\u017F'’\-]+)\s+([A-Z])\./);
          if(sp && !new RegExp(sp[1] + '\\s*,', 'i').test(authorPart)){
            issues.push(issue('warn', '作者姓氏 "' + sp[1] + '" 后应有逗号，如 "' + sp[1] + ', ' + sp[2] + '."。', '作者'));
          }
        }
      }
    }

    const endComma = authorPart.match(/,(\s*)\(/);
    if(endComma) issues.push(issue('warn', '作者末尾、日期括号前不应有多余逗号。', '作者'));

    const suffixBeforeInitials = /([A-Za-z\u00C0-\u017F][\u00C0-\u017F'’\-]+)\s*(?:Jr\.?|Sr\.?|I{1,3}|IV|V)\s*,\s*([A-Z]\.)/i;
    if(suffixBeforeInitials.test(authorPart))
      issues.push(issue('warn', '后缀（Jr./Sr./II 等）应位于作者首字母之后，如 "Smith, J., Jr."。', '作者'));

    const commaCount = (authorPart.match(/,/g) || []).length;
    const hasEllipsis = /\.\.\./.test(authorPart) || /…/.test(authorPart);
    if(commaCount >= 19 && hasEllipsis){
      issues.push(issue('warn', 'APA 7 要求列出前 19 位作者，然后用省略号（...）接最后一位作者（针对 21+ 作者），且省略号后不需要 "&"。', '作者'));
    }
    if(/\.\.\.\s*&/.test(authorPart) || /…\s*&/.test(authorPart))
      issues.push(issue('warn', '省略号（...）后接最后一位作者时，不需要使用 "&"。', '作者'));

    const edRaw = authorPart.match(/(?:\(|,\s*)(Ed|Eds)([^)]*)\)/i);
    if(edRaw){
      const ed = edRaw[1];
      const rest = edRaw[2];
      if(rest && !/\./.test(rest.trim()) && /[A-Za-z]/.test(rest)){
        issues.push(issue('warn', '编者格式应为 "(' + ed + '.)" 或 "(' + ed + 's.)"，当前缺句点。', '编者'));
      }
      if(/,\s*(?:\(|Eds?\.)/i.test(authorPart) && /,\s*\(?\s*Eds?/i.test(authorPart))
        issues.push(issue('warn', '编者信息（Eds.）前不应有多余逗号。', '编者'));
    }
    if(/\bEds?\.?\b/i.test(authorPart) && !/\((?:Ed|Eds)\.?\)/.test(authorPart) && !/\(Eds?\.\)/.test(t)){
      issues.push(issue('warn', '编者信息应使用 "(Ed.)" 或 "(Eds.)" 格式（带括号）。', '编者'));
    }

    return issues;
  }

  // 提取期刊名（用于期刊条目中的卷期/页码定位与斜体判断）
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

  function checkJournalHeuristics(line, gi){
    const issues = [];
    const t = line.text;
    const rePages = /\)\.\s+(.+?)\.\s+(.+?),\s+(\d+)(\s*\(\s*\d+\s*\))?,\s+([^\.]+?)\./;
    const reELocator = /\)\.\s+(.+?)\.\s+(.+?),\s+(\d{1,4}),\s*(e\d+|\d{4,}|[A-Za-z]\d{4,})\./;
    const reAdvance = /\)\.\s+(.+?)\.\s+(.+?)\.\s+Advance online publication\./i;

    const m1 = t.match(rePages);
    const m2 = t.match(reELocator);
    const m3 = t.match(reAdvance);
    if(!m1 && !m2 && !m3){
      const tCore = t.replace(/\s*(https?:\/\/\S+|10\.\d{4,9}\/\S+|doi:\S+)\s*/gi, '');
      const reTitleJournal = /\)\.\s+(.+?)\.\s+(.+?)\.\s*(?:https?:\/\/|10\.|$)/;
      if(reTitleJournal.test(tCore)){
        issues.push(issue('warn', '未检测到卷号/期号/页码。请确认：①若为已正式出版的期刊文章，通常需补充卷(期)与页码（或文章编号 article number）；②若尚未分配卷期页码、以 DOI 在线优先发表，应在期刊名后注明 “Advance online publication.”', '卷期/页码'));
      }
      if(!/doi\.org\//i.test(t) && !/\b10\.\d{4,9}\//.test(t)){
        issues.push(issue('warn', '未检测到 DOI。若该期刊文章有 DOI，APA 7 应以 https://doi.org/... 格式列出。', 'DOI'));
      }
      return issues;
    }

    const journalTitle = m1 ? m1[2] : (m2 ? m2[2] : m3[2]);
    const volume = m1 ? m1[3] : (m2 ? m2[3] : '');
    const issuePart = m1 ? (m1[4] || '') : '';

    // 从本条期刊格式正则的匹配片段中定位期刊名。不能直接在整条文本上
    // indexOf：文章标题可能包含与期刊名相同的文字（例如
    // "Posthumanist Applied Linguistics. Applied Linguistics, ..."），此时会
    // 错把文章标题中的文字当成期刊名，进而同时误报斜体和逗号。
    const journalMatch = m1 || m2 || m3;
    const journalOffset = (journalMatch && journalTitle)
      ? journalMatch[0].lastIndexOf(journalTitle)
      : -1;
    const journalStart = (journalMatch && journalMatch.index != null && journalOffset >= 0)
      ? journalMatch.index + journalOffset
      : -1;
    const volStart = (journalStart >= 0 && volume) ? t.indexOf(volume, journalStart + journalTitle.length) : -1;

    if(gi){
      if(journalStart >= 0 && !overlapsItalic(line.italics, journalStart, journalStart + journalTitle.length)){
        issues.push(issue('bad', '期刊名在 APA 7 中应为斜体。', '斜体：期刊名'));
      }
      if(volStart >= 0 && volume && !overlapsItalic(line.italics, volStart, volStart + volume.length)){
        issues.push(issue('bad', '卷号（volume）在 APA 7 中应为斜体。', '斜体：卷号'));
      }
      if(issuePart){
        const issueDigits = issuePart.match(/\(\s*(\d+)\s*\)/);
        if(issueDigits){
          const token = `(${issueDigits[1]})`;
          const issueStart = t.indexOf(token, volStart + volume.length);
          if(issueStart >= 0 && overlapsItalic(line.italics, issueStart, issueStart + token.length)){
            issues.push(issue('warn', '期号（issue）通常不需要斜体（卷号斜体，期号不斜体）。', '斜体：期号'));
          }
        }
      }
    }

    if(journalStart >= 0 && journalTitle){
      const commaAfterJournal = t.slice(journalStart + journalTitle.length, journalStart + journalTitle.length + 2);
      if(!/Advance online publication/i.test(t)){
        if(!commaAfterJournal.trimStart().startsWith(',')){
          issues.push(issue('warn', '期刊名后通常有逗号：Journal Title, 12(3), ...', '标点'));
        }
      }
    }

    const tPages = stripUrlsForPages(t);
    const hasPageRange = /\b\d+\s*[–-]\s*\d+\b/.test(tPages);
    const hasELocator = /,\s*\d{1,4}\s*,\s*(?:e\d+|\d{4,}|[A-Za-z]\d{4,})\b/.test(tPages);
    const advance = /Advance online publication/i.test(t);
    if(!hasPageRange && !hasELocator && !advance){
      const tCore = t.replace(/\s*(https?:\/\/\S+|10\.\d{4,9}\/\S+|doi:\S+)\s*/gi, '');
      // 文章编号常明显长于传统页码（例如 2257121），不能限制为最多 5 位。
      const singleNum = /\),\s*\d{1,12}\s*\.\s*$/.test(tCore)
                     || /,\s*\d+\s*,\s*\d{1,12}\s*\./.test(tCore);
      if(singleNum){
        issues.push(issue('warn', '未检测到页码范围；卷期后仅有一个数字（可能是文章编号 article number）。请确认它是文章编号还是页码：若为页码范围请用连接号 “–”（en dash）；APA 7 中 article number 直接写该数字即可。', '页码/文章编号'));
      } else {
        issues.push(issue('warn', '未检测到页码范围；若是期刊文章通常需要页码（或文章编号/eLocator）。', '页码'));
      }
    }

    if(/\b10\.\d{4,9}\//.test(t) && !/doi\.org\//i.test(t)){
      issues.push(issue('warn', '检测到 DOI 但不是 doi.org URL；APA 7 推荐用 https://doi.org/...', 'DOI'));
    }

    return issues;
  }

  function checkBookHeuristics(line, gi){
    const issues = [];
    const t = line.text;
    const re = /\)\.\s+(.+?)\.\s+([^\.]+)\.?$/;
    const m = t.match(re);
    if(!m) return issues;
    const title = m[1];
    const titleStart = t.indexOf(title);
    if(gi && titleStart >= 0 && title.length >= 3){
      if(!overlapsItalic(line.italics, titleStart, titleStart + title.length)){
        issues.push(issue('bad', '图书/报告标题在 APA 7 中通常需要斜体。', '斜体：标题'));
      }
      // 书名末尾的句号（分隔引用元素的标点）不应斜体
      const afterDot = t.slice(titleStart + title.length);
      if(/^\s*\./.test(afterDot)){
        const dotIdx = titleStart + title.length + ((afterDot.match(/^\s*/) ? afterDot.match(/^\s*/)[0].length : 0));
        if(overlapsItalic(line.italics, dotIdx, dotIdx + 1)){
          issues.push(issue('warn', '书名末尾的句号（分隔引用元素的标点）不应斜体。', '斜体：句号'));
        }
      }
    }
    // APA 7 图书省略出版地。仅当检测到疑似 APA 6 的“出版地: 出版商”写法时才提示；
    // 标题中的副标题冒号（Title: Subtitle）是合法写法，不应触发本警告。
    const placeState = /\b[A-Z][a-z]+,\s*[A-Z]{2}:\s*/.test(t); // "City, ST: Publisher"（APA 6 美式）
    const placeTail  = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?:\s*[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*\.\s*(?:https?:\/\/\S+)?\s*$/.test(t); // "City: Publisher." 位于条目末尾
    if(placeState || placeTail){
      issues.push(issue('warn', 'APA 7 图书出版信息通常不写出版地（可能出现了类似 "City, ST:" 的写法）。', '出版信息'));
    }
    const words = title ? title.split(/\s+/).filter(Boolean) : [];
    const capWords = words.filter(w => /^[A-Z][a-z]+/.test(w)).length;
    if(words.length >= 6 && capWords / words.length > 0.65){
      issues.push(issue('warn', '标题可能使用了 Title Case；APA 7 通常使用 sentence case（句首与专有名词大写）。', '大小写'));
    }
    return issues;
  }

  function checkDissertationHeuristics(line, gi){
    const issues = [];
    const t = line.text;
    const m = t.match(/\)\.\s+(.+?)\s+\[([^\]]+)\]\.\s*(.*)$/);
    if(!m) return issues;

    const title = m[1].trim();
    const titleOnly = title.replace(/\s*\(Publication No\.\s*[^)]+\)\s*$/i, '').trim();
    const descriptor = m[2].trim();
    const source = m[3].trim();
    const titleStart = m.index + m[0].indexOf(m[1]);
    if(gi && titleStart >= 0 && !overlapsItalic(line.italics, titleStart, titleStart + titleOnly.length)){
      issues.push(issue('bad', '学位论文标题在 APA 7 参考文献中应使用斜体。', '斜体：学位论文标题'));
    }

    if(/\bph\.?d\.?\b|\bd\.?phil\.?\b/i.test(descriptor)){
      issues.push(issue('warn', '方括号内建议使用文献类型 “Doctoral dissertation”，不要使用学位缩写 “Ph.D.”；格式为 [Doctoral dissertation, 授予机构]。', '学位论文类型'));
    } else if(!/^(?:Unpublished\s+)?(?:Doctoral dissertation|Master['’]s thesis)\s*,\s*.+/i.test(descriptor)){
      issues.push(issue('warn', '学位论文说明应包含论文类型和授予机构，如 [Doctoral dissertation, University Name] 或 [Master’s thesis, University Name]。', '学位论文类型/机构'));
    }

    const isProQuest = /proquest\.com/i.test(t) || /\bProQuest\b/i.test(source);
    if(isProQuest){
      if(!/\(Publication No\.\s*[^)]+\)/i.test(title)){
        issues.push(issue('warn', 'ProQuest 学位论文若有出版编号，应在标题后加入 “(Publication No. …)”。', '出版编号'));
      }
      if(!/ProQuest Dissertations\s*(?:&|and)\s*Theses(?: Global)?/i.test(source)){
        issues.push(issue('warn', 'ProQuest 学位论文应注明数据库名称 “ProQuest Dissertations & Theses Global”。', '数据库名称'));
      }
    } else if(/^https?:\/\//i.test(source)){
      issues.push(issue('warn', '学位论文 URL 前通常应注明数据库、机构库或档案名称。', '来源名称'));
    } else if(!source && !/^Unpublished\b/i.test(descriptor)){
      issues.push(issue('warn', '已发表的学位论文应在方括号说明后注明数据库、机构库或档案名称。', '来源名称'));
    }
    return issues;
  }

  function checkBookChapterHeuristics(line, gi){
    const issues = [];
    const t = line.text;
    const inMatch = t.match(/\bIn\s+([^]+?)\s*\((Eds?\.)\),\s*([^]+?)\s*\(([^)]*)\)/i);
    if(!inMatch) return issues;
    const bookTitle = inMatch[3];
    const dateMatch = t.match(/\(([^()]*?(\d{4}[a-z]?)[^()]*?)\)/i);
    let chapterTitle = dateMatch ? t.slice(dateMatch.index + dateMatch[0].length, t.indexOf(' In ')).trim() : '';
    chapterTitle = chapterTitle.replace(/^\.\s+/, '').replace(/\.\s*$/, '').trim();
    if(chapterTitle === '.') chapterTitle = '';
    if(gi && chapterTitle.length >= 2){
      const chStart = t.indexOf(chapterTitle);
      if(chStart >= 0 && overlapsItalic(line.italics, chStart, chStart + chapterTitle.length))
        issues.push(issue('warn', '书籍章节的章节标题应为正体（不斜体），APA 7 仅书名斜体。', '斜体：章节标题'));
    }
    if(gi && bookTitle && bookTitle.trim().length >= 2){
      const bt = bookTitle.trim();
      const btStart = t.indexOf(bt);
      if(btStart >= 0 && !overlapsItalic(line.italics, btStart, btStart + bt.length))
        issues.push(issue('bad', '书籍章节所在书籍的书名「' + bt + '」应为斜体。', '斜体：书名'));
    }
    if(gi){
      const inIdx = t.indexOf('In');
      if(inIdx >= 0 && overlapsItalic(line.italics, inIdx, inIdx + 2))
        issues.push(issue('warn', '"In" 应为正体（不斜体）。', '斜体：In'));
      const edMatch = t.match(/\((?:Ed|Eds)\.\)/);
      if(edMatch && edMatch.index != null && overlapsItalic(line.italics, edMatch.index, edMatch.index + edMatch[0].length))
        issues.push(issue('warn', '编者标记 "(Ed./Eds.)" 应为正体（不斜体）。', '斜体：编者'));
    }
    if(gi){
      const metaMatch = t.match(/\(([^)]*?(?:\d+(?:st|nd|rd|th)\s+ed\.?|Vol\.\s*\d+)[^)]*?)\)/i);
      if(metaMatch && metaMatch.index != null && overlapsItalic(line.italics, metaMatch.index, metaMatch.index + metaMatch[0].length))
        issues.push(issue('warn', '版次（如 4th ed.）或卷号（如 Vol. 1）信息应为正体（不斜体），置于圆括号内。', '斜体：版次/卷号'));
    }
    const pageRangeInParen = t.match(/\(([^)]*?)(\d+)\s*[–-]\s*\d+([^)]*)\)/i);
    if(pageRangeInParen){
      const beforeRange = pageRangeInParen[2].toLowerCase();
      const prefixText = pageRangeInParen[1].toLowerCase();
      if(!/pp?\./.test(prefixText) && !/pp?\./.test(beforeRange)){
        issues.push(issue('warn', '书籍章节的页码应使用 "pp."（多页）或 "p."（单页）前缀，如 (pp. 11–25)。', '页码'));
      }
    }
    return issues;
  }

  function checkWebHeuristics(line, gi){
    const issues = [];
    const t = line.text;
    const re = /\)\.\s+(.+?)\.\s+([^\.]+)\.\s+(https?:\/\/\S+)$/;
    const m = t.match(re);
    if(!m) return issues;
    const title = m[1];
    const siteName = m[2];
    const titleStart = t.indexOf(title);
    if(gi && titleStart >= 0){
      if(!overlapsItalic(line.italics, titleStart, titleStart + title.length)){
        issues.push(issue('warn', '网页标题在 APA 7 中通常需要斜体（页面标题斜体，网站名不斜体）。', '斜体：网页标题'));
      }
    }
    const siteStart = t.indexOf(siteName, titleStart + title.length);
    if(gi && siteStart >= 0 && overlapsItalic(line.italics, siteStart, siteStart + siteName.length)){
      issues.push(issue('warn', '网站名通常不需要斜体。', '斜体：网站名'));
    }
    return issues;
  }

  function lintReference(line, gi){
    const issues = [];
    if(!line.text) return { type: '空行', issues };
    const type = classifyReference(line.text, line.italics);
    issues.push(...checkGeneral(line));
    issues.push(...checkReferenceAuthorFormat(line));
    if(type.indexOf('期刊文章') === 0){
      issues.push(...checkJournalHeuristics(line, gi));
    } else if(type.indexOf('学位论文') === 0){
      issues.push(...checkDissertationHeuristics(line, gi));
    } else if(type.indexOf('书籍章节') === 0){
      issues.push(...checkBookChapterHeuristics(line, gi));
    } else if(type.indexOf('图书/报告') === 0){
      issues.push(...checkBookHeuristics(line, gi));
    } else if(type.indexOf('网页/在线资源') === 0){
      issues.push(...checkWebHeuristics(line, gi));
    } else {
      if(/,\s*\d+\s*\(\s*\d+\s*\),/.test(line.text)) issues.push(...checkJournalHeuristics(line, gi));
      if(/https?:\/\//i.test(line.text) && /\)\./.test(line.text)) issues.push(...checkWebHeuristics(line, gi));
      if(/\bIn\s+.+\(Eds?\.\)/.test(line.text)) issues.push(...checkBookChapterHeuristics(line, gi));
    }
    return { type, issues };
  }

  function severityRank(sev){
    if(sev === 'bad') return 2;
    if(sev === 'warn') return 1;
    return 0;
  }
