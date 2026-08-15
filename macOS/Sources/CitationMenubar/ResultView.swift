import SwiftUI
import AppKit

/// 结果窗口的 SwiftUI 主界面 —— 卡片形式（仿照 Word 加载项 taskpane 风格）。
/// 底部导航栏：首页 / 审查 / 统计 / 设置（关于信息位于设置内）。
/// 点击卡片即可在 Word 中定位并选中原文。
struct ResultView: View {
    @ObservedObject var model: ResultViewModel
    @State private var selectedSection: SectionID = .home
    @State private var selectedStatsTab = 0
    @State private var settingsPage: SettingsPage = .main

    enum SectionID: String, CaseIterable, Identifiable {
        case home = "首页"
        case review = "审查"
        case stats = "统计"
        case settings = "设置"
        var id: String { rawValue }

        var icon: String {
            switch self {
            case .home: return "house"
            case .review: return "doc.text.magnifyingglass"
            case .stats: return "chart.bar"
            case .settings: return "gearshape"
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            detailContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            bottomBar
        }
        .frame(minWidth: 440, idealWidth: 480, minHeight: 440)
        .background(Color(nsColor: NSColor(hex: 0xF3F4F6)))
        .onChange(of: model.hasCompletedDetection) { completed in
            if completed {
                selectedSection = .review
                model.navigationTitle = SectionID.review.rawValue
            }
        }
    }

    // MARK: - 设置子页面（二级入口）
    enum SettingsPage: Identifiable {
        case main
        case about
        var id: Int { hashValue }
    }

    // MARK: - 底部导航栏
    private var bottomBar: some View {
        HStack(spacing: 0) {
            ForEach(SectionID.allCases) { section in
                bottomItem(section)
            }
        }
        .frame(maxWidth: .infinity)
        .background(Color.white)
    }

