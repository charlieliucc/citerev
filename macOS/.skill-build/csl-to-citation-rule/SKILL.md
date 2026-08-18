---
name: csl-to-citation-rule
description: Generate an importable CiteRev App rule JSON from a CSL style file, the App JSON-rule guide/schema, and representative paper samples. Use when Codex must inspect .csl XML plus sample citations/references, infer an author-date style's declarative checks, produce or revise an independent or APA-derived JSON rule, and validate it before delivery.
---

# Generate CiteRev JSON Rules

Create one UTF-8 `.json` file that the CiteRev App can import. Never emit executable JavaScript.

## Required inputs

Obtain a `.csl` file, the App rule guide or schema, and a representative paper sample containing in-text citations and its reference list. Use `references/app-rule-schema.md` when no newer guide is supplied.

If the paper is a PDF or DOCX, use the corresponding document skill to extract text and formatting evidence. If an input is missing, proceed with available evidence but list the gap and lower confidence; do not invent unsupported rules.

## Workflow

1. Run `scripts/inspect_csl.py STYLE.csl` and retain its JSON summary.
2. Read the supplied rule guide completely. If none is supplied, read `references/app-rule-schema.md` completely.
3. Inspect the CSL XML where the summary points to macros, citation layout, bibliography layout, sorting, names, dates, delimiters, affixes, text-case, quotes, and font-style.
4. Extract representative correct examples from the paper: parenthetical and narrative citations; author-count variants; disambiguation; bibliography heading/order; and available source types.
5. Reconcile evidence in this priority order: explicit guide/schema constraints, CSL behavior, then repeated paper patterns. Treat the paper as evidence, not authority.
6. Use `baseStyle: "apa7"` only for a genuine APA 7 variant whose differences fit supported parameters. Otherwise use `ruleType: "independent"` and omit `baseStyle`.
7. Translate only checks expressible by the App schema. Prefer narrow regexes with stable kebab-case IDs and actionable messages.
8. Save the proposed JSON and run `scripts/validate_rule.py OUTPUT.json`.
9. Fix every error. Review warnings and remove likely overmatching rules.
10. Deliver the JSON plus a short coverage report: implemented checks, evidence, unsupported CSL features, and recommended tests.

## Mapping guidance

- Map CSL citation delimiters, affixes, name delimiters, `and`, and date layout to `inTextStructural` or `inTextStyle` only when a reliable regex can express them.
- Map CSL bibliography sorting to `config.referenceOrder`.
- Map bibliography layout and macros to narrowly testable `reference` rules.
- Report CSL italics, locale terms, type branches, disambiguation, collapse, position behavior, and precise formatting as unsupported when the schema cannot express them.
- The independent engine shares an author-year extractor. Never claim full support for numeric or note-based styles such as Chicago Notes and Bibliography.

## Quality rules

- Keep JSON valid and comment-free.
- Double backslashes inside JSON regex strings.
- Separate `pattern` and `flags`; never put `/pattern/i` in `pattern`.
- Use `mustMatch` only when every relevant input must match; use `mustNotMatch` for forbidden forms.
- Test every check against a passing example, a failing example, and a near miss.
- Do not treat CSL rendering instructions as automatically detectable Word formatting.
- Never label a partial rule as a complete style implementation.

## Bundled resources

- `scripts/inspect_csl.py`: summarize CSL metadata and structure.
- `scripts/validate_rule.py`: validate App compatibility and regex syntax.
- `references/app-rule-schema.md`: concise schema and limits.
