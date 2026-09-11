import Foundation
import Combine
import JavaScriptCore
import AppKit
import UniformTypeIdentifiers

/// 仅保存在进程内的真伪检查输入；不会写入磁盘或 UserDefaults。
struct VerificationInputSnapshot: Equatable {
    let text: String
    let documentName: String
    let revision: Int
}

/// 结果窗口的状态与业务逻辑。
final class ResultViewModel: ObservableObject {
    @Published var problems: [Problem] = []
    @Published var stats: DetectionResult.Stats?
    @Published var statsData: DetectionResult.StatsData?
    @Published var statusMessage = "就绪"
    @Published var navigationTitle = "首页"
    @Published var detectionStage = "等待开始"
    @Published var detectionProgress: Double = 0
    @Published var filter = "全部"
    @Published var isBusy = false
    @Published var isPreloading = false
    @Published var preloadProgress: Double = 0
    @Published var preloadStage = ""
    @Published var activeDocumentName = "尚未读取 Word 文档"
    @Published var hasCompletedDetection = false
    @Published private(set) var verificationInputSnapshot: VerificationInputSnapshot?
    @Published var isPreparingVerification = false
    @Published var verificationPreparationMessage = "尚未读取可供真伪检查的 Word 内容"
    @Published var availableRuleProfiles: [RuleProfileSummary] = []
    @Published var ruleProfileMessage = ""
    @Published var activeRuleProfileID: String {
        didSet {
            UserDefaults.standard.set(activeRuleProfileID, forKey: RuleProfileStore.activePreferenceKey)
            engineLock.lock()
            engineContext = nil
            engineLock.unlock()
        }
    }
    @Published var preloadEnabled: Bool {
        didSet {
            UserDefaults.standard.set(preloadEnabled, forKey: Self.preloadPreferenceKey)
            if preloadEnabled {
                preloadActiveDocumentIfEnabled()
            } else {
                let shouldContinueDetection = detectionRequestedDuringPreload
                detectionRequestedDuringPreload = false
                cachedParagraphs = nil
                cachedDocument = nil
                isPreloading = false
                preloadProgress = 0
                preloadStage = "提前读取已关闭"
                if shouldContinueDetection {
                    isBusy = false
                    DispatchQueue.main.async { [weak self] in self?.detect() }
                }
            }
        }
    }
    /// 是否因为未打开 Word 文档而处于「请打开 Word」提示状态
    @Published var needsWord = false

    private var engineContext: JSContext?
    private let engineLock = NSLock()
    /// 正在定位中的统计行（防止并发定位导致状态混乱）
    private var navigatingRows: Set<String> = []
    private var cachedParagraphs: [WordParagraph]?
    private var cachedDocument: WordController.DocumentIdentity?
    private var detectionRequestedDuringPreload = false
    private var verificationRevision = 0
    private static let preloadPreferenceKey = "preloadActiveWordDocument"
    private static let cumulativeProblemsKey = "cumulativeProblemsIdentified"

    /// 累计已识别的问题总数（跨多次检测，持久化保存）
    @Published var cumulativeProblems: Int = UserDefaults.standard.integer(forKey: cumulativeProblemsKey)

    /// 清零累计已识别的问题总数（同时清除本地持久化记录）
    func resetCumulativeProblems() {
        cumulativeProblems = 0
        UserDefaults.standard.removeObject(forKey: Self.cumulativeProblemsKey)
    }

    init() {
        let profiles = RuleProfileStore.availableProfiles()
        availableRuleProfiles = profiles
        let savedProfile = UserDefaults.standard.string(forKey: RuleProfileStore.activePreferenceKey) ?? "apa7"
        activeRuleProfileID = profiles.contains(where: { $0.id == savedProfile }) ? savedProfile : "apa7"
        if UserDefaults.standard.object(forKey: Self.preloadPreferenceKey) == nil {
            preloadEnabled = true
        } else {
            preloadEnabled = UserDefaults.standard.bool(forKey: Self.preloadPreferenceKey)
        }
    }

    var activeRuleProfileName: String {
        availableRuleProfiles.first(where: { $0.id == activeRuleProfileID })?.name ?? "APA 7th"
    }

