# CiteRev App JSON schema

APA 7 parameter override:

```json
{"schemaVersion":1,"id":"unique-id","name":"Display name","baseStyle":"apa7","config":{}}
```

Independent author-date rule:

```json
{
  "schemaVersion": 1,
  "id": "unique-id",
  "name": "Display name",
  "version": "1.0.0",
  "ruleType": "independent",
  "description": "Scope and limitations",
  "config": {
    "headingKeywords": ["references", "bibliography"],
    "nonRefMarkers": ["appendix"],
    "referenceOrder": "author-year",
    "referenceTypeLabel": "Reference",
    "ignoreLeadingArticles": ["a", "an", "the"]
  },
  "rules": {"reference": [], "inTextStructural": [], "inTextStyle": []}
}
```

Independent rules must omit `baseStyle`. `referenceOrder` supports `author-year`, `year-author`, and `appearance`.

Check object:

```json
{
  "id": "stable-kebab-id",
  "pattern": "\\bdoi\\s*:",
  "flags": "i",
  "condition": "mustNotMatch",
  "severity": "warn",
  "color": "style",
  "label": "DOI",
  "message": "Use https://doi.org/..."
}
```

- `condition`: `mustMatch` or `mustNotMatch`.
- Reference `severity`: `warn` or `bad`.
- In-text `color`: normally `style` or `format`.
- `pattern` is a JavaScript-compatible regex body without slash delimiters; double backslashes in JSON.

The independent interpreter is author-year oriented. It supports regex checks over whole reference entries and extracted citations plus simple bibliography ordering. It does not fully model notes, numeric citations, item-type templates, CSL conditionals, locale terms, disambiguation algorithms, or exact Word character formatting.
