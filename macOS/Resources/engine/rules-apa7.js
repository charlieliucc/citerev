/* ==================================================================
 * APA 7 风格包（引用风格规则）
 * ------------------------------------------------------------------
 * 这是一个「独立风格包」，把 APA 7 的引用/参考文献检查规则全部封装
 * 成一个对象 `window.CitationRules`，与主引擎（taskpane.js）解耦。
 *
 * 这样做的目的：
 *   - 方便用户自定义 / 导入 / 切换不同的引用风格（APA / Chicago / ...）
 *   - 方便维护者单独更新某一个风格的规则，不影响其它风格
 *   - 方便社区共创：任何人可复制本文件，改成自己的风格包
 *
 * 接口约定（详见 rules-API.md）：
 *   window.CitationRules = {
 *     id, name, version,
 *     config: {...},                      // 常用开关，普通用户可改
 *     headingRegex,                       // 参考文献标题识别
 *     nonRefMarkerRegex,                  // 非参考文献条目标记过滤
 *     refOrderCompare(a, b) {...},        // 参考列表字母/顺序比较
 *     classify(text) {...},               // 判定条目类型
 *     lintReference(line, ctx) {...},     // 单条参考条目格式检查
 *     detectInTextMismatches(rawCites, parsedRefs, ctx, refKeyToRef) {...},
 *     detectInTextStructural(rawCites, parsedRefs, ctx) {...},
 *     detectInTextStyleWarnings(rawCites, parsedRefs, ctx) {...},
 *   }
 *
 * 注意：本文件内的规则函数不依赖全局变量，所有共享工具通过 ctx 注入。
 * ================================================================== */

