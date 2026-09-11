# 引用审查 · macOS 菜单栏工具（Swift 原生版）

这是原 `word-citation-menubar`（Python 版）的 **Swift 原生重写版**。

**核心改进：不再依赖 Python 与 Node.js**，检测引擎通过 macOS 系统自带的
**JavaScriptCore** 框架运行原有 JS 规则（`rules-apa7.js` + `rules-loader.js`），
因此能打包成一个**双击即用、无需安装任何运行时的独立 `.app`**，可直接分发给其他用户。

## 规则配置

检测引擎已将 APA 7 算法与可配置参数分离：

- `Resources/engine/rules-core.js`：安全加载、校验、继承和合并 JSON 配置。
- `Resources/engine/rules-apa7.json`：内置 APA 7 参数。
- `Resources/engine/rules-apa7.js`：当前 APA 解析与检查算法，从活动 JSON 配置读取参数。
- `Resources/engine/rules-user-example.json`：用户规则模板。

用户可在 App 的“设置 → 检查样式 → 导入规则”导入两类 JSON 规则：

- APA 7 参数覆盖：设置唯一 `id` 和 `baseStyle: "apa7"`，未填写的参数继承内置 APA 7。
- 独立引用体系：设置唯一 `id` 和 `ruleType: "independent"`，不设置 `baseStyle`，通过 `config` 与 `rules` 完整描述自己的检查项。可参考 `Resources/engine/rules-independent-example.json`。

所有导入内容都是声明式 JSON，不执行用户代码。独立 JSON 规则目前适用于作者—年份型体系，支持参考文献正则检查、文中引用结构/样式检查和参考文献排序配置；后续可继续扩展声明式规则能力。

详细字段、模板、正则转义和 Chicago Author-Date 示例见 [`docs/JSON规则编写指南.md`](docs/JSON规则编写指南.md)。

这里的“继承”只用于定制 APA 7 参数，不代表通过覆盖 APA 7 来实现另一种引用体系。将来完整支持 Chicago、MLA 等体系时，每种体系都应提供独立的解析与检查规则包，作为新的顶层规则实现。

## 亮点

- ✅ 真正的原生 `.app`，用户不需要装 Python、不需要装 Node、不需要 Xcode
- ✅ 检测逻辑与原来完全一致（复用同一套 `engine/` JS 规则）
- ✅ 格式检查、引用一致性检查与统计完全离线；真伪检查仅在用户点击“开始查验”后联网
- ✅ 真伪检查复用内置 Web verifier，直接查询 Crossref/OpenAlex，不经过 CiteRev 自有服务器
- ✅ **打开程序即自动展示审查窗口**（若未检测到 Word 文档，会提示打开并给「开始检测」按钮）
- ✅ 菜单栏 📚 图标：**左键点击直接打开审查窗口**，右键点击弹出菜单
- ✅ 窗口默认**停靠在屏幕右侧**（留边距不溢出）且**永远在最前**（浮层）
- ✅ 原生结果窗口：**卡片形式**展示问题（仿照 Word 加载项 taskpane 风格），可按分类筛选
- ✅ **点击卡片即在 Word 中定位并选中原文**
- ✅ 内置 **3 个统计视图**（同加载项）：文中引用次数 / 参考文献年份 / 期刊出现次数
- ✅ 统计条目支持 **◀ 上一个 / ▶ 下一个** 在文档中循环跳转命中位置
- ✅ 复用原有 `export-word.applescript` / `locate.applescript` / 新增 `locate-nth.applescript` 控制 Word

## 界面

```
┌────────────────────────────────────────────────┐
│  菜单栏 📚 图标（屏幕右上角）                    │
│   └─ 左键 → 直接打开审查窗口                    │
│     右键 → 菜单（打开窗口/重新检测/退出）        │
└──────────────────┬─────────────────────────────┘
                   ▼
┌────────────────────────────────────────────────┐
│  结果窗口（SwiftUI，卡片形式，仿加载项风格）     │
│  停靠屏幕右侧 + 永远置顶（floating）             │
│  📚 引用审查  [统计] [↻重新检测] [打开Word]     │
│  缺失 0 · 未引用 0 · 不匹配 0 · 样式 0 · 格式 2 │
│  (全部) (引用缺失)(未被引用)(不匹配)(样式)(格式) │
│  ┌───────────────────────────────────────────┐ │
│  │ ▌[格式] 格式问题          ↗               │ │
│  │ │ Brown, A. (2019). A study of...        │ │
│  │ │ 页码范围建议使用连接号 – …               │ │
│  └───────────────────────────────────────────┘ │
│  （卡片：左侧分类色条 + 标签 + 原文 + 说明）     │
│  点击卡片 → Word 中定位并选中原文                │
└────────────────────────────────────────────────┘

[统计] 视图：3 个统计维度（Tab 切换）
  ① 文中引用次数（作者+年份，出现次数）
  ② 参考文献年份（按年份统计条数）
  ③ 期刊出现次数（按期刊统计次数）
  每条右侧有 ◀ 上一个 / ▶ 下一个，在文档中循环跳转该条目的命中位置
```

