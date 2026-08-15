/* Declarative, JSON-only rule package for independent citation styles. */
(function () {
  'use strict';
  if (!window.RuleProfiles) throw new Error('缺少规则配置加载器 rules-core.js');
  const profile = window.RuleProfiles.getActive();
  if (profile.ruleType !== 'independent') throw new Error('当前配置不是独立 JSON 引用体系。');
  const config = profile.config || {};
  const definitions = profile.rules || {};

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function keywordsRegex(values, fallback) {
    const list = Array.isArray(values) && values.length ? values : fallback;
    return new RegExp('^\\s*(?:' + list.map(escapeRegExp).join('|') + ')\\s*[.\\-:]?\\s*$', 'i');
  }
  function compile(rule) {
    try { return new RegExp(String(rule.pattern || ''), String(rule.flags || 'i')); }
    catch (error) { throw new Error('规则 ' + (rule.id || '') + ' 的正则表达式无效：' + error.message); }
  }
  function violated(rule, text) {
    const matches = compile(rule).test(String(text || ''));
    return rule.condition === 'mustMatch' ? !matches : matches;
  }
  function referenceIssues(text) {
    return (Array.isArray(definitions.reference) ? definitions.reference : [])
      .filter(function (rule) { return rule && violated(rule, text); })
      .map(function (rule) {
        return {
          severity: rule.severity === 'bad' ? 'bad' : 'warn',
          message: String(rule.message || '不符合当前引用样式。'),
          meta: String(rule.label || rule.id || '格式')
        };
      });
  }
  function citationComments(citations, group) {
    const rules = Array.isArray(definitions[group]) ? definitions[group] : [];
    const comments = [];
    let index = 0;
    citations.forEach(function (citation) {
      rules.forEach(function (rule) {
        if (!rule || !violated(rule, citation.raw)) return;
        comments.push({
          id: 'json-' + group + '-' + index++, color: rule.color || 'style',
          tag: rule.label || '样式', quote: citation.raw,
          desc: rule.message || '不符合当前引用样式。', inText: citation.raw,
          searchText: citation.raw, inRef: false
        });
      });
    });
    return comments;
  }
  function orderKey(reference) {
    const mode = config.referenceOrder || 'author-year';
    if (mode === 'appearance') return String(reference._idx || 0).padStart(8, '0');
    const author = (reference.surnames && reference.surnames[0]) || '';
    const year = reference.year || '';
    return mode === 'year-author' ? year + '|' + author : author + '|' + year;
  }

  const headingRegex = keywordsRegex(config.headingKeywords, ['references', 'bibliography', '参考文献']);
  const nonRefMarkerRegex = keywordsRegex(config.nonRefMarkers, ['^$']);
  const rules = {
    id: profile.id,
    name: profile.name,
    version: profile.version || '1.0.0',
    config: config,
    activeProfile: profile,
    headingRegex: headingRegex,
    nonRefMarkerRegex: nonRefMarkerRegex,
    refOrderCompare: function (a, b) { return orderKey(a).localeCompare(orderKey(b)); },
    classify: function () { return config.referenceTypeLabel || '参考文献'; },
    lintReference: function (line) { return { type: config.referenceTypeLabel || '参考文献', issues: referenceIssues(line.text) }; },
    detectInTextMismatches: function () { return []; },
    detectInTextStructural: function (citations) { return citationComments(citations, 'inTextStructural'); },
    detectInTextStyleWarnings: function (citations) { return citationComments(citations, 'inTextStyle'); }
  };
  window.CitationRules = rules;
  window[profile.id + 'Rules'] = rules;
})();
