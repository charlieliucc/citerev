# JSON 引用规则编写指南

引用审查只导入声明式 JSON，不执行 JSON 中的代码。规则分为两类：

1. **APA 7 参数覆盖**：继承内置 APA 7，只修改部分参数。
2. **独立引用体系**：不继承 APA 7，用 JSON 声明自己的检查项。当前适用于作者—年份型体系。

## 1. APA 7 参数覆盖规则

适合期刊、学校或机构在 APA 7 基础上调整标题关键词、页码记号等参数。

```json
{
  "schemaVersion": 1,
  "id": "my-apa7-profile",
  "name": "我的 APA 7 规则",
  "version": "1.0.0",
  "baseStyle": "apa7",
  "description": "在 APA 7 基础上调整部分参数。",
  "config": {
    "headingKeywords": ["references", "参考文献"],
    "pageNotation": "pp."
  }
}
```

要求：

- `baseStyle` 必须是 `"apa7"`。
- `id` 不能是保留 ID `apa7`。
- `config` 只填写需要覆盖的参数；未填写的参数自动继承 APA 7。
- 这种规则仍然是 APA 7，不应拿来表示 Chicago、MLA 等其他体系。

## 2. 独立引用体系规则

其他引用体系必须使用独立规则，不设置 `baseStyle`：

```json
{
  "schemaVersion": 1,
  "id": "my-author-date-style",
  "name": "我的作者—年份样式",
  "version": "1.0.0",
  "ruleType": "independent",
  "description": "一个独立的作者—年份引用体系。",
  "config": {
    "headingKeywords": ["references", "bibliography", "参考文献"],
    "nonRefMarkers": ["appendix", "附录"],
    "referenceOrder": "author-year",
    "referenceTypeLabel": "参考文献",
    "ignoreLeadingArticles": ["a", "an", "the"]
  },
  "rules": {
    "reference": [],
    "inTextStructural": [],
    "inTextStyle": []
  }
}
```

### 顶层字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 是 | 当前固定为 `1`。 |
| `id` | 是 | 唯一 ID。只能包含字母、数字、点、下划线和连字符，且必须以字母或数字开头。 |
| `name` | 是 | 在 App 规则选择器中显示的名称。 |
| `version` | 否 | 建议使用 `1.0.0` 形式。 |
| `description` | 否 | 规则用途说明。 |
| `ruleType` | 独立规则必填 | 独立体系固定为 `"independent"`。 |
| `baseStyle` | APA 覆盖必填 | APA 覆盖写 `"apa7"`；独立规则不得包含此字段。 |
| `config` | 是 | 体系级配置。 |
| `rules` | 独立规则必填 | 参考文献和文中引用审查项。 |

### `config` 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `headingKeywords` | 字符串数组 | 用于识别参考文献列表标题。 |
| `nonRefMarkers` | 字符串数组 | 参考文献标题之后不应视为参考条目的段落标记。 |
| `referenceOrder` | 字符串 | `author-year`、`year-author` 或 `appearance`。 |
| `referenceTypeLabel` | 字符串 | 问题卡片中显示的参考文献类型名称。 |
| `ignoreLeadingArticles` | 字符串数组 | 排序时忽略的开头冠词，如 `a`、`an`、`the`。 |

## 3. 编写检查项

独立规则支持三组检查：

- `reference`：逐条检查参考文献。
- `inTextStructural`：检查文中引用结构。
- `inTextStyle`：检查文中引用样式。

单条检查的通用格式：

