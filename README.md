# 引用审查 CiteRev

> 交稿前，先用引用审查。

**CiteRev** 是一款面向学术写作的引用与参考文献一致性校对工具，帮助你在投稿 / 提交前快速发现文中引用与参考文献列表之间的不一致、APA 7 格式问题，并借助公开数据库核验文献真伪、分析文献分布。

- 官网：https://charlieliucc.github.io/citerev
- 仓库：https://github.com/charlieliucc/citerev
- 许可证：MIT（AI 辅助编写，免费使用）

---

## 功能一览

CiteRev 由网页版、macOS 菜单栏原生版、Windows Electron 轻量版三套形态组成，共享同一套检测规则引擎。

### 1. 全文检查（Full Check）
扫描整篇论文，识别文中引用与参考文献列表之间的对应关系，找出：
- 引用了但参考文献列表缺失的条目（引用缺失）
- 列在参考文献中但正文从未引用的条目（未被引用）
- 作者 / 年份不匹配的引用
- et al.、姓名格式、标题大小写等样式问题

### 2. 格式检查（Format Check）
针对 APA 7 格式逐项核对，包括：
- 姓名格式、标题大小写、斜体、字母顺序
- 页码范围连接号、DOI / URL 书写规范
- 缺失字段、标点与排版细节

### 3. 真伪检查 / 参考文献查验台（Verify，仅Web版）
将参考文献逐条与公开学术数据库 **Crossref**、**OpenAlex** 的来源记录比对，核验 DOI 是否存在、题名 / 作者 / 期刊 / 年份 / 卷期 / 页码是否一致。
- 支持 DOI 优先命中；无 DOI 时使用整条引用原文检索
- 可切换查验敏感度（中：DOI、标题、年份；高：全字段）
- 把"真假判断"拆成可复核的证据链，结果仅供研究与编辑复核

### 4. 分析分布（Distribution）
将文献分布可视化，输出图表：
- 正文引用频次（识别被反复依赖的文献）
- 参考文献年份分布（判断文献新颖度与年代跨度）
- 来源期刊分布 / 文献类型分布 / 正文引用覆盖 / 关键词分布

### 5. 一键分析（Report，仅Web版）
在单一页面内汇总上述检测结论，生成可直接查看与复核的报告。

### 6. 关于（About）
产品说明、隐私与安全声明、开源许可与相关链接。

---

## 各版本说明

### Web（独立仓库）
网页版源码已迁移到独立仓库 [`citerev-web`](https://github.com/charlieliucc/citerev-web)，可直接访问 [CiteRev Web](https://charlieliucc.github.io/citerev-web/)。它是纯前端 HTML / CSS / JS 应用。
- 全文与格式检测 **完全在浏览器本地完成**，文档不上传服务器。
- 真伪检查仅在用户明确操作后，向 Crossref / OpenAlex 公开 API 发送检索请求；输入文本仅在浏览器内解析。
- 支持导入 `.docx` Word 文档和带文本层的 `.pdf`（例如由 Word 导出的 PDF），或直接粘贴论文全文 / 参考文献列表。
- PDF 在浏览器内由本地打包的 PDF.js 解析并动态渲染原页面；检测结果仍以 HTML 批注卡片展示，点击卡片可跳转到原 PDF 页并高亮对应区域。
- PDF 导入会保留可识别的斜体/粗体、物理页码和跨页参考文献来源坐标。扫描件目前不执行 OCR。
- 通过严格的 Content-Security-Policy 约束脚本与连接来源，编辑器对粘贴内容做白名单标签清洗，避免恶意内容注入。

### macOS 菜单栏工具（`macOS/`，Swift 原生）
`word-citation-menubar` 的 Swift 原生重写版，**不再依赖 Python 与 Node**。
- 检测引擎通过系统自带的 **JavaScriptCore** 运行同一套 JS 规则，可打包为双击即用的独立 `.app`。
- 菜单栏 📚 图标：左键直接打开审查窗口，右键弹出菜单。
- 结果窗口停靠屏幕右侧、永远置顶；以卡片形式展示问题，点击卡片即在 Word 中定位并选中原文。
- 内置 3 个统计视图（文中引用次数 / 参考文献年份 / 期刊出现次数），支持在文档中循环跳转命中位置。
- 完全离线，无需联网。详见 [`macOS/README.md`](macOS/README.md)。

### Windows 轻量版（`electron/`，Electron Forge）
使用 Electron Forge 打包的 Windows 桌面应用（`引用审查轻量版`），便于无运行环境的 Windows 用户使用。构建命令：
```bash
cd electron
npm install
npm run make      # 打包为可分发的 Windows 应用
npm start         # 本地开发调试
```

---

## 目录结构

```
citerev/
├── macOS/               # Swift 原生菜单栏版（详见其 README）
├── electron/            # Windows Electron 轻量版
├── index.html           # CiteRev 产品首页
├── logo.png             # 产品首页图标
├── LICENSE
└── README.md
```

---

## 快速开始（Web 版）

1. 打开 [CiteRev Web](https://charlieliucc.github.io/citerev-web/)，或克隆独立的 [`citerev-web`](https://github.com/charlieliucc/citerev-web) 仓库后用任意静态服务器托管其根目录。
2. 在首页粘贴论文全文，或粘贴参考文献列表；也可点击「导入 Word / PDF」载入 `.docx` 或带文本层的 `.pdf`。
3. 点击顶部导航进入对应功能：
   - **全文检查** / **格式检查**：本地即时分析，结果直接展示。
   - **真伪检查**：点击「开始查验」，逐条比对 Crossref / OpenAlex（需联网）。
   - **分析分布** / **一键分析**：生成可视化报告。

本地预览：
```bash
git clone https://github.com/charlieliucc/citerev-web.git
cd citerev-web
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

PDF 支持使用随网页一同发布的 PDF.js 6.3.289，文件位于 `citerev-web/vendor/pdfjs/`，采用 Apache License 2.0。PDF 文件只在当前浏览器页面中处理；刷新页面后若要继续查看原 PDF 页面，需要重新导入文件。

---

## 隐私与安全

- 全文与格式检测在浏览器本地完成，文档不会被上传或保存。
- 真伪检查会明确提示，并在用户主动操作后向 Crossref / OpenAlex 发送文献检索信息；输入文本仅在浏览器内解析，不会保存在私有服务器或共享给第三方。
- 核验工具核对的是"输入文本与公开索引记录是否一致"，不对论文内容、期刊质量或学术诚信作最终裁决；灰色文献、新近发表、图书章节等合法来源可能显示为"需要复核"。

---

## 许可证

本项目基于 **MIT 许可证** 开源，可免费使用与修改。