    private func bottomItem(_ section: SectionID) -> some View {
        let isActive = selectedSection == section
        return Button {
            selectedSection = section
            model.navigationTitle = section.rawValue
        } label: {
            VStack(spacing: 3) {
                Image(systemName: section.icon)
                    .font(.system(size: 15))
                Text(section.rawValue)
                    .font(.system(size: 10, weight: isActive ? .semibold : .regular))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .foregroundColor(isActive ? Color(nsColor: NSColor(hex: 0x1677FF)) : Color(nsColor: .secondaryLabelColor))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - 内容区
    @ViewBuilder
    private var detailContent: some View {
        switch selectedSection {
        case .home:
            homeView
        case .review:
            reviewContent
        case .stats:
            statsView
        case .settings:
            settingsContainer
        }
    }

    // 设置容器：根据二级入口决定展示主设置页或关于页
    @ViewBuilder
    private var settingsContainer: some View {
        switch settingsPage {
        case .main:
            settingsView
        case .about:
            aboutView
        }
    }

    // MARK: - 首页（准备、预读取与开始检测入口）
    @ViewBuilder
    private var homeView: some View {
        VStack(spacing: 0) {
            pageHeader(icon: "house.fill", title: "首页", subtitle: "准备并启动 Word 文档的 APA 检测")
            Divider()
            VStack(spacing: 0) {
                if model.needsWord {
                    noWordView
                } else if model.isBusy {
                    busyView
                } else {
                    readyView
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - 设置（美化卡片式，关于为二级入口）
    private var settingsView: some View {
        VStack(spacing: 0) {
            pageHeader(icon: "gearshape.fill", title: "设置", subtitle: "个性化你的 APA 审查偏好")
            Divider()
            ScrollView {
                VStack(spacing: 16) {
                // 通用设置卡片
                settingsCard {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "bolt.fill")
                                .font(.system(size: 12))
                                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
                            Text("提前读取当前 Word 文档")
                                .font(.system(size: 12.5, weight: .semibold))
                            Spacer()
                            Toggle("", isOn: $model.preloadEnabled)
                                .labelsHidden()
                                .toggleStyle(SwitchToggleStyle(tint: Color(nsColor: NSColor(hex: 0x1677FF))))
                        }
                        Text("开启后，App 启动时只读取当前活动文档，不执行 APA 检测；点击“开始检测”后使用预读取内容。")
                            .font(.system(size: 10.5))
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                // 检查样式卡片
                settingsCard {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            Image(systemName: "checklist")
                                .font(.system(size: 12))
                                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
                            Text("检查样式")
                                .font(.system(size: 12.5, weight: .semibold))
                        }
                        Picker("当前规则", selection: $model.activeRuleProfileID) {
                            ForEach(model.availableRuleProfiles) { profile in
                                Text(profile.name).tag(profile.id)
                            }
                        }
                        .labelsHidden()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        HStack {
                            Button {
                                model.importRuleProfile()
                            } label: {
                                Label("导入规则", systemImage: "square.and.arrow.down")
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            Spacer()
                            Text("支持 APA 参数覆盖及独立体系 JSON")
                                .font(.system(size: 10.5))
                                .foregroundColor(.secondary)
                        }
                        if !model.ruleProfileMessage.isEmpty {
                            Text(model.ruleProfileMessage)
                                .font(.system(size: 10.5))
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                // 使用统计卡片
                settingsCard {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            Image(systemName: "sum")
                                .font(.system(size: 12))
                                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
                            Text("使用统计")
                                .font(.system(size: 12.5, weight: .semibold))
                        }
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("\(model.cumulativeProblems)")
                                .font(.system(size: 26, weight: .bold))
                                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
                            Text("个问题已被累计识别")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }
                        Text("统计自所有检测次数，持续记录本地，不会上传。")
                            .font(.system(size: 10.5))
                            .foregroundColor(.secondary)
                    }
                }

                // 关于（二级入口）
                settingsCard {
                    Button {
                        settingsPage = .about
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "info.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
                            Text("关于")
                                .font(.system(size: 12.5, weight: .medium))
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            }
        }
        .background(Color(nsColor: NSColor(hex: 0xF3F4F6)))
    }

    // 统一卡片样式
    private func settingsCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }

    // 统一的页面标题区（图标 + 副标题），与设置页保持一致
    private func pageHeader(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white)
    }

    // MARK: - 审查内容（顶栏 + 内容区）
    private var reviewContent: some View {
        VStack(spacing: 0) {
            reviewTopBar
            Divider()
            contentArea
        }
    }

    private var reviewTopBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 22))
                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
            VStack(alignment: .leading, spacing: 2) {
                Text("审查结果")
                    .font(.system(size: 18, weight: .bold))
                Text("文中引用与参考文献的一致性校验")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
            Spacer()

            Button {
                model.detect()
            } label: {
                Label("重新检测", systemImage: "arrow.clockwise")
            }
            .disabled(model.isBusy)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white)
    }

    // MARK: - 关于视图（参考加载项 taskpane.html 的「关于」视图）
    private var aboutView: some View {
        VStack(spacing: 0) {
            // 顶栏：返回二级入口（标题居中）
            ZStack {
                HStack(spacing: 4) {
                    Button {
                        settingsPage = .main
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 12, weight: .semibold))
                            Text("设置")
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
                    Spacer()
                }
                Text("关于")
                    .font(.system(size: 14, weight: .semibold))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.white)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // 顶部品牌卡片
                    VStack(spacing: 12) {
                        aboutLogo
                        VStack(alignment: .center, spacing: 3) {
                            Text("引用审查 Citation reviewer for Mac")
                                .font(.system(size: 15, weight: .semibold))
                            Text("macOS 菜单栏引用与参考文献一致性校对工具")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                            Text("v1.1-20260815 · Swift重构")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)

                    Group {
                        aboutSectionTitle("功能简介")
                        Text("自动扫描当前 Word 文档中的**文中引用**与**参考文献列表**，识别引用一致性、格式与结构问题并汇总，支持按分类筛选、在文中定位、按次数 / 年份 / 期刊等维度统计。目前**仅支持 APA 7th** 风格，后续将开放其他引用风格。")

                        aboutSectionTitle("主要检测的问题")
                        aboutList([
                            "文中引用的作者 / 年份与参考文献列表是否匹配、是否缺失或未被引用",
                            "et al. 使用是否恰当、是否足够作者以消除同作者同年份歧义",
                            "作者姓名格式（姓倒置、首字母句点）、& / and 的规范用法",
                            "年份括号、页码记号、DOI / URL 写法等 APA 7 格式细节",
                            "参考文献是否按字母顺序排列、是否存在重复条目",
                            "标题大小写（sentence case）与斜体等排版规范",
                        ])

                        aboutSectionTitle("隐私与安全")
                        Text("**完全离线使用**。所有检测均在本地 Word 文档内完成，**不会上传任何内容**，无需联网。**本工具不收集任何数据**，不会记录、保存或向任何服务器发送你的文档、引用或操作信息，不必担心数据外泄。")

                        aboutSectionTitle("获取更新")
                        Text("本工具的新版本与更新说明会发布在 GitHub 主页，前往查看或关注以获取最新功能与修复：")
                        aboutLink("GitHub: charlieliucc")

                        aboutSectionTitle("联系方式")
                        Text("欢迎反馈问题或建议：")
                        aboutLink("GitHub: charlieliucc")

                        aboutSectionTitle("创作声明")
                        Text("本工具使用 **AI 辅助编写**，输出结果均经过人工审查。本项目**开源且免费使用**，采用 **MIT 许可证**。禁止以任何方式转卖本工具或其衍生作品。")
                    }
                }
                .padding(16)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: NSColor(hex: 0xF3F4F6)))
    }

    /// 关于页面顶部的 logo（加载项的图标）
    private var aboutLogo: some View {
        Group {
            if let img = loadLogoImage() {
                Image(nsImage: img)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 40, height: 40)
            } else {
                Text("📚").font(.system(size: 32))
            }
        }
    }