## 架构

```
┌────────────────────────────────────────────┐
│ 引用审查.app（Swift 原生）                 │
│  ┌──────────────────────────────────────┐  │
│  │ 菜单栏 📚 → 打开结果窗口             │  │
│  └──────────────────┬───────────────────┘  │
│                     │ ① osascript          │
│                     ▼                      │
│  ┌──────────────────────────────────────┐  │
│  │ export-word.applescript（读 Word）   │  │
│  └──────────────────┬───────────────────┘  │
│                     │ ② JavaScriptCore     │
│                     ▼                      │
│  ┌──────────────────────────────────────┐  │
│  │ prelude.js（模拟 window 环境）        │  │
│  │ engine/rules-apa7.js                 │  │
│  │ engine/rules-loader.js               │  │
│  │ driver.js（原 detect.js 算法）        │  │
│  └──────────────────┬───────────────────┘  │
│                     │ ③ 点击卡片 → osascript
│                     ▼                      │
│  ┌──────────────────────────────────────┐  │
│  │ locate.applescript（Word 中选中原文） │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

## 真伪检查与隐私

Word 读取成功后，App 只在当前进程内保存一份真伪检查输入快照，不写入磁盘或
`UserDefaults`。用户首次点击底部“真伪”时才加载随 App 打包的本地 WKWebView 并
注入快照；只有用户随后点击页面中的“开始查验”，才会向 Crossref/OpenAlex 发送
单条参考文献文本或 DOI。格式检查、引用一致性检查和统计仍保持离线运行。

> 关键点：`detect.js` 原本依赖 Node 的 `fs` / `process`，重写版把其中的**纯算法函数**
> 抽到 `Resources/driver.js`，并提供 `prelude.js` 模拟 `window` / `localStorage`，
> 让这些规则能直接用 JavaScriptCore 运行，从而彻底去掉 Node 依赖。

## 目录结构

```
word-citation-menubar-swift/
├── Package.swift              # Swift Package 配置（macOS 13+）
├── Makefile                   # 构建 / 打包脚本
├── Sources/CitationMenubar/   # Swift 源码
│   ├── main.swift             # 入口
│   ├── AppDelegate.swift      # 菜单栏
│   ├── ResultWindowController.swift
│   ├── ResultView.swift       # SwiftUI 卡片界面 + 统计视图
│   ├── ResultViewModel.swift  # 状态 / 后台检测 / 无文档提示
│   ├── VerifierWebView.swift  # 按需加载的 WKWebView 与内存快照注入
│   ├── DetectionEngine.swift  # JavaScriptCore 引擎封装
│   ├── WordController.swift   # 调用 AppleScript 读/定位 Word
│   ├── Problem.swift          # 数据模型 + 分类颜色 + 统计模型
│   └── Resources.swift        # 定位打包资源
├── Resources/
│   ├── prelude.js             # JS 全局环境（模拟 window）
│   ├── driver.js              # 原 detect.js 算法（JS）+ 统计 statsData
│   ├── engine/                # 原 JS 规则引擎（勿改）
│   ├── export-word.applescript
│   ├── locate.applescript     # 定位首个命中
│   └── locate-nth.applescript # 定位第 N 个命中（统计上一个/下一个）
├── ../web/                    # Web verifier 唯一源码，make app 时复制进 App
└── dist/                      # 打包产物（make app 生成）
    └── 引用审查.app
```

## 构建与打包（需要本机有 Swift / Xcode）

```bash
# 1. 编译并运行（开发调试，资源从 Resources/ 读取）
make run

# 2. 打包为独立 .app（生成 dist/引用审查.app）
make app

# 3. 清理
make clean
```

## 分发

把 `dist/引用审查.app` 整个文件夹发送给对方，对方**双击即可运行**，
无需安装 Python / Node / Xcode。

> **注意**：因为是未签名应用，对方首次打开时可能被 Gatekeeper 拦截。
> 对方需在 **系统设置 → 隐私与安全性** 里允许该 App，或用 `右键 → 打开`。
> 若要更顺畅地分发，可在 `Makefile` 中取消注释 `codesign` 行（本机签名，
> 或配置开发者证书后用 `Developer ID` 签名）。

## 首次授权（关键）

macOS 出于安全考虑，控制其他 App 前必须授权：

1. **系统设置 → 隐私与安全性 → 辅助功能**
   - 勾选「引用审查」（运行的那个 App）
2. 第一次检测时，Word 可能弹窗询问"是否允许控制此电脑" → 点**允许**
3. 若提示"读取 Word 失败 / 权限不足"，请回到第 1 步重新授权

## 复用到新检测逻辑

检测规则集中在 `Resources/engine/rules-apa7.js`。若你更新了规则，
只需覆盖该文件并重新 `make app` 即可，Swift 代码无需改动。
`driver.js` 中抽出的纯算法应与 add-in 项目的 `detect.js` 保持一致。