(function () {
  'use strict';

  // 算法与参数分离：内置 APA 参数及用户覆盖均由 rules-core.js 从 JSON 解析。
  if (!window.RuleProfiles) throw new Error('缺少规则配置加载器 rules-core.js');
  const activeProfile = window.RuleProfiles.getActive();
  const config = activeProfile.config || {};

  /* ------------------------------------------------------------
   * 作者 / 引用解析（依赖 ctx 提供的基础工具）
   * 这些逻辑在不同风格间差异较大，因此放在风格包内便于整体替换。
   * ------------------------------------------------------------ */

  // 参考列表标题识别：整行基本就是标题本身
  const REF_HEADING_RE = new RegExp(
    '^\\s*(?:\\d+[\\.\\)]\\s*)?(?:' + config.headingKeywords.join('|') + ')\\s*[\\.\\-:]?\\s*$', 'i'
  );

  // 过滤 References 标题之后明显不是参考文献条目的段落
  const NON_REF_MARKER_RE = new RegExp(
    '^(?:' + config.nonRefMarkers.map(escapeRegExp).join('|') + ')', 'i'
  );

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 去 URL / DOI 后用于页码判断（规则内部使用）
  function stripUrlsForPages(t) {
    return (t || '').replace(/https?:\/\/\S+/gi, ' ').replace(/\b10\.\d{4,9}\/\S+/g, ' ').replace(/\bdoi:\S+/gi, ' ');
  }

  // 单条参考条目的字母排序键（APA 忽略开头的 a/an/the）
  function refOrderKey(pr) {
    const N = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
    let first = (pr.surnames && pr.surnames[0]) ? pr.surnames[0].toLowerCase() : '\uffff';
    for (const art of config.ignoreLeadingArticles) {
      first = first.replace(new RegExp('^' + art + '\\s+'), '');
    }
    const authors = (pr.authors || [])
      .map(a => ((a.surname || '') + ' ' + (a.initial || '')).toLowerCase()).join(' ');
    return N(first).replace(/[^a-z]/g, '') + ' ' + N(authors).replace(/[^a-z]/g, '') + ' ' + (pr.year || '');
  }

  // 返回负值表示 a 应排在 b 之前（用于排序检测）
  function refOrderCompare(a, b) {
    return refOrderKey(a) < refOrderKey(b) ? -1 : (refOrderKey(a) > refOrderKey(b) ? 1 : 0);
  }

  /* ------------------------------------------------------------
   * 参考条目类型判定
   * ------------------------------------------------------------ */
  function classify(text) {
    const t = text;
    const tPages = stripUrlsForPages(t);
    const hasDoi = /doi\.org\//i.test(t) || /\b10\.\d{4,9}\//.test(t);
    const hasUrl = /https?:\/\//i.test(t);
    const hasPages = /\b\d+\s*[–-]\s*\d+\b/.test(tPages);
    const hasVolumeIssue = /\b\d+\s*\(\s*\d+\s*\)/.test(t);
    const hasAdvanceOnline = /\bAdvance online publication\b/i.test(t);
    const hasVolPages = /,\s*\d{1,4}\s*(?:\([^)]*\))?\s*,\s*[\d–]+\s*\d/.test(t);
    const hasVolumeCommaArticle = /,\s*\d{1,4}\s*,\s*(?:e\d+|\d{4,}|[A-Za-z]\d{4,})\b/.test(t);
    // 书籍章节：含 "In" 且 "In" 后跟编者 "(Ed./Eds.)" 或页码 "(pp./p. ...)"。
    const hasEditorsAfterIn = (() => {
      const inIdx = t.search(/\bIn\s+/i);
      if (inIdx < 0) return false;
      return /\(Eds?\.\)/.test(t.slice(inIdx));
    })();
    const hasPagesAfterIn = (() => {
      const inIdx = t.search(/\bIn\s+/i);
      if (inIdx < 0) return false;
      return /\(pp?\.\s*\d+\s*[–-]\s*\d+\)/i.test(t.slice(inIdx));
    })();
    const isChapter = hasEditorsAfterIn || hasPagesAfterIn;
    const isWebReport = /\bRetrieved from\b|\bAvailable at\b|\bAccessed\b/i.test(t);
    const hasEdition = /\(\s*\d+(?:st|nd|rd|th)\s+ed\.?\s*\)/i.test(t);
    const isBook = hasEdition ||
      (hasDoi && !isChapter && !hasVolPages && !hasVolumeCommaArticle) ||
      (!hasDoi && /\)\.\s+.+\.\s+[A-Z][A-Za-z\s&'’\-]+\.?\s*(?:https?:\/\/\S+)?\s*$/i.test(t));
    if (isWebReport && !hasDoi) return '网页/在线资源（推测）';
    if (isChapter) return '书籍章节（推测）';
    if (isBook) return '图书/报告（推测）';
    if (hasDoi) return '期刊文章（推测）';
    if (hasVolumeIssue && (hasPages || hasUrl)) return '期刊文章（推测）';
    if (hasVolPages || hasVolumeCommaArticle) return '期刊文章（推测）';
    if (hasUrl && /\)\.\s+.+\./.test(t)) return '网页/在线资源（推测）';
    return '未识别类型（按通用规则检查）';
  }

  /* ------------------------------------------------------------
   * 单条参考条目格式检查
   * ------------------------------------------------------------ */
  function checkGeneral(line, issues, ctx) {
    const { issue } = ctx;
    const t = line.text;
    if (!t) return;
    // Word 段落文本有时会在可见内容后附带段落/单元格控制符或零宽字符。
    // 这些字符不会显示在界面上，但会使 URL 的行尾锚点失配，进而把正确的
    // https://doi.org/... 同时误报为“缺少句号”和“裸 DOI”。
    const terminalText = t.replace(/[\s\u0000-\u001F\u007F\u200B-\u200D\u2060\uFEFF]+$/g, '');
    if (/\s{2,}/.test(line.rawText)) issues.push(issue('warn', '存在连续空格，建议压缩为空格。', '空格'));

    // ★ terminal-period：条目结尾缺句号（APA 7 多数条目以句号结尾；以 URL/DOI 结尾的不加句号）
    // 参考 CitationEasy：d=/(https?:\/\/\S+|\b10\.\d{4,}\/\S+)$/ 或 c=/[.?!]$/
    const endsWithUrlOrDoi = /(https?:\/\/\S+|\b10\.\d{4,}\/\S+)$/.test(terminalText);
    if (!endsWithUrlOrDoi && !/[.?!]$/.test(terminalText) && /\S/.test(terminalText)) {
      issues.push(issue('warn', '该参考条目结尾缺少句号。APA 7 中大多数条目以句号结尾（以 URL 或 DOI 结尾的除外）。', '标点'));
    }

    checkReferenceDate(t, issues, ctx);
    const yearMatch = t.match(/\((n\.d\.|\d{4}(?:[a-z])?(?:,\s*[A-Za-z]+(?:\s+\d{1,2})?)?)\)/i);
    if (!yearMatch) {
      issues.push(issue('bad', '未找到年份括号格式：应类似 (2020). 或 (n.d.).', '年份'));
    } else {
      const yearIdx = yearMatch.index != null ? yearMatch.index : -1;
      const after = t.slice(yearIdx + yearMatch[0].length);
      if (!/^\./.test(after.trimStart())) {
        issues.push(issue('bad', '年份括号后通常需要句号：...(2020). Title...', '标点'));
      }
    }
    if (/\bdoi\s*:/i.test(t)) issues.push(issue('warn', '检测到 doi: 前缀；APA 7 推荐改为 DOI URL（https://doi.org/...）。', 'DOI'));
    // ★ doi-url-format 增强：检测 dx.doi.org 前缀和 http://（非 https）的 DOI URL
    // 参考 CitationEasy：n=/(doi:\s*10\.|dx\.doi\.org|http:\/\/(?:dx\.)?doi\.org)/i
    if (/dx\.doi\.org/i.test(t)) {
      const dxDoi = t.match(/https?:\/\/(?:dx\.)?doi\.org\/(\S+)/i);
      issues.push(issue('warn', `检测到 dx.doi.org 前缀的 DOI；APA 7 推荐写成 https://doi.org/${dxDoi ? dxDoi[1] : '...'}。`, 'DOI'));
    } else if (/http:\/\/doi\.org/i.test(t)) {
      const httpDoi = t.match(/http:\/\/doi\.org\/(\S+)/i);
      issues.push(issue('warn', `检测到 http:// 非加密的 DOI URL；APA 7 推荐使用 https://doi.org/${httpDoi ? httpDoi[1] : '...'}。`, 'DOI'));
    }
    const urlMatch = terminalText.match(/(https?:\/\/\S+)$/i);
    if (urlMatch) {
      const url = urlMatch[1];
      if (/[\)\]\>\,\;\:]+$/.test(url)) issues.push(issue('warn', 'URL 末尾疑似粘连了多余符号（括号/逗号等）。', 'URL'));
      if (/[\.]$/.test(url)) issues.push(issue('warn', 'URL/DOI 行末一般不加句号。', 'URL/DOI'));
    } else {
      const bareDoi = terminalText.match(/\b10\.\d{4,9}\/[^\s]+/);
      if (bareDoi) issues.push(issue('warn', '检测到疑似裸 DOI；APA 7 推荐写成 https://doi.org/ + DOI。', 'DOI'));
    }
    const tPages = stripUrlsForPages(t);
    const hyphenPages = tPages.match(/\b\d+\s*-\s*\d+\b/);
    const enDashPages = tPages.match(/\b\d+\s*–\s*\d+\b/);
    if (hyphenPages && !enDashPages) issues.push(issue('warn', '页码范围建议使用连接号 “–”（en dash），而不是连字符 "-"。', '页码'));
    if (/\b(et al\.)\b/i.test(t) && /\bet\s+al\b(?!\.)/i.test(t)) issues.push(issue('warn', 'et al. 需要句点：et al.', '作者'));
    if (/\w,&\w/.test(t)) issues.push(issue('warn', '",&" 前后建议加空格：", &"。', '作者'));
    if (/,\s*[A-Z](?!\.)(?![A-Za-zÀ-ÿ])/.test(t)) issues.push(issue('warn', '作者名字首字母通常带句点："Wang, H."', '作者首字母'));

    // ★ title-case-smell（通用）：对年份括号之后、句号之前的标题做 Title Case 嗅探
    // 参考 CitationEasy：h=/^\.?\s*([^.]+?)\.(?:\s|$)/ 提取标题，≥3 个词首字母大写（词长≥4）判为疑似 Title Case
    checkTitleCaseSmell(t, issues, ctx);
  }

  // 通用 Title Case 嗅探（APA 7 标题用 sentence case）
  function checkTitleCaseSmell(t, issues, ctx) {
    const { issue } = ctx;
    if (!t || /\bIn\s+.+\(Eds?\.\)/.test(t)) return; // 跳过书籍章节（其章节标题规则不同）
    const yearMatch = t.match(/\(([^()]*?\d{4}[a-z]?[^()]*?)\)/i);
    if (!yearMatch) return;
    // 取年份括号之后的标题区
    let titleZone = t.slice(yearMatch.index + yearMatch[0].length);
    titleZone = titleZone.replace(/^\.\s*/, '').replace(/\s*https?:\/\/\S+$/, '').replace(/\s*10\.\d{4,9}\/\S+$/, '').trim();
    // 期刊文章：剔除期刊名（含其后的卷期页码），避免期刊名中的专有名词干扰标题判断
    if (ctx.extractJournalName) {
      const jn = ctx.extractJournalName(t);
      if (jn) {
        const jnIdx = titleZone.indexOf(jn);
        if (jnIdx > 0) titleZone = titleZone.slice(0, jnIdx).trim();
      }
    }
    // 取第一个句号前的完整句子（跳过可能存在的出版地/出版者等）
    const firstSentence = titleZone.split(/\.\s+(?=[A-Z0-9])/)[0] || titleZone;
    const words = firstSentence.split(/\s+/).filter(Boolean);
    // 统计非句首（非标题首词、非冒号/分号/破折号后首词）的首字母大写词数。
    // 句首与冒号后的首词在 sentence case 中本就大写，不计入 Title Case 信号；
    // 专有名词（如 "Chinese"）无法自动排除，故仅当显著多词大写时才判定。
    const meaningful = [];
    for (let i = 0; i < words.length; i++) {
      const clean = words[i].replace(/[^A-Za-z\u00C0-\u017F]/g, '');
      if (clean.length >= 4) {
        const prev = i > 0 ? words[i - 1] : '';
        const atSentenceStart = i === 0 || /[:;–—]\s*$/.test(prev);
        meaningful.push({ word: clean, atSentenceStart });
      }
    }
    if (meaningful.length < 3) return;
    const nonInitialWords = meaningful.filter(w => !w.atSentenceStart);
    const capCount = nonInitialWords.filter(w => /^[A-Z\u00C0-\u017F]/.test(w.word)).length;
    const capitalizedRatio = nonInitialWords.length ? capCount / nonInitialWords.length : 0;
    // 仅“至少 3 个大写词”会误伤包含多个国家、国籍、语言等专有名词的长标题，
    // 如 British / Iranian / English 或 Germany / Russia / United States。
    // Title Case 的可靠特征是大写词同时占据标题中多数有意义词。
    if (capCount >= 3 && capitalizedRatio >= 0.6) {
      issues.push(issue('warn', '标题疑似使用了 Title Case。APA 7 中文章、章节、书名标题通常使用 sentence case（仅首词、冒号后首词与专有名词大写），如 "The effects of climate change on coral reefs"。', '大小写'));
    }
  }

  function checkReferenceDate(t, issues, ctx) {
    const { issue } = ctx;
    if (!t) return;
    const dateMatch = t.match(/\(([^()]*?(\d{4}[a-z]?)[^()]*?)\)/i);
    const hasYearParen = /\(\s*(?:\d{4}[a-z]?|n\.d\.)/i.test(t);
    if (/\(n\.?d\.?\s*\)/i.test(t) && !/\(n\.d\./i.test(t))
      issues.push(issue('bad', '无日期应写为 "n.d."（两个点都要），当前写法缺少句点。', '日期'));
    if (!hasYearParen && /[A-Za-z\u00C0-\u017F]/.test(t) && /\S/.test(t)) {
      issues.push(issue('bad', '未找到日期括号。APA 7 要求作者后紧跟日期并置于括号中，如 (2020).', '日期'));
    }
    const openParenNoYear = /\([^)]*\)/.test(t) && !/\([^()]*\d{4}[a-z]?[^()]*\)/.test(t) && /\(\s*[^)\d]/.test(t);
    if (openParenNoYear && /\([^()]*\)/.test(t) && !hasYearParen) {
      issues.push(issue('bad', '检测到括号，但括号内没有年份。请确认日期是否写在括号内，如 (2020).', '日期'));
    }
    const yearComma = t.match(/\((\d{4}[a-z]?)\s*,\s*([^)]*)\)/);
    if (yearComma) {
      const afterComma = yearComma[2].trim();
      if (afterComma && !/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Spring|Summer|Fall|Winter|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(afterComma)) {
        issues.push(issue('warn', `年份后跟随逗号，但未识别到月份或季节（用于杂志/新闻等）。当前内容："${afterComma}"。`, '日期'));
      } else if (/[A-Za-z]+/i.test(afterComma) && !/\d{1,2}(?:\s*[–-]\s*\d{1,2})?/.test(afterComma)) {
        issues.push(issue('warn', '已识别到月份/季节，但缺少具体日期或日期范围，如 (2014, January 12–14)。', '日期'));
      }
    }
    if (/\(n\.d\.\s*[^\-)]/.test(t) || /\(n\.d\.\s*\w(?![-a-z])/i.test(t)) {
      const nd = t.match(/\(n\.d\.\s*([a-z])\s*\)/i);
      if (nd) issues.push(issue('warn', `无日期消歧应使用连字符：应为 (n.d.-${nd[1]}.)，当前缺少连字符。`, '日期'));
    }
    if (/\bet\s+al\.?\b/i.test(t)) {
      issues.push(issue('bad', 'APA 不允许在参考文献列表中写 "et al."，应列出所有作者。', '作者'));
    }
  }

  function checkReferenceAuthorFormat(line, issues, ctx) {
    const { issue } = ctx;
    const t = line.text;
    if (!t) return;
    const dateMatch = t.match(/\([^()]*?(\d{4}[a-z]?)[^()]*?\)/i);
    let authorPart = dateMatch ? t.slice(0, dateMatch.index) : t;
    authorPart = authorPart.trim();
    if (!authorPart) return;

    const authorLetters = (authorPart.match(/[A-Za-z\u00C0-\u017F]/g) || []).length;
    if (authorLetters < 2 && /[A-Za-z]/.test(t)) {
      issues.push(issue('bad', '未检测到作者。请检查该条目是否符合 APA 参考格式（含作者与日期）。', '作者'));
    }

    // ★ author-name-order：作者名以 "First Last" 顺序开头（APA 7 要求倒置为 "Surname, Initials"）
    // 参考 CitationEasy：m=/^[A-Z][a-z]+(?:\s+[A-Z]\.?)*\s+[A-Z][a-z]+\b/（作者部分无逗号时）
    // 仅当作者区形如「Given Surname」两词（或含单字母首字母）的个人姓名时才判定；
    // 三个及以上全大写专有词（如组织作者 "American Psychological Association"）不判定。
    const authorWords = authorPart.trim().split(/\s+/).filter(Boolean);
    const properWordCount = authorWords.filter(w => /^[A-Z][a-z]+/.test(w)).length;
    const hasInitialTokens = authorWords.some(w => /^[A-Z]\.?$/.test(w));
    const firstNameOrder = /^[A-Z][a-z]+(?:\s+[A-Z]\.?)*\s+[A-Z][a-z]+\b/.test(authorPart);
    const noCommaInAuthorPart = !/,/.test(authorPart) && !/&/.test(authorPart);
    if (firstNameOrder && noCommaInAuthorPart && (properWordCount === 2 || hasInitialTokens)) {
      const fL = authorPart.match(/^([A-Z][a-z]+)\s+([A-Z][a-z]+)$/);
      const suggestion = fL ? `${fL[2]}, ${fL[1].charAt(0)}.` : undefined;
      issues.push(issue('bad',
        '作者名疑似为 "First Last" 顺序。APA 7 要求作者姓倒置为 "Surname, Initials" 格式（如 "Smith, J."）。' +
        (suggestion ? `建议改为 "${suggestion}"。` : ''),
        '作者'));
    }

    const orgDot = authorPart.match(/^([A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]*\.)\s*([,;:])/);
    if (orgDot) issues.push(issue('warn', `组织作者 "${orgDot[1]}" 后不应跟 "${orgDot[2]}"，应直接以句点结束作者区。`, '作者'));

    const andJoin = authorPart.match(/([A-Za-z\u00C0-\u017F][\u00C0-\u017F'’\-]*\s+(?:[A-Z]\.?\s*)*)(\band\b)(\s+[A-Za-z\u00C0-\u017F][\u00C0-\u017F'’\-]*,?\s*[A-Z]\.)/i);
    if (andJoin) issues.push(issue('warn', '参考文献末两位作者之间应使用 "&" 而非 "and"，如 "Wang, H., & Chen, L."。', '作者'));
    // ★ and-vs-ampersand 增强：作者部分中出现 ", and X" 或 "and X"（X 为大写）即提示
    // 参考 CitationEasy：u=/,?\s+and\s+(?=[A-Z])/
    const andLoose = authorPart.match(/,?\s+and\s+(?=[A-Z])/);
    if (!andJoin && andLoose) {
      issues.push(issue('warn', '参考文献末两位作者之间应使用 "&" 而非 "and"，如 "Wang, H., & Chen, L."。', '作者'));
    }
    if (/&[A-Za-z]/i.test(authorPart) && !/&\s/.test(authorPart))
      issues.push(issue('warn', '"&" 后应有空格。', '作者'));
    const ampCount = (authorPart.match(/&/g) || []).length;
    if (ampCount > 1) issues.push(issue('bad', '"&" 仅应用于连接最后两位作者，不能用于其它作者之间。', '作者'));

    const isIndividualAuthor = /,\s*[A-Z]\./.test(authorPart);
    if (isIndividualAuthor) {
      const authorTokenRe = /([A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+)\s*,\s*([A-Z](?:\.[A-Z])*\.?)/g;
      let am;
      while ((am = authorTokenRe.exec(authorPart))) {
        const initials = am[2];
        if (/^[A-Z]$/.test(initials)) {
          issues.push(issue('warn', `作者首字母 "${initials}" 后应有句点，如 "${initials}."。`, '作者'));
        }
        if (/,\s*[A-Z]\./.test(initials)) {
          issues.push(issue('warn', '首字母之间不应有逗号，如 "M. A."（用点号和空格分隔）。', '作者'));
        }
        if (/^[A-Z]\.[A-Z]\.$/.test(initials) && !/^[A-Z]\.\s+[A-Z]\.$/.test(initials)) {
          issues.push(issue('warn', '作者首字母之间应有空格，如 "M. A." 而非 "M.A."。', '作者'));
        }
      }
      const noCommaPerson = authorPart.match(/\b([A-Z][a-z\u00C0-\u017F'’\-]+)\s+([A-Z])\.\b/g);
      if (noCommaPerson) {
        for (const nc of noCommaPerson) {
          const sp = nc.match(/\b([A-Z][a-z\u00C0-\u017F'’\-]+)\s+([A-Z])\./);
          if (sp && !new RegExp(sp[1] + '\\s*,', 'i').test(authorPart)) {
            issues.push(issue('warn', `作者姓氏 "${sp[1]}" 后应有逗号，如 "${sp[1]}, ${sp[2]}."。`, '作者'));
          }
        }
      }
    }

    const endComma = authorPart.match(/,(\s*)\(/);
    if (endComma) issues.push(issue('warn', '作者末尾、日期括号前不应有多余逗号。', '作者'));

    const suffixBeforeInitials = /([A-Za-z\u00C0-\u017F][\u00C0-\u017F'’\-]+)\s*(?:Jr\.?|Sr\.?|I{1,3}|IV|V)\s*,\s*([A-Z]\.)/i;
    if (suffixBeforeInitials.test(authorPart))
      issues.push(issue('warn', '后缀（Jr./Sr./II 等）应位于作者首字母之后，如 "Smith, J., Jr."。', '作者'));

    const commaCount = (authorPart.match(/,/g) || []).length;
    const hasEllipsis = /\.\.\./.test(authorPart) || /…/.test(authorPart);
    if (commaCount >= 19 && hasEllipsis) {
      issues.push(issue('warn', 'APA 7 要求列出前 19 位作者，然后用省略号（...）接最后一位作者（针对 21+ 作者），且省略号后不需要 "&"。', '作者'));
    }
    if (/\.\.\.\s*&/.test(authorPart) || /…\s*&/.test(authorPart))
      issues.push(issue('warn', '省略号（...）后接最后一位作者时，不需要使用 "&"。', '作者'));

    const edRaw = authorPart.match(/(?:\(|,\s*)(Ed|Eds)([^)]*)\)/i);
    if (edRaw) {
      const ed = edRaw[1];
      const rest = edRaw[2];
      if (rest && !/\./.test(rest.trim()) && /[A-Za-z]/.test(rest)) {
        issues.push(issue('warn', `编者格式应为 "(${ed}.)" 或 "(${ed}s.)"，当前缺句点。`, '编者'));
      }
      if (/,\s*(?:\(|Eds?\.)/i.test(authorPart) && /,\s*\(?\s*Eds?/i.test(authorPart))
        issues.push(issue('warn', '编者信息（Eds.）前不应有多余逗号。', '编者'));
    }
    if (/\bEds?\.?\b/i.test(authorPart) && !/\((?:Ed|Eds)\.?\)/.test(authorPart) && !/\(Eds?\.\)/.test(t)) {
      issues.push(issue('warn', '编者信息应使用 "(Ed.)" 或 "(Eds.)" 格式（带括号）。', '编者'));
    }
  }

  function checkJournalHeuristics(line, gi, issues, ctx) {
    const { issue, overlapsItalic, extractJournalName } = ctx;
    const t = line.text;
    const volParen = t.match(/,\s*(\d{1,4})\s*\(\s*\d+\s*\)\s*,/);
    const volNoParen = t.match(/,\s*(\d{1,4})\s*,\s*(?:e\d+|\d{4,}|[A-Za-z]\d{4,}|\d+\s*[–-]\s*\d)/);
    const advance = /Advance online publication/i.test(t);
    if (!volParen && !volNoParen && !advance) {
      const tCore = t.replace(/\s*(https?:\/\/\S+|10\.\d{4,9}\/\S+|doi:\S+)\s*/gi, '');
      if (/\)\.\s+/.test(tCore)) issues.push(issue('warn', '未检测到卷号/期号/页码。请确认是否为正式期刊文章，必要时补充卷(期)与页码，或注明 "Advance online publication."', '卷期/页码'));
      return;
    }
    const volume = volParen ? volParen[1] : (volNoParen ? volNoParen[1] : '');
    const journalTitle = extractJournalName(t);
    const journalStart = journalTitle ? t.indexOf(journalTitle) : -1;
    const volStart = (journalStart >= 0 && volume) ? t.indexOf(volume, journalStart + journalTitle.length) : -1;
    if (gi) {
      if (journalStart >= 0 && !overlapsItalic(line.italics, journalStart, journalStart + journalTitle.length))
        issues.push(issue('bad', '期刊名在 APA 7 中应为斜体。', '斜体：期刊名'));
      if (volStart >= 0 && volume && !overlapsItalic(line.italics, volStart, volStart + volume.length))
        issues.push(issue('bad', '卷号（volume）在 APA 7 中应为斜体。', '斜体：卷号'));
    }
    const tPages = stripUrlsForPages(t);
    const hasPageRange = /\b\d+\s*[–-]\s*\d+\b/.test(tPages);
    const hasELocator = /,\s*\d{1,4}\s*,\s*(?:e\d+|\d{4,}|[A-Za-z]\d{4,})\b/.test(tPages);
    if (!hasPageRange && !hasELocator && !advance)
      issues.push(issue('warn', '未检测到页码范围；若是期刊文章通常需要页码（或文章编号/eLocator）。', '页码'));
    if (/\b10\.\d{4,9}\//.test(t) && !/doi\.org\//i.test(t))
      issues.push(issue('warn', '检测到 DOI 但不是 doi.org URL；APA 7 推荐用 https://doi.org/...', 'DOI'));
  }

  function extractBookTitle(t) {
    const dateMatch = t.match(/\(([^()]*?(\d{4}[a-z]?)[^()]*?)\)/i);
    if (!dateMatch) return null;
    const beforeDate = t.slice(0, dateMatch.index);
    const hasAuthor = /,\s*[A-Z]\./.test(beforeDate) || /\b[A-Z][a-z]+\s+et al\./.test(beforeDate);
    if (!hasAuthor) {
      const noAuthorTitle = beforeDate.replace(/\s*\.\s*$/, '').trim();
      return noAuthorTitle.length >= 2 ? noAuthorTitle : null;
    }
    let afterDate = t.slice(dateMatch.index + dateMatch[0].length).trim().replace(/^\.\s+/, '');
    let title = afterDate;
    const edMatch = title.match(/^\s*(.+?)\s*\(\s*\d+(?:st|nd|rd|th)\s+ed\.?\s*\)\s*\./i);
    if (edMatch) title = edMatch[1];
    else {
      const endMatch = title.match(/^\s*(.+?)\s*\.\s+[A-Z][A-Za-z\s&'’-]+\.?\s*$/);
      if (endMatch) title = endMatch[1];
    }
    title = title.replace(/\s*\.\s*[A-Z].*$/, '').trim();
    return title.length >= 2 ? title : null;
  }

  function locateBookTitle(t, title) {
    if (!title) return { start: -1, end: -1 };
    const idx = t.indexOf(title);
    if (idx < 0) return { start: -1, end: -1 };
    return { start: idx, end: idx + title.length };
  }

  function checkBookHeuristics(line, gi, issues, ctx) {
    const { issue, overlapsItalic, escapeHtml } = ctx;
    const t = line.text;
    if (/\bIn\s+.+\(Eds?\.\)/.test(t)) return;
    const title = extractBookTitle(t);
    if (gi && title) {
      const { start, end } = locateBookTitle(t, title);
      if (start >= 0 && end > start && title.length >= 3) {
        if (!overlapsItalic(line.italics, start, end))
          issues.push(issue('bad', `书名「${escapeHtml(title)}」在 APA 7 中应为斜体（书名末尾句号不斜体）。`, '斜体：书名'));
        const afterDot = t.slice(end);
        if (/^\s*\./.test(afterDot)) {
          const dotIdx = end + (afterDot.match(/^\s*/) ? afterDot.match(/^\s*/)[0].length : 0);
          if (overlapsItalic(line.italics, dotIdx, dotIdx + 1))
            issues.push(issue('warn', '书名末尾的句号（分隔引用元素的标点）不应斜体。', '斜体：句号'));
        }
      }
    }
    const placeState = /\b[A-Z][a-z]+,\s*[A-Z]{2}:\s*/.test(t);
    const placeTail = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?:\s*[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*\.\s*(?:https?:\/\/\S+)?\s*$/.test(t);
    if (placeState || placeTail) issues.push(issue('warn', 'APA 7 图书出版信息通常不写出版地（可能出现了类似 "City, ST:" 的写法）。', '出版信息'));
    if (title) {
      const words = title.split(/\s+/).filter(Boolean);
      const capWords = words.filter(w => /^[A-Z][a-z]+/.test(w)).length;
      if (words.length >= 6 && capWords / words.length > 0.65)
        issues.push(issue('warn', '书名可能使用了 Title Case；APA 7 通常使用 sentence case（句首与专有名词大写）。', '大小写'));
    }
  }

  function checkBookChapterHeuristics(line, gi, issues, ctx) {
    const { issue, overlapsItalic, escapeHtml } = ctx;
    const t = line.text;
    const inMatch = t.match(/\bIn\s+([^]+?)\s*\((Eds?\.)\),\s*([^]+?)\s*\(([^)]*)\)/i);
    if (!inMatch) return;
    const bookTitle = inMatch[3];
    const dateMatch = t.match(/\(([^()]*?(\d{4}[a-z]?)[^()]*?)\)/i);
    let chapterTitle = dateMatch ? t.slice(dateMatch.index + dateMatch[0].length, t.indexOf(' In ')).trim() : '';
    chapterTitle = chapterTitle.replace(/^\.\s+/, '').replace(/\.\s*$/, '').trim();
    if (chapterTitle === '.') chapterTitle = '';
    if (gi && chapterTitle.length >= 2) {
      const chStart = t.indexOf(chapterTitle);
      if (chStart >= 0 && overlapsItalic(line.italics, chStart, chStart + chapterTitle.length))
        issues.push(issue('warn', '书籍章节的章节标题应为正体（不斜体），APA 7 仅书名斜体。', '斜体：章节标题'));
    }
    if (gi && bookTitle && bookTitle.trim().length >= 2) {
      const bt = bookTitle.trim();
      const btStart = t.indexOf(bt);
      if (btStart >= 0 && !overlapsItalic(line.italics, btStart, btStart + bt.length))
        issues.push(issue('bad', `书籍章节所在书籍的书名「${escapeHtml(bt)}」应为斜体。`, '斜体：书名'));
    }
    if (gi) {
      const inIdx = t.indexOf('In');
      if (inIdx >= 0 && overlapsItalic(line.italics, inIdx, inIdx + 2))
        issues.push(issue('warn', '"In" 应为正体（不斜体）。', '斜体：In'));
      const edMatch = t.match(/\((?:Ed|Eds)\.\)/);
      if (edMatch && edMatch.index != null && overlapsItalic(line.italics, edMatch.index, edMatch.index + edMatch[0].length))
        issues.push(issue('warn', '编者标记 "(Ed./Eds.)" 应为正体（不斜体）。', '斜体：编者'));
    }
    if (gi) {
      const metaMatch = t.match(/\(([^)]*?(?:\d+(?:st|nd|rd|th)\s+ed\.?|Vol\.\s*\d+)[^)]*?)\)/i);
      if (metaMatch && metaMatch.index != null && overlapsItalic(line.italics, metaMatch.index, metaMatch.index + metaMatch[0].length))
        issues.push(issue('warn', '版次（如 4th ed.）或卷号（如 Vol. 1）信息应为正体（不斜体），置于圆括号内。', '斜体：版次/卷号'));
    }
    const pageRangeInParen = t.match(/\(([^)]*?)(\d+)\s*[–-]\s*\d+([^)]*)\)/i);
    if (pageRangeInParen) {
      const beforeRange = pageRangeInParen[2].toLowerCase();
      const prefixText = pageRangeInParen[1].toLowerCase();
      if (!/pp?\./.test(prefixText) && !/pp?\./.test(beforeRange)) {
        issues.push(issue('warn', '书籍章节的页码应使用 "pp."（多页）或 "p."（单页）前缀，如 (pp. 11–25)。', '页码'));
      }
    }
  }

  function checkWebHeuristics(line, gi, issues, ctx) {
    const { issue, overlapsItalic } = ctx;
    const t = line.text;
    const re = /\)\.\s+(.+?)\.\s+([^\.]+)\.\s+(https?:\/\/\S+)$/;
    const m = t.match(re);
    if (!m) return;
    const title = m[1], siteName = m[2];
    const titleStart = t.indexOf(title);
    if (gi && titleStart >= 0 && !overlapsItalic(line.italics, titleStart, titleStart + title.length))
      issues.push(issue('warn', '网页标题在 APA 7 中通常需要斜体（页面标题斜体，网站名不斜体）。', '斜体：网页标题'));
    const siteStart = t.indexOf(siteName, titleStart + title.length);
    if (gi && siteStart >= 0 && overlapsItalic(line.italics, siteStart, siteStart + siteName.length))
      issues.push(issue('warn', '网站名通常不需要斜体。', '斜体：网站名'));
  }

  // 分发参考条目到各类型检查
  function lintReference(line, ctx) {
    const issues = [];
    if (!line.text) return { type: '空行', issues };
    const type = classify(line.text);
    const gi = ctx.globalItalic;
    checkGeneral(line, issues, ctx);
    checkReferenceAuthorFormat(line, issues, ctx);
    if (type.indexOf('期刊文章') === 0) { checkJournalHeuristics(line, gi, issues, ctx); }
    else if (type.indexOf('书籍章节') === 0) { checkBookChapterHeuristics(line, gi, issues, ctx); }
    else if (type.indexOf('图书/报告') === 0) { checkBookHeuristics(line, gi, issues, ctx); }
    else if (type.indexOf('网页/在线资源') === 0) { checkWebHeuristics(line, gi, issues, ctx); }
    else {
      if (/,\s*\d+\s*\(\s*\d+\s*\),/.test(line.text)) checkJournalHeuristics(line, gi, issues, ctx);
      if (/https?:\/\//i.test(line.text) && /\)\./.test(line.text)) checkWebHeuristics(line, gi, issues, ctx);
      if (/\bIn\s+.+\(Eds?\.\)/.test(line.text)) checkBookChapterHeuristics(line, gi, issues, ctx);
    }
    return { type, issues };
  }

  /* ------------------------------------------------------------
   * In-Text 精细检测辅助（仅供本风格包内部使用）
   * ------------------------------------------------------------ */
  function isNarrativeCitation(c) {
    return !/^\(.*\)$/.test((c.raw || "").trim());
  }
  function splitSubCitesInChunk(chunkText) {
    let s = String(chunkText || '').replace(/\s+/g, ' ').trim().replace(/^\(+/, "").replace(/\)+$/, "");
    return s.split(/\s*;\s*/).map(x => x.trim()).filter(Boolean);
  }
  function yearsInChunk(chunkText) {
    const years = (chunkText || "").match(/\d{4}[a-z]?/gi) || [];
    return years.map(y => String(y).toLowerCase());
  }
  function hasAmpersand(chunkText) { return /&/.test(chunkText || ""); }
  function hasPageNotation(chunkText) {
    const t = chunkText || "";
    return /\bp(?:p)?\.\s*\d+(?:\s*[–-]\s*\d+)?/i.test(t);
  }
  function isSecondarySource(chunkText) { return /\bas\s+cited\s+in\b/i.test(chunkText || ""); }
  function hasIbid(chunkText) { return /\bibid\.?/i.test(chunkText || ""); }
  function hasPersonalComm(chunkText) {
    return /\b(?:personal\s+communication|personal\s+correspondence|pers\.\s*comm\.?|personal\s+interview|personal\s+email|personal\s+conversation)\b/i.test(chunkText || "");
  }
  function hasPageButNoYear(chunkText) {
    const t = chunkText || "";
    const hasPage = /\b(?:p|pp)\.\s*\d+|\b\d+\s*[–-]\s*\d+\b/.test(t);
    const hasYear = /\d{4}[a-z]?/.test(t);
    return hasPage && !hasYear;
  }
  function findRefsByAuthorKey(parsedRefs, surname, initial, ctx) {
    const out = [];
    for (const pr of parsedRefs) {
      for (const a of pr.authors) {
        const s = ctx.normalizeSpace(a.surname).toLowerCase();
        if (s === (surname || "").toLowerCase()) {
          if (!initial || !a.initial || a.initial.toLowerCase() === initial.toLowerCase()) { out.push(pr); break; }
        }
      }
    }
    return out;
  }
  function findRefsByYear(parsedRefs, year, ctx) {
    const y = ctx.normalizeYear(year);
    return parsedRefs.filter(pr => pr.year === y);
  }
  function authorsToDisplay(c, ctx) {
    const authors = c.authors || [];
    if (authors.length === 0) return c.authorsRaw || '';
    const parts = authors.map(a => {
      let s = a.surname || '';
      if (a.initial) s = s + ', ' + a.initial.toUpperCase() + '.';
      return s;
    });
    if (authors.length === 1) return parts[0];
    if (authors.length === 2) return parts[0] + ' & ' + parts[1];
    return parts[0] + ' et al.';
  }

  /* ------------------------------------------------------------
   * In-Text Mismatch 检测（红色）
   * ------------------------------------------------------------ */
  function detectInTextMismatches(rawCites, parsedRefs, ctx, refKeyToRef) {
    const { escapeHtml, buildKeys, refLabel, makeSearchText, normalizeSpace } = ctx;
    const comments = [];
    let idx = 0;
    for (const c of rawCites) {
      const authors = c.authors || [];
      const year = c.year;
      const keys = buildKeys(authors, c.etal, year);
      const exactMatch = keys.some(k => refKeyToRef.has(k));
      if (exactMatch) continue;

      const displayAuthor = authorsToDisplay(c, ctx);
      const surname = authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : "";
      const initial = authors.length ? (authors[0].initial || "").toLowerCase() : "";
      const yearRefs = findRefsByYear(parsedRefs, year, ctx);
      const authorRefs = surname ? findRefsByAuthorKey(parsedRefs, surname, initial, ctx) : [];

      if (yearRefs.length === 0 && authorRefs.length === 0) {
        comments.push({
          id: 'im' + (idx++), color: 'mismatch', tag: '引用缺失',
          quote: c.raw, count: 1,
          desc: `正文中出现引用（${escapeHtml(displayAuthor)}, ${escapeHtml(year)}），但在参考文献列表中既找不到该作者，也找不到该年份。可能是漏列参考文献，或文中年份不需要引用。`,
          inText: c.raw, searchText: makeSearchText((c.authorsRaw || '') + ', ' + year, 120), inRef: false
        });
        continue;
      }
      if (yearRefs.length > 0 && authorRefs.length === 0) {
        const suggestions = yearRefs.slice(0, 3).map(pr => refLabel(pr)).join('；');
        comments.push({
          id: 'im' + (idx++), color: 'mismatch', tag: '作者不匹配',
          quote: c.raw, count: 1,
          desc: `参考文献中有 ${year} 年的条目，但没有与作者「${escapeHtml(displayAuthor)}」匹配的。疑似漏列参考文献或作者拼写错误。可能的匹配：${escapeHtml(suggestions)}`,
          inText: c.raw, searchText: makeSearchText((c.authorsRaw || '') + ', ' + year, 120), inRef: false,
          refTargets: yearRefs.slice(0, 3).map(pr => pr.raw)
        });
        continue;
      }
      if (authorRefs.length > 0 && yearRefs.length === 0) {
        const suggestions = authorRefs.slice(0, 3).map(pr => refLabel(pr)).join('；');
        comments.push({
          id: 'im' + (idx++), color: 'mismatch', tag: '年份不匹配',
          quote: c.raw, count: 1,
          desc: `参考文献中有作者「${escapeHtml(displayAuthor)}」的条目，但年份 ${escapeHtml(year)} 不匹配。疑似年份笔误或漏列。可能的匹配：${escapeHtml(suggestions)}`,
          inText: c.raw, searchText: makeSearchText((c.authorsRaw || '') + ', ' + year, 120), inRef: false,
          refTargets: authorRefs.slice(0, 3).map(pr => pr.raw)
        });
        continue;
      }
      if (authorRefs.length > 0 && yearRefs.length > 0) {
        const suggestions = authorRefs.slice(0, 3).map(pr => refLabel(pr)).join('；');
        comments.push({
          id: 'im' + (idx++), color: 'mismatch', tag: '作者与年份不匹配',
          quote: c.raw, count: 1,
          desc: `找到了作者「${escapeHtml(displayAuthor)}」的条目，但年份 ${escapeHtml(year)} 不一致。可能的匹配：${escapeHtml(suggestions)}`,
          inText: c.raw, searchText: makeSearchText((c.authorsRaw || '') + ', ' + year, 120), inRef: false,
          refTargets: authorRefs.slice(0, 3).map(pr => pr.raw)
        });
        continue;
      }
    }
    return comments;
  }

  /* ------------------------------------------------------------
   * In-Text Structural 检测（红色）：et al. / 二次文献 / 个人通讯 / ...
   * ------------------------------------------------------------ */
  function detectInTextStructural(rawCites, parsedRefs, ctx) {
    const { escapeHtml, refLabel, makeSearchText, normalizeSpace } = ctx;
    const comments = [];
    let idx = 0;
    for (const c of rawCites) {
      const authors = c.authors || [];
      const chunk = c.raw || "";

      if (isSecondarySource(chunk)) {
        comments.push({
          id: 'is' + (idx++), color: 'mismatch', tag: '疑似二次文献',
          quote: chunk, count: 1,
          desc: '该引用看起来是二次文献（如 Jones, 2010, as cited in Smith, 2020）。请确认是否确实需要使用二次来源，APA 7 要求使用 "as cited in" 格式，且只在参考文献中列出二级来源（被引者）。',
          inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
        });
      }
      if (hasPersonalComm(chunk)) {
        comments.push({
          id: 'is' + (idx++), color: 'mismatch', tag: '个人通讯',
          quote: chunk, count: 1,
          desc: '个人通讯（personal communication）不属于可检索来源，不应列入参考文献列表。请确认参考文献中未包含该条目（若已包含，应删除）。',
          inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
        });
      }
      if (hasPageButNoYear(chunk)) {
        comments.push({
          id: 'is' + (idx++), color: 'mismatch', tag: '页码无年份',
          quote: chunk, count: 1,
          desc: '该括号中似乎包含页码，但没有明显的年份来匹配参考文献，请检查是否遗漏了年份。',
          inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
        });
      }
      if (c.etal && authors.length >= 1) {
        const leadSurname = normalizeSpace(authors[0].surname).toLowerCase();
        const leadInitial = authors[0].initial ? authors[0].initial.toLowerCase() : '';
        const sameKeyRefs = parsedRefs.filter(pr =>
          pr.authors.length >= 1 &&
          normalizeSpace(pr.authors[0].surname).toLowerCase() === leadSurname &&
          pr.year === c.year
        );
        const etalTargets = sameKeyRefs.filter(pr => pr.authors.length >= 3);
        if (sameKeyRefs.length > 0) {
          if (etalTargets.length === 0) {
            const ref = sameKeyRefs[0];
            comments.push({
              id: 'is' + (idx++), color: 'mismatch', tag: 'et al. 使用不当',
              quote: chunk, count: 1,
              desc: `引用使用了 "et al."，但匹配的参考文献「${escapeHtml(refLabel(ref))}」作者数不足 3 人。APA 7 中 "et al." 仅用于 3 位及以上作者的文献，此处应列出全部作者。`,
              inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
            });
          }
          const ambiguousTargets = etalTargets.filter(pr => {
            const fi = pr.authors[0].initial ? pr.authors[0].initial.toLowerCase() : '';
            return !leadInitial || fi === leadInitial;
          });
          if (ambiguousTargets.length > 1) {
            // 若文中已写出足够的后续作者（第 2 位起）用于消歧，则不再视为歧义。
            // 例如 (Yu, Geng, et al., 2021) 与 (Yu, Zheng et al., 2021) 已能唯一区分。
            const matchesListedAuthors = (pr) => {
              for (let i = 1; i < authors.length; i++) {
                const cSurname = normalizeSpace(authors[i].surname).toLowerCase();
                const prSurname = pr.authors[i] ? normalizeSpace(pr.authors[i].surname).toLowerCase() : '';
                if (!cSurname || cSurname !== prSurname) return false;
              }
              return true;
            };
            const disambiguated = ambiguousTargets.filter(pr => matchesListedAuthors(pr));
            if (disambiguated.length !== 1) {
              const labels = ambiguousTargets.slice(0, 3).map(pr => refLabel(pr)).join('；');
              comments.push({
                id: 'is' + (idx++), color: 'mismatch', tag: 'et al. 歧义',
                quote: chunk, count: 1,
                desc: `使用 "et al." 无法区分多条同作者同年份的参考文献。APA 7（8.18）要求写出足够多作者直到 "et al." 能唯一确定条目，如 (Smith, Jones, et al., ${escapeHtml(c.year)})。候选条目：${escapeHtml(labels)}`,
                inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
              });
            }
          }
        }
      }
      if (!c.etal && authors.length >= 3) {
        const leadSurname = normalizeSpace(authors[0].surname).toLowerCase();
        const matchingRefs = parsedRefs.filter(pr =>
          pr.authors.length >= 3 &&
          normalizeSpace(pr.authors[0].surname).toLowerCase() === leadSurname &&
          pr.year === c.year
        );
        if (matchingRefs.length > 0) {
          if (matchingRefs.length > 1) {
            const labels = matchingRefs.slice(0, 3).map(pr => refLabel(pr)).join('；');
            comments.push({
              id: 'is' + (idx++), color: 'mismatch', tag: '应使用 et al. 或展开消歧',
              quote: chunk, count: 1,
              desc: `该文献有 3 位及以上作者。但因存在多条「${escapeHtml(authors[0].surname)} + ${escapeHtml(c.year)}」的文献，直接缩略成 "et al." 会产生歧义。应写出足够多作者直到可区分，如 (${escapeHtml(authors[0].surname)}, ${escapeHtml(authors[1] ? authors[1].surname : '…')}, ${escapeHtml(authors[2] ? authors[2].surname : '…')}, et al., ${escapeHtml(c.year)})。候选条目：${escapeHtml(labels)}`,
              inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
            });
          } else {
            comments.push({
              id: 'is' + (idx++), color: 'mismatch', tag: '应使用 et al.',
              quote: chunk, count: 1,
              desc: `该文献有 3 位及以上作者，APA 7 要求首次及所有后续引用均使用第一作者 + "et al."。应改为「${escapeHtml(authors[0].surname)} et al., ${escapeHtml(c.year)}」。`,
              inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
            });
          }
        }
      }
      const dualYear = (chunk.match(/\(\s*(?:[A-Za-z]?\d{4}[a-z]?)\s*\/\s*(\d{4}[a-z]?)\s*\)/) ||
                        chunk.match(/(\d{4}[a-z]?)\s*\/\s*(\d{4}[a-z]?)/));
      if (dualYear) {
        const originalYear = dualYear[1] ? String(dualYear[1]).toLowerCase() : null;
        if (originalYear) {
          const leadSurname = authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : "";
          const ref = parsedRefs.find(pr =>
            pr.year === c.year &&
            (!leadSurname || (pr.authors[0] && normalizeSpace(pr.authors[0].surname).toLowerCase() === leadSurname)) &&
            !/\b(?:original|orig\.|first published|originally published)\b/i.test(pr.raw)
          );
          if (ref) {
            const dy = chunk.match(/\d{4}[a-z]?\s*\/\s*\d{4}[a-z]?/);
            comments.push({
              id: 'is' + (idx++), color: 'mismatch', tag: '原版年份缺失',
              quote: chunk, count: 1,
              desc: `该引用为再版/重印文献（双年份 ${escapeHtml(dy ? dy[0] : '')}），但参考文献条目未注明原始出版年。APA 7 要求在参考文献中加注原版信息（如 "Original work published 20XX"）。`,
              inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
            });
          }
        }
      }
    }
    return comments;
  }

  /* ------------------------------------------------------------
   * In-Text Style Warnings 检测（橙色）
   * ------------------------------------------------------------ */
  function detectInTextStyleWarnings(rawCites, parsedRefs, ctx) {
    const { escapeHtml, normalizeSpace, parseInTextAuthorList, makeSearchText } = ctx;
    const comments = [];
    let idx = 0;
    const parenGroups = rawCites.filter(c => !isNarrativeCitation(c) && (c.raw || "").includes(';'));

    for (const c of rawCites) {
      const chunk = c.raw || "";
      const narrative = isNarrativeCitation(c);
      const subCites = splitSubCitesInChunk(chunk);
      const isMulti = subCites.length > 1;

      if (isMulti && !narrative) {
        const order = subCites.map(sc => {
          const { authors } = parseInTextAuthorList(sc, { allowAnd: false });
          return authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : '\uffff';
        });
        let ok = true;
        for (let i = 1; i < order.length; i++) {
          if (order[i] < order[i - 1]) { ok = false; break; }
        }
        if (!ok) {
          comments.push({
            id: 'sw' + (idx++), color: 'style', tag: '样式警告',
            quote: chunk, count: 1,
            desc: '同一括号内的多个引用应按字母顺序排列（与参考文献列表规则一致）。请调整为作者姓氏的字母序。',
            inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
          });
        }
      }

      if (isMulti && !narrative) {
        const years = yearsInChunk(chunk);
        if (years.length >= 2) {
          let chronoOk = true;
          for (let i = 1; i < years.length; i++) {
            if (years[i] < years[i - 1]) { chronoOk = false; break; }
          }
          const firstSurnames = subCites.map(sc => {
            const { authors } = parseInTextAuthorList(sc, { allowAnd: false });
            return authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : null;
          }).filter(Boolean);
          const allSameAuthor = firstSurnames.length > 0 && firstSurnames.every(s => s === firstSurnames[0]);
          if (!chronoOk && allSameAuthor) {
            comments.push({
              id: 'sw' + (idx++), color: 'style', tag: '样式警告',
              quote: chunk, count: 1,
              desc: '同一作者/作者的多个年份引用应按时间顺序排列，如 (Author, 2012, 2013)。',
              inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
            });
          }
        }
      }

      if (!narrative && isMulti) {
        const inner = chunk.replace(/^\(|\)$/g, '');
        const multiPattern = inner.split(/\s*;\s*/).length < 2 &&
          /\b[A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+\s*,?\s*\d{4}[a-z]?\s*,\s+[A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+/i.test(inner);
        if (multiPattern) {
          comments.push({
            id: 'sw' + (idx++), color: 'style', tag: '样式警告',
            quote: chunk, count: 1,
            desc: '同一括号内的多个引用应以分号（;）加空格分隔，而非逗号。',
            inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
          });
        }
      }

      if (!narrative) {
        const inner = chunk.replace(/^\(|\)$/g, '');
        if (/[A-Za-z\u00C0-\u017F]\d{4}[a-z]?/.test(inner) && !/(?:,|\s)\d{4}[a-z]?/.test(inner)) {
          comments.push({
            id: 'sw' + (idx++), color: 'style', tag: '样式警告',
            quote: chunk, count: 1,
            desc: '括号引用中作者与年份之间应有逗号加空格，如 (Author, 2020)。',
            inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
          });
        }
      }

      if (/\bet\s+al\b(?![\.!\?])/i.test(chunk) && !/\bet\s+al\.(\s|$|[\)])/i.test(chunk)) {
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1,
          desc: '"et al." 拼写不规范：应为 "et al."（al 后需有句点）。',
          inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
        });
      }

      if (narrative && hasAmpersand(chunk)) {
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1,
          desc: '叙事引用（文内非括号）中，最后两位作者之间应使用 "and" 而非 "&"（& 仅用于括号引用）。',
          inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
        });
      }

      if (isMulti && !narrative) {
        const firstSurnames = subCites.map(sc => {
          const { authors } = parseInTextAuthorList(sc, { allowAnd: false });
          return authors.length ? normalizeSpace(authors[0].surname).toLowerCase() : null;
        }).filter(Boolean);
        const allSameAuthor = firstSurnames.length > 0 && firstSurnames.every(s => s === firstSurnames[0]);
        if (allSameAuthor && subCites.some(sc => sc.includes(',') && /\d{4}/.test(sc))) {
          const repeated = subCites.filter(sc => {
            const { authors } = parseInTextAuthorList(sc, { allowAnd: false });
            return authors.length && normalizeSpace(authors[0].surname).toLowerCase() === firstSurnames[0];
          }).length >= 2;
          if (repeated) {
            comments.push({
              id: 'sw' + (idx++), color: 'style', tag: '样式警告',
              quote: chunk, count: 1,
              desc: '同一作者的多个年份引用应使用收缩形式，如 (Smith, 2012, 2013)，不必重复作者姓氏。',
              inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
            });
          }
        }
      }

      if (hasPageNotation(chunk) === false && /\b\d+\s*[–-]\s*\d+\b/.test(chunk) && !hasPageButNoYear(chunk)) {
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1,
          desc: '页码应使用 "p."（单页）或 "pp."（多页）记号，如 (Author, 2020, pp. 12–34)。',
          inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
        });
      }

      if (/\b\d{4}[a-z]?\s*,?\s*(?:cited|see)\b/i.test(chunk) && !isSecondarySource(chunk)) {
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1,
          desc: '该引用疑似二次文献但格式不正确。APA 7 应使用 "as cited in" 格式，如 (Original, 2010, as cited in Secondary, 2020)。',
          inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
        });
      }

      if (hasIbid(chunk)) {
        comments.push({
          id: 'sw' + (idx++), color: 'style', tag: '样式警告',
          quote: chunk, count: 1,
          desc: '"ibid." 记号在 APA 格式中无效，请改为完整作者-年份引用。',
          inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
        });
      }
    }

    for (const c of rawCites) {
      const chunk = c.raw || "";
      // 单作者 + "et al." 之间不应有逗号：如 "(Yu, et al., 2021)" 应为 "(Yu et al., 2021)"。
      // 但若已写出多位作者用于消歧（如 "(Yu, Geng, et al., 2021)"），末位作者前的逗号是正确写法，
      // 因此仅当 "et al." 前只有一个作者名时才提示。
      const etAlMatch = chunk.match(/\b[A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F'’\-]+\s*,\s*et\s+al\./i);
      if (etAlMatch) {
        const before = chunk.slice(0, etAlMatch.index + etAlMatch[0].indexOf('et'));
        const nameSegs = before.split(',').map(s => s.trim()).filter(Boolean);
        // 仅当 "et al." 前只有一个作者名（≤1 个逗号分隔段）时视为单作者误用逗号
        if (nameSegs.length <= 1) {
          comments.push({
            id: 'sw' + (idx++), color: 'style', tag: '样式警告',
            quote: chunk, count: 1,
            desc: '单作者与 "et al." 之间只需空格，不需要逗号，应为 (Author et al., 2020)。',
            inText: chunk, searchText: makeSearchText(chunk, 120), inRef: false
          });
        }
      }
    }

    {
      const surnameToInitials = new Map();
      for (const pr of parsedRefs) {
        if (!pr.authors.length) continue;
        const s = normalizeSpace(pr.authors[0].surname).toLowerCase();
        if (!surnameToInitials.has(s)) surnameToInitials.set(s, new Set());
        if (pr.authors[0].initial) surnameToInitials.get(s).add(pr.authors[0].initial.toLowerCase());
      }
      for (const [surname, inits] of surnameToInitials) {
        if (inits.size <= 1) continue;
        for (const c of rawCites) {
          const { authors } = parseInTextAuthorList((c.raw || '').replace(/^\(|\)$/g, ''), { allowAnd: false });
          const sameSurnameInCite = authors.filter(a => normalizeSpace(a.surname).toLowerCase() === surname).length >= 2;
          if (sameSurnameInCite) continue;
          const hit = authors.find(a => normalizeSpace(a.surname).toLowerCase() === surname);
          if (hit && !hit.initial) {
            const initialsLabel = [...inits].map(x => x.toUpperCase()).join('/');
            comments.push({
              id: 'sw' + (idx++), color: 'style', tag: '样式警告',
              quote: c.raw, count: 1,
              desc: `参考文献中有多位第一作者同姓「${escapeHtml(surname)}」但首字母不同（${escapeHtml(initialsLabel)}）。APA 7（§8.20）要求在引用时写出首字母以消除歧义，如 (${escapeHtml(surname[0].toUpperCase() + surname.slice(1))} ${[...inits][0].toUpperCase()}, 年份)。请先确认参考文献条目中的首字母准确。`,
              inText: c.raw, searchText: makeSearchText(c.raw, 120), inRef: false
            });
            break;
          }
        }
      }
    }

    return comments;
  }

  /* ------------------------------------------------------------
   * 暴露为全局风格包对象
   * ------------------------------------------------------------ */
  const apaRules = {
    id: 'apa7',
    name: 'APA 7th',
    version: '1.0.0',
    config,
    activeProfile,
    headingRegex: REF_HEADING_RE,
    nonRefMarkerRegex: NON_REF_MARKER_RE,
    refOrderCompare,
    classify,
    lintReference,
    detectInTextMismatches,
    detectInTextStructural,
    detectInTextStyleWarnings
  };
  window.CitationRules = apaRules;
  window.apa7Rules = apaRules; // 便于加载器按 <id>Rules 规则查找
})();