```json
{
  "id": "year-required",
  "pattern": "\\b(?:19|20)\\d{2}\\b",
  "flags": "i",
  "condition": "mustMatch",
  "severity": "bad",
  "color": "style",
  "label": "年份",
  "message": "参考文献必须包含四位出版年份。"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 建议 | 检查项的稳定唯一标识。 |
| `pattern` | 是 | JavaScript 正则表达式文本，不写首尾 `/`。 |
| `flags` | 否 | 正则标志，常用 `i`（忽略大小写）。默认是 `i`。 |
| `condition` | 是 | `mustMatch` 表示必须匹配；`mustNotMatch` 表示不得匹配。 |
| `severity` | 参考文献规则可用 | `warn` 或 `bad`。默认是 `warn`。 |
| `color` | 文中规则可用 | 问题分类颜色，通常用 `style` 或 `format`。 |
| `label` | 建议 | 简短问题分类，例如“年份”“DOI”“作者连接”。 |
| `message` | 是 | 命中问题后展示给用户的说明。 |

### `mustMatch` 与 `mustNotMatch`

要求参考文献必须包含四位年份：

```json
{
  "id": "year-required",
  "pattern": "\\b(?:19|20)\\d{2}\\b",
  "condition": "mustMatch",
  "severity": "bad",
  "label": "年份",
  "message": "参考文献必须包含四位年份。"
}
```

禁止使用 `doi:` 前缀：

```json
{
  "id": "legacy-doi-prefix",
  "pattern": "\\bdoi\\s*:",
  "flags": "i",
  "condition": "mustNotMatch",
  "severity": "warn",
  "label": "DOI",
  "message": "请将 DOI 改写为 https://doi.org/...。"
}
```

## 4. JSON 中的正则转义

JSON 会先处理一次反斜杠，因此正则中的一个反斜杠必须在 JSON 中写成两个：

| 想表达的正则 | JSON 中的写法 |
| --- | --- |
| `\d{4}` | `"\\d{4}"` |
| `\s+` | `"\\s+"` |
| `\bdoi\b` | `"\\bdoi\\b"` |
| `(Smith 2020)` | `"\\(Smith\\s+2020\\)"` |

不要这样写：

```json
{ "pattern": "/\\d{4}/i" }
```

应把表达式和标志分开：

```json
{
  "pattern": "\\d{4}",
  "flags": "i"
}
```

## 5. Chicago Author-Date 起始示例

Chicago 有 Author-Date 和 Notes and Bibliography 两套主要体系。当前独立 JSON 引擎适合 Author-Date；暂不适合依赖脚注、尾注的 Notes and Bibliography。

```json
{
  "schemaVersion": 1,
  "id": "chicago-author-date",
  "name": "Chicago Author-Date",
  "version": "1.0.0",
  "ruleType": "independent",
  "description": "Chicago 作者—年份制基础规则。",
  "config": {
    "headingKeywords": ["references", "bibliography", "参考文献"],
    "nonRefMarkers": ["appendix", "附录"],
    "referenceOrder": "author-year",
    "referenceTypeLabel": "Chicago 参考文献",
    "ignoreLeadingArticles": ["a", "an", "the"]
  },
  "rules": {
    "reference": [
      {
        "id": "year-required",
        "pattern": "\\b(?:19|20)\\d{2}\\b",
        "condition": "mustMatch",
        "severity": "bad",
        "label": "年份",
        "message": "Chicago Author-Date 参考文献应包含出版年份。"
      },
      {
        "id": "legacy-doi-prefix",
        "pattern": "\\bdoi\\s*:",
        "condition": "mustNotMatch",
        "severity": "warn",
        "label": "DOI",
        "message": "建议将 DOI 写为 https://doi.org/...。"
      }
    ],
    "inTextStructural": [
      {
        "id": "comma-before-year",
        "pattern": "\\([^)]+,\\s*(?:19|20)\\d{2}\\)",
        "condition": "mustNotMatch",
        "color": "style",
        "label": "文中引用",
        "message": "Chicago Author-Date 通常不在作者和年份之间使用逗号，例如 (Smith 2020)。"
      }
    ],
    "inTextStyle": [
      {
        "id": "ampersand",
        "pattern": "&",
        "condition": "mustNotMatch",
        "color": "style",
        "label": "作者连接",
        "message": "Chicago Author-Date 通常使用 and 连接作者，不使用 &。"
      }
    ]
  }
}
```

## 6. 导入与测试

1. 使用 UTF-8 编码保存文件，扩展名为 `.json`。
2. 在 App 中打开“设置 → 检查样式”。
3. 点击“导入规则”，选择 JSON 文件。
4. 导入成功后，新规则会自动出现在“当前规则”选择器中并被启用。
5. 准备一份同时包含正确案例和错误案例的 Word 文档，点击“开始检测”。
6. 检查每条规则是否只在预期文本上触发，尤其注意正则是否过宽。
7. 修改 JSON 后可使用相同 `id` 再次导入，以更新该规则。

建议每次只新增少量检查项，并为每一项至少准备：

- 一个应通过的文本；
- 一个应报错的文本；
- 一个相似但不应命中的边界案例。

## 7. 常见导入错误

### `规则 JSON 格式无效`

检查是否存在以下问题：

- 缺少 `schemaVersion`、`id`、`name` 或 `config`；
- JSON 末尾存在多余逗号；
- 独立规则缺少 `ruleType: "independent"` 或 `rules`；
- `config`、`rules` 被写成数组或字符串。

### `APA 参数覆盖须使用 baseStyle: apa7`

- APA 覆盖规则必须设置 `baseStyle: "apa7"`；
- 独立规则必须删除 `baseStyle`，并设置 `ruleType: "independent"`。

### 正则表达式无效

重点检查：

- 反斜杠是否在 JSON 中写成 `\\`；
- 圆括号、方括号是否成对；
- 是否错误地把 `/表达式/i` 整体写进 `pattern`。

## 8. 当前能力边界

独立 JSON 规则目前共享作者—年份引用提取器，适合 APA、Chicago Author-Date 等结构相近的体系。当前尚不能完整表达：

- Chicago Notes and Bibliography 的脚注和尾注；
- 数字编号制引用，如 Vancouver、IEEE；
- 按来源类型分别定义完整字段模板；
- 精确检查 Word 中局部斜体、引号和标点范围；
- 自定义作者、年份和文献字段解析算法。

如果一种引用体系依赖上述能力，应先扩展检测器及 JSON schema，再编写该体系的完整规则，不能通过修改 APA 7 参数来冒充支持。