    func importRuleProfile() {
        let panel = NSOpenPanel()
        panel.title = "导入 JSON 引用审查规则"
        panel.prompt = "导入"
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.json]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let profile = try RuleProfileStore.importProfile(from: url)
            availableRuleProfiles = RuleProfileStore.availableProfiles()
            activeRuleProfileID = profile.id
            ruleProfileMessage = "已导入并启用：\(profile.name)"
        } catch {
            ruleProfileMessage = "导入失败：\(error.localizedDescription)"
            showErrorAlert(error.localizedDescription)
        }
    }

    func preloadActiveDocumentIfEnabled() {
        guard preloadEnabled, !isPreloading, !isBusy else { return }
        isPreloading = true
        preloadProgress = 0.05
        preloadStage = "正在确认当前 Word 文档"

        DispatchQueue.global(qos: .utility).async { [weak self] in
            do {
                let identityBefore = try WordController.activeDocumentIdentity()
                let paragraphs = try WordController.readParagraphs { [weak self] value in
                    DispatchQueue.main.async {
                        self?.preloadProgress = 0.10 + value * 0.85
                        self?.preloadStage = "正在提前读取 \(identityBefore.name)（\(Int(value * 100))%）"
                        if self?.detectionRequestedDuringPreload == true {
                            self?.detectionProgress = 0.15 + value * 0.50
                            self?.detectionStage = "正在读取 \(identityBefore.name)（\(Int(value * 100))%）"
                            self?.statusMessage = self?.detectionStage ?? "正在读取 Word 文档"
                        }
                    }
                }
                let identityAfter = try WordController.activeDocumentIdentity()
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.isPreloading = false
                    guard self.preloadEnabled else { return }
                    if identityBefore == identityAfter {
                        self.cachedParagraphs = paragraphs
                        self.cachedDocument = identityAfter
                        self.storeVerificationSnapshot(paragraphs: paragraphs, documentName: identityAfter.name)
                        self.activeDocumentName = identityAfter.name
                        self.preloadProgress = 1
                        self.preloadStage = "已提前读取 \(paragraphs.count) 个段落"
                    } else {
                        self.cachedParagraphs = nil
                        self.cachedDocument = nil
                        self.preloadProgress = 0
                        self.preloadStage = "读取期间活动文档已切换"
                        self.activeDocumentName = identityAfter.name
                    }
                    if self.detectionRequestedDuringPreload {
                        self.detectionRequestedDuringPreload = false
                        self.isBusy = false
                        self.detect()
                    }
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.isPreloading = false
                    self.preloadProgress = 0
                    self.preloadStage = "未能提前读取 Word 文档"
                    if self.isPreparingVerification {
                        self.isPreparingVerification = false
                        self.verificationPreparationMessage = "读取失败：\(error.localizedDescription)"
                    }
                    if self.detectionRequestedDuringPreload {
                        self.detectionRequestedDuringPreload = false
                        self.isBusy = false
                        self.detect()
                    }
                }
            }
        }
    }

    var filteredProblems: [Problem] {
        if filter == "全部" {
            return problems
        }
        // filter 存的是分类的颜色键（如 "format"/"mismatch"），直接与 problem.color 比较
        return problems.filter { ($0.color ?? "format") == filter }
    }

    var statText: String {
        let counts = Dictionary(grouping: problems, by: { $0.color ?? "format" }).mapValues(\.count)
        let m = counts["missing"] ?? 0
        let u = counts["unused"] ?? 0
        let mm = counts["mismatch"] ?? 0
        let st = counts["style"] ?? 0
        let f = counts["format"] ?? 0
        return "缺失 \(m) · 未引用 \(u) · 不匹配 \(mm) · 样式 \(st) · 格式 \(f)"
    }

    /// 各分类（按 color）的问题数量
    var categoryCounts: [String: Int] {
        Dictionary(grouping: problems, by: { $0.color ?? "format" }).mapValues(\.count)
    }

    func markResolved(_ problem: Problem) {
        dismiss(problem, message: "已标记为已解决")
    }

    func ignore(_ problem: Problem) {
        dismiss(problem, message: "已忽略该问题")
    }

    private func dismiss(_ problem: Problem, message: String) {
        guard let index = problems.firstIndex(where: { $0.id == problem.id }) else { return }
        problems.remove(at: index)
        statusMessage = message
    }

    /// 触发检测（后台线程执行，避免卡 UI）
    func detect() {
        guard !isBusy else { return }
        if isPreloading {
            detectionRequestedDuringPreload = true
            isBusy = true
            hasCompletedDetection = false
            detectionProgress = 0.15
            detectionStage = "正在读取当前 Word 文档"
            statusMessage = detectionStage
            return
        }
        isBusy = true
        hasCompletedDetection = false
        detectionProgress = cachedParagraphs == nil ? 0.05 : 0.65
        detectionStage = cachedParagraphs == nil ? "正在连接 Microsoft Word" : "正在使用提前读取的文档"
        statusMessage = detectionStage

        let preload = cachedParagraphs
        let preloadDocument = cachedDocument
        // 预读取快照只消费一次；“重新检测”必须重新读取，以包含用户后续编辑。
        cachedParagraphs = nil
        cachedDocument = nil
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runDetection(preloadedParagraphs: preload, preloadedDocument: preloadDocument)
        }
    }

    private func runDetection(preloadedParagraphs: [WordParagraph]?, preloadedDocument: WordController.DocumentIdentity?) {
        do {
            let activeDocument = try WordController.activeDocumentIdentity()
            let paragraphs: [WordParagraph]
            if let preloadedParagraphs, preloadedDocument == activeDocument {
                paragraphs = preloadedParagraphs
                updateDetectionProgress(0.65, stage: "使用已提前读取的 \(activeDocument.name)")
            } else {
                updateDetectionProgress(0.15, stage: "正在读取 \(activeDocument.name) 的文字与格式")
                paragraphs = try WordController.readParagraphs { [weak self] wordProgress in
                    let overallProgress = 0.15 + wordProgress * 0.50
                    self?.updateDetectionProgress(
                        overallProgress,
                        stage: "正在读取 \(activeDocument.name)（\(Int(wordProgress * 100))%）"
                    )
                }
            }
            publishVerificationSnapshot(paragraphs: paragraphs, documentName: activeDocument.name)
            DispatchQueue.main.async { [weak self] in self?.activeDocumentName = activeDocument.name }
            updateDetectionProgress(0.65, stage: "已读取 \(paragraphs.count) 个段落")
            updateDetectionProgress(0.72, stage: "正在执行 APA 7 引用分析")
            let result = try self.performDetection(paragraphs: paragraphs)
            updateDetectionProgress(0.92, stage: "正在整理问题与统计结果")

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.problems = result.comments ?? []
                self.stats = result.stats
                self.statsData = result.statsData
                self.needsWord = false
                self.isBusy = false
                self.hasCompletedDetection = true
                // 累计已识别的问题总数（持久化）
                if !self.problems.isEmpty {
                    self.cumulativeProblems += self.problems.count
                    UserDefaults.standard.set(self.cumulativeProblems, forKey: Self.cumulativeProblemsKey)
                }
                // 文档/检测结果已变更，清除定位序号与总数缓存
                self.statsNavIndex = [:]
                self.statsNavTotal = [:]
                self.detectionProgress = 1
                self.detectionStage = "检测完成"
                self.statusMessage = "检测完成，共 \(self.problems.count) 处问题"
                if self.problems.isEmpty {
                    self.showInfoAlert("未发现常见的引用一致性问题。")
                }
            }
        } catch let error as WordController.WordError {
            // 未打开 Word / 没有文档 → 展示「请打开 Word」提示（带开始检测按钮）
            switch error {
            case .noActiveDocument, .noParagraphs:
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.isBusy = false
                    self.needsWord = true
                    self.finishPendingVerificationRead(error: "请先打开 Word 文档")
                    self.detectionProgress = 0
                    self.detectionStage = "等待打开 Word 文档"
                    self.statusMessage = "请先打开 Word 文档"
                }
            default:
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.isBusy = false
                    self.finishPendingVerificationRead(error: error.localizedDescription)
                    self.detectionProgress = 0
                    self.detectionStage = "检测失败"
                    self.statusMessage = "检测失败"
                    self.showErrorAlert(error.localizedDescription)
                }
            }
        } catch {
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.isBusy = false
                self.finishPendingVerificationRead(error: error.localizedDescription)
                self.detectionProgress = 0
                self.detectionStage = "检测失败"
                self.statusMessage = "检测失败"
                self.showErrorAlert(error.localizedDescription)
            }
        }
    }

    /// 用户在“真伪”页主动要求读取当前 Word。读取成功后只保存在内存中，
    /// 不启动 WKWebView，也不会触发 Crossref/OpenAlex 请求。
    func prepareVerificationFromActiveWord() {
        guard !isPreparingVerification else { return }
        isPreparingVerification = true
        if isPreloading {
            verificationPreparationMessage = "正在复用启动时的 Word 读取…"
            return
        }
        if isBusy {
            verificationPreparationMessage = "正在复用当前检测读取的 Word 内容…"
            return
        }
        verificationPreparationMessage = "正在读取当前 Word 文档…"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let identity = try WordController.activeDocumentIdentity()
                // 真伪检查只需要文本；跳过格式读取可显著减少 Word Apple event。
                let paragraphs = try WordController.readParagraphs(includeFormatting: false)
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.storeVerificationSnapshot(paragraphs: paragraphs, documentName: identity.name)
                    self.activeDocumentName = identity.name
                    self.isPreparingVerification = false
                }
            } catch {
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.isPreparingVerification = false
                    self.verificationPreparationMessage = "读取失败：\(error.localizedDescription)"
                }
            }
        }
    }

    private func publishVerificationSnapshot(paragraphs: [WordParagraph], documentName: String) {
        DispatchQueue.main.async { [weak self] in
            self?.storeVerificationSnapshot(paragraphs: paragraphs, documentName: documentName)
        }
    }

    private func storeVerificationSnapshot(paragraphs: [WordParagraph], documentName: String) {
        let text = paragraphs.map(\.text).joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        verificationRevision += 1
        verificationInputSnapshot = VerificationInputSnapshot(
            text: text,
            documentName: documentName,
            revision: verificationRevision
        )
        isPreparingVerification = false
        verificationPreparationMessage = "已在内存中准备 \(documentName)（\(paragraphs.count) 个段落）"
    }

    private func finishPendingVerificationRead(error: String) {
        guard isPreparingVerification else { return }
        isPreparingVerification = false
        verificationPreparationMessage = "读取失败：\(error)"
    }

    private func updateDetectionProgress(_ value: Double, stage: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.detectionProgress = value
            self.detectionStage = stage
            self.statusMessage = stage
        }
    }

    /// 统计条目当前的命中序号（key: 行 id → 第 N 处，从 0 开始）
    @Published var statsNavIndex: [String: Int] = [:]
    /// 统计条目的总命中数缓存（key: 行 id → 总数）。首次定位时一次性扫描得到，
    /// 之后「上一个/下一个」走 locate-only 快速路径，避免每次都全量遍历。
    @Published var statsNavTotal: [String: Int] = [:]

    /// 用户点击「开始检测」或「打开 Word 并检测」。
    func startDetection() {
        needsWord = false
        detect()
    }

    /// 统计条目跳转：跳到第 nth 处（nth 从 0 开始，取模循环）。
    /// - Parameters:
    ///   - rowID: 统计行的唯一标识
    ///   - searchText: 用于在 Word 中查找的文本
    ///   - nth: 目标命中序号（0-based）
    func navigateStatsRow(rowID: String, searchText: String, to nth: Int) {
        guard !searchText.isEmpty else {
            statusMessage = "该条目缺少定位信息"
            return
        }
        // 防止并发定位：同一行正在定位中时忽略新请求
        if navigatingRows.contains(rowID) { return }
        navigatingRows.insert(rowID)
        statusMessage = "正在定位…"

        if let cachedTotal = statsNavTotal[rowID] {
            // 快速路径：总数已缓存，仅定位第 nth 处（不重新扫描全部命中）
            let wrapped = ((nth % cachedTotal) + cachedTotal) % cachedTotal
            let target = wrapped + 1
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                let (ok, found, detail) = WordController.locateNthOnly(search: searchText, nth: target)
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.navigatingRows.remove(rowID)
                    if ok {
                        self.statsNavIndex[rowID] = wrapped
                        self.statusMessage = "已定位（第 \(wrapped + 1)/\(cachedTotal) 处）"
                        WordController.activateWord()
                    } else if found > 0 {
                        // 缓存过期（文档命中数减少）：清除缓存并回退到完整计数重试
                        self.statsNavTotal.removeValue(forKey: rowID)
                        self.navigateStatsRow(rowID: rowID, searchText: searchText, to: nth)
                    } else {
                        self.statusMessage = "定位失败：\(detail)"
                    }
                }
            }
        } else {
            // 首次：完整计数 + 定位（一次性扫描，之后该行即走快速路径）
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                let (ok, total, detail) = WordController.locateNth(search: searchText, nth: nth + 1)
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.navigatingRows.remove(rowID)
                    if ok, total > 0 {
                        self.statsNavTotal[rowID] = total
                        let wrapped = ((nth % total) + total) % total
                        self.statsNavIndex[rowID] = wrapped
                        self.statusMessage = "已定位（第 \(wrapped + 1)/\(total) 处）"
                        WordController.activateWord()
                    } else {
                        // 失败时显示详细原因，便于诊断
                        self.statusMessage = "定位失败：\(detail)"
                    }
                }
            }
        }
    }

    /// 按方向跳转（上一个 / 下一个），内部基于最新状态计算目标序号。
    /// - Parameters:
    ///   - rowID: 统计行的唯一标识
    ///   - searchText: 用于在 Word 中查找的文本
    ///   - delta: +1 表示下一个，-1 表示上一个
    func navigateStatsByDirection(rowID: String, searchText: String, delta: Int) {
        guard !searchText.isEmpty else {
            statusMessage = "该条目缺少定位信息"
            return
        }
        if navigatingRows.contains(rowID) { return }
        navigatingRows.insert(rowID)
        let isForward = delta >= 0
        statusMessage = isForward ? "正在查找下一个…" : "正在查找上一个…"

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = WordController.findStatsMatch(search: searchText, forward: isForward)
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.navigatingRows.remove(rowID)
                if result.ok {
                    // 单次原生查找不预扫描全文，因此不会显示不可靠的“第 N/总数”状态。
                    self.statsNavIndex.removeValue(forKey: rowID)
                    self.statsNavTotal.removeValue(forKey: rowID)
                    self.statusMessage = isForward ? "已定位到下一个" : "已定位到上一个"
                    WordController.activateWord()
                } else {
                    self.statusMessage = "定位失败：\(result.detail)"
                }
            }
        }
    }

    /// 激活 Word 后重新检测（适用于用户刚打开文档的情况）。
    func openWordAndDetect() {
        needsWord = false
        WordController.activateWord()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.detect()
        }
    }

    private func performDetection(paragraphs: [WordParagraph]) throws -> DetectionResult {
        engineLock.lock()
        defer { engineLock.unlock() }

        let ctx: JSContext
        if let c = engineContext {
            ctx = c
        } else {
            ctx = try DetectionEngine.makeContext(activeProfileID: activeRuleProfileID)
            engineContext = ctx
        }
        let dicts = paragraphs.map { $0.toDict() }
        let run = try DetectionEngine.run(context: ctx, paragraphs: dicts)
        return run.result
    }

    /// 定位并选中某条问题的原文。
    func locate(_ problem: Problem) {
        let candidates = problem.locateCandidates
        guard !candidates.isEmpty else { return }
        statusMessage = "正在定位…"

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let ok = WordController.locate(candidates: candidates)
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                if ok {
                    self.statusMessage = "已定位到原文"
                    WordController.activateWord()
                } else {
                    self.statusMessage = "未在文档中找到该文本"
                }
            }
        }
    }

    private func showInfoAlert(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "CiteRev"
        alert.informativeText = message
        alert.alertStyle = .informational
        alert.runModal()
    }

    private func showErrorAlert(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "CiteRev"
        alert.informativeText = "检测失败：\n\(message)"
        alert.alertStyle = .critical
        alert.runModal()
    }
}