    private func loadLogoImage() -> NSImage? {
        let url = AppResources.file(in: "icons", named: "icon-32.png")
        return NSImage(contentsOf: url)
    }

    private func aboutSectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(Color(nsColor: NSColor(hex: 0x1F2329)))
            .padding(.top, 4)
    }

    private func aboutList(_ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(items, id: \.self) { item in
                HStack(alignment: .top, spacing: 6) {
                    Text("•")
                        .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
                        .font(.system(size: 12, weight: .bold))
                    Text(renderMarkdownInline(item))
                        .font(.system(size: 12))
                        .foregroundColor(Color(nsColor: NSColor(hex: 0x646A73)))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(.leading, 2)
    }

    private func aboutLink(_ title: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "link")
                .font(.system(size: 11))
            Text(title)
                .font(.system(size: 12, weight: .medium))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Color(nsColor: NSColor(red: 0.09, green: 0.47, blue: 1.0, alpha: 0.08)))
        .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
        .cornerRadius(6)
        .onTapGesture {
            if let url = URL(string: "https://github.com/charlieliucc") {
                NSWorkspace.shared.open(url)
            }
        }
    }

    /// 把 **text** 标记的字符串渲染为 AttributedString（粗体部分加粗），保持向后兼容 SwiftUI
    private func renderMarkdownInline(_ s: String) -> AttributedString {
        var attributed = AttributedString("")
        var isBold = false
        var buf = ""
        var i = s.startIndex
        while i < s.endIndex {
            if s[i...].hasPrefix("**") {
                if !buf.isEmpty {
                    var seg = AttributedString(buf)
                    if isBold { seg.font = .system(size: 12, weight: .semibold) }
                    attributed += seg
                    buf = ""
                }
                isBold.toggle()
                i = s.index(i, offsetBy: 2)
            } else {
                buf.append(s[i])
                i = s.index(after: i)
            }
        }
        if !buf.isEmpty {
            var seg = AttributedString(buf)
            if isBold { seg.font = .system(size: 12, weight: .semibold) }
            attributed += seg
        }
        return attributed
    }

    // MARK: - 内容区（汇总条 + 卡片列表）
    private var contentArea: some View {
        VStack(spacing: 0) {
            if model.needsWord {
                noWordView
            } else if model.isBusy {
                busyView
            } else if !model.hasCompletedDetection {
                reviewNotReadyView
            } else if model.problems.isEmpty {
                emptyView
            } else {
                summaryBar
                cardList
            }
        }
        .frame(maxHeight: .infinity)
    }

    private var reviewNotReadyView: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "house")
                .font(.system(size: 32))
                .foregroundColor(.secondary)
            Text("尚未开始检测")
                .font(.system(size: 14, weight: .semibold))
            Text("请前往“首页”选择当前 Word 文档并开始检测。")
                .font(.system(size: 11.5))
                .foregroundColor(.secondary)
            Button("返回首页") { selectedSection = .home }
                .buttonStyle(.borderedProminent)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var readyView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 38))
                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
            Text("准备检查 Word 文档")
                .font(.system(size: 15, weight: .semibold))
            Text("当前文档：\(model.activeDocumentName)")
                .font(.system(size: 12))
                .foregroundColor(.secondary)

            Button {
                model.startDetection()
            } label: {
                Label("开始检测", systemImage: "play.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 120)
            }
            .buttonStyle(.borderedProminent)

            Text(model.preloadEnabled ? "点击后使用 \(model.activeRuleProfileName) 检测" : "点击后读取 Word 并使用 \(model.activeRuleProfileName) 检测")
                .font(.system(size: 10.5))
                .foregroundColor(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 未打开 Word 提示（带「开始检测」按钮）
    private var noWordView: some View {
        VStack(spacing: 14) {
            Spacer()
            Text("📄")
                .font(.system(size: 44))
            Text("请先打开 Word 文档")
                .font(.system(size: 15, weight: .semibold))
            Text("当前未检测到打开的 Word 文档。\n请先在 Microsoft Word 中打开要检查的文档，然后点击下方按钮开始检测。")
                .font(.system(size: 12.5))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 340)

            Button {
                model.openWordAndDetect()
            } label: {
                Text("开始检测")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(width: 120)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.isBusy)

            Button {
                model.startDetection()
            } label: {
                Text("已打开，重新检测")
                    .font(.system(size: 12))
            }
            .buttonStyle(.plain)
            .foregroundColor(.secondary)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 汇总条（分类筛选 + 统计，仿 .summary 与 .stat-chip）
    private var summaryBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], spacing: 8) {
                filterChip(title: "全部", key: "全部", count: model.problems.count)
                ForEach(Category.names.keys.sorted(), id: \.self) { key in
                    filterChip(title: Category.name(for: key), key: key, count: model.categoryCounts[key] ?? 0)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.white)
        .overlay(alignment: .bottom) {
            Divider()
        }
    }

    private func filterChip(title: String, key: String, count: Int) -> some View {
        let isActive = model.filter == key
        return Button {
            model.filter = key
        } label: {
            HStack(spacing: 5) {
                if key != "全部" {
                    Circle()
                        .fill(Color(nsColor: Category.color(for: key)))
                        .frame(width: 9, height: 9)
                }
                Text(title)
                    .font(.system(size: 12, weight: isActive ? .semibold : .regular))
                Text("\(count)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(isActive ? Color(nsColor: NSColor(hex: 0xF3F4F6)) : Color.clear)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color(nsColor: isActive ? NSColor(hex: 0xE5E6EB) : .clear), lineWidth: 1)
            )
            .cornerRadius(12)
            .foregroundColor(Color(nsColor: .labelColor))
        }
        .buttonStyle(.plain)
    }

    // MARK: - 卡片列表（仿 .cm-list 与 .cm-card）
    private var cardList: some View {
        ScrollView {
            if model.filteredProblems.isEmpty {
                categoryEmptyView
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(model.filteredProblems) { problem in
                        ProblemCard(
                            problem: problem,
                            onLocate: { model.locate(problem) },
                            onResolve: { model.markResolved(problem) },
                            onIgnore: { model.ignore(problem) }
                        )
                    }
                }
                .padding(14)
            }
        }
        .frame(maxHeight: .infinity)
    }

    /// 选中某分类后该分类下无问题时的提示（参考加载项 taskpane.js 第 696 行）
    private var categoryEmptyView: some View {
        VStack(spacing: 10) {
            Spacer()
            Text("✅")
                .font(.system(size: 36))
            Text("「\(model.filter)」分类下暂未发现问题")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(nsColor: NSColor(hex: 0x1F2329)))
            Text("该文档在此分类下无需要处理的问题，但仍需人工复核。")
                .font(.system(size: 11.5))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
            Spacer()
        }
        .frame(maxWidth: .infinity, minHeight: 220)
        .padding(.vertical, 30)
    }

    // MARK: - 加载 / 空状态
    private var busyView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 30))
                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
            Text(model.detectionStage)
                .font(.system(size: 13, weight: .semibold))
            ProgressView(value: model.detectionProgress, total: 1)
                .progressViewStyle(.linear)
                .frame(width: 280)
                .animation(.easeInOut(duration: 0.22), value: model.detectionProgress)
            Text("\(Int(model.detectionProgress * 100))%")
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.secondary)
            HStack(spacing: 5) {
                progressStageLabel("连接 Word", threshold: 0.05)
                Image(systemName: "chevron.right").font(.system(size: 8))
                progressStageLabel("读取文档", threshold: 0.15)
                Image(systemName: "chevron.right").font(.system(size: 8))
                progressStageLabel("APA 分析", threshold: 0.72)
                Image(systemName: "chevron.right").font(.system(size: 8))
                progressStageLabel("整理结果", threshold: 0.92)
            }
            .foregroundColor(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func progressStageLabel(_ title: String, threshold: Double) -> some View {
        HStack(spacing: 3) {
            Image(systemName: model.detectionProgress >= threshold ? "checkmark.circle.fill" : "circle")
                .foregroundColor(model.detectionProgress >= threshold
                                 ? Color(nsColor: NSColor(hex: 0x1677FF))
                                 : .secondary)
            Text(title)
        }
        .font(.system(size: 9.5))
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Spacer()
            Text("🎉")
                .font(.system(size: 40))
            Text("当前没有待处理的问题")
                .font(.system(size: 14, weight: .semibold))
            Text("未检测到问题，或所有问题均已标记为已解决 / 忽略。点击「重新检测」可再次扫描。")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 统计视图（仿 taskpane .stats-*，含 3 个统计维度）
    private var statsView: some View {
        VStack(spacing: 0) {
            pageHeader(icon: "chart.bar.fill", title: "文档统计", subtitle: "文中引用、年份与期刊的频次分布")

            HStack(spacing: 8) {
                statsTab("文中引用次数", id: 0)
                statsTab("参考文献年份", id: 1)
                statsTab("期刊出现次数", id: 2)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 10)

            statsBody
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func statsTab(_ title: String, id: Int) -> some View {
        let isActive = selectedStatsTab == id
        return Button {
            selectedStatsTab = id
        } label: {
            Text(title)
                .font(.system(size: 12.5, weight: isActive ? .semibold : .regular))
                .foregroundColor(isActive ? .white : Color(nsColor: .labelColor))
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(isActive ? Color(nsColor: NSColor(hex: 0x1677FF)) : Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(nsColor: isActive ? NSColor(hex: 0x1677FF) : NSColor(hex: 0xE5E6EB)), lineWidth: 1)
                )
                .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    private var statsRows: [DetectionResult.StatsData.Row] {
        guard let d = model.statsData else { return [] }
        switch selectedStatsTab {
        case 0: return d.citeCountRows ?? []
        case 1: return d.yearRows ?? []
        default: return d.journalRows ?? []
        }
    }

    private var statsBody: some View {
        ScrollView {
            if statsRows.isEmpty {
                VStack(spacing: 8) {
                    Spacer()
                    Text("暂无统计数据")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                LazyVStack(spacing: 8) {
                    ForEach(Array(statsRows.enumerated()), id: \.element.id) { idx, row in
                        statsRow(row: row, rank: idx + 1)
                    }
                }
                .padding(14)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func statsRow(row: DetectionResult.StatsData.Row, rank: Int) -> some View {
        let rowID = row.id
        let cur = model.statsNavIndex[rowID] ?? 0
        let navTotal = model.statsNavTotal[rowID] ?? max(row.count ?? 1, 1)
        let searchText = row.searchText ?? ""

        return HStack(spacing: 10) {
            Text("\(rank)")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 22, height: 22)
                .background(Color(nsColor: rankColor(rank)))
                .cornerRadius(6)

            Text(row.label ?? "")
                .font(.system(size: 12.5))
                .foregroundColor(Color(nsColor: NSColor(hex: 0x1F2329)))
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture {
                    model.navigateStatsByDirection(rowID: rowID, searchText: searchText, delta: +1)
                }

            // 命中位置提示 + 上一个/下一个
            if model.statsNavIndex[rowID] != nil && !searchText.isEmpty {
                Text("\(cur + 1)/\(navTotal)")
                    .font(.system(size: 10.5))
                    .foregroundColor(.secondary)
            }

            HStack(spacing: 2) {
                statsNavButton(systemImage: "chevron.left", tooltip: "上一个命中") {
                    model.navigateStatsByDirection(rowID: rowID, searchText: searchText, delta: -1)
                }
                statsNavButton(systemImage: "chevron.right", tooltip: "下一个命中") {
                    model.navigateStatsByDirection(rowID: rowID, searchText: searchText, delta: +1)
                }
            }

            Text("\(row.count ?? 0) \(selectedStatsTab == 1 ? "条" : "次")")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
                .padding(.horizontal, 9)
                .padding(.vertical, 2)
                .background(Color(nsColor: NSColor(red: 0.09, green: 0.47, blue: 1.0, alpha: 0.08)))
                .cornerRadius(999)
        }
        .padding(9)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(nsColor: NSColor(hex: 0xE5E6EB)), lineWidth: 1)
        )
        .cornerRadius(8)
        // 注意：不在这里加外层 onTapGesture，避免吞掉内部 ◀▶ 按钮的点击。
        // 整行点击定位改为在 label 文本上处理（见上方 Text 的 onTapGesture）。
    }

    private func statsNavButton(systemImage: String, tooltip: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 10, weight: .bold))
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundColor(Color(nsColor: NSColor(hex: 0x1677FF)))
        .background(Color(nsColor: NSColor(hex: 0xEDF4FF)))
        .cornerRadius(6)
        .help(tooltip)
        .contentShape(Rectangle())
    }

    private func rankColor(_ rank: Int) -> NSColor {
        switch rank {
        case 1: return NSColor(hex: 0xF5483B)
        case 2: return NSColor(hex: 0xFF8800)
        case 3: return NSColor(hex: 0xFAAD14)
        default: return NSColor(hex: 0x1677FF)
        }
    }

    // MARK: - 底部提示
    private var hintBar: some View {
        EmptyView()
    }
}

// MARK: - 单张问题卡片（仿 taskpane .cm-card）
private struct ProblemCard: View {
    let problem: Problem
    let onLocate: () -> Void
    let onResolve: () -> Void
    let onIgnore: () -> Void

    @State private var isHovering = false

    private var key: String { problem.color ?? "format" }
    private var accent: NSColor { Category.color(for: key) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onLocate) {
                VStack(alignment: .leading, spacing: 8) {
                // 头部：分类标签
                HStack(spacing: 6) {
                    Text(Category.name(for: key))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color(nsColor: accent))
                        .cornerRadius(4)

                    if let tag = problem.tag, !tag.isEmpty {
                        Text(tag)
                            .font(.system(size: 11))
                            .foregroundColor(Color(nsColor: accent))
                            .lineLimit(1)
                    }

                    Spacer()

                    Image(systemName: "arrow.up.right.square")
                        .font(.system(size: 12))
                        .foregroundColor(Color(nsColor: accent))
                        .opacity(0.75)
                }

                // 原文引用区（仿 .cm-quote）
                if !problem.displayQuote.isEmpty {
                    Text(problem.displayQuote)
                        .font(.system(size: 12.5))
                        .foregroundColor(Color(nsColor: NSColor(hex: 0x1F2329)))
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(9)
                        .background(Color(nsColor: NSColor(hex: 0xF7F8FA)))
                        .overlay(alignment: .leading) {
                            Rectangle()
                                .fill(Color(nsColor: NSColor(hex: 0xE5E6EB)))
                                .frame(width: 2)
                        }
                        .cornerRadius(4)
                }

                // 说明（仿 .cm-desc）
                if !problem.displayDesc.isEmpty {
                    Text(problem.displayDesc)
                        .font(.system(size: 12))
                        .foregroundColor(Color(nsColor: NSColor(hex: 0x646A73)))
                        .lineLimit(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                }
                }
                .padding(12)
            }
            .buttonStyle(.plain)

            Divider()
                .padding(.leading, 12)

            HStack(spacing: 8) {
                Spacer()
                cardActionButton("忽略", systemImage: "eye.slash", color: .secondary, action: onIgnore)
                cardActionButton("已解决", systemImage: "checkmark.circle", color: Color(nsColor: NSColor(hex: 0x16A34A)), action: onResolve)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
        }
        .background(Color.white)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color(nsColor: accent))
                .frame(width: 3)
        }
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(nsColor: isHovering ? NSColor(hex: 0xC0C4CC) : NSColor(hex: 0xE5E6EB)), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(isHovering ? 0.10 : 0), radius: isHovering ? 8 : 0, x: 0, y: isHovering ? 3 : 0)
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.12)) {
                isHovering = hovering
            }
        }
    }

    private func cardActionButton(
        _ title: String,
        systemImage: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(color)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
