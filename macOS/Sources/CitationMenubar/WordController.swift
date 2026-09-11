import Foundation
import Darwin

/// 通过 AppleScript（osascript）与 Microsoft Word 交互。
/// 复用原有的 export-word.applescript 与 locate.applescript。
enum WordController {

    /// Word 的 AppleScript 接口不适合并发访问。预读取、正式检测和真伪读取
    /// 共用这一把锁，避免多个 osascript 同时让 Word 长时间无响应。
    private static let automationSemaphore = DispatchSemaphore(value: 1)
    private static let processLock = NSLock()
    private static var activeProcesses: [Int32: Process] = [:]
    private static var isShuttingDown = false

    struct DocumentIdentity: Equatable {
        let name: String
        let path: String
        var key: String { path.isEmpty ? "unsaved:\(name)" : "path:\(path)" }
    }

    /// `osascript` 的 stdout 必须在进程运行期间持续排空。大文档的导出结果会超过
    /// 系统 pipe 缓冲区；若等进程退出后才读取，父子进程会互相等待直至超时。
    private final class ProcessOutputBuffer {
        var data = Data()
        var errorData = Data()
    }

    enum WordError: Error, LocalizedError {
        case missingScript
        case readFailed(String)
        case noParagraphs
        case locateFailed
        /// 未打开 Word 或没有活动文档（用于提示用户打开文档）
        case noActiveDocument(String)

        var errorDescription: String? {
            switch self {
            case .missingScript:
                return "找不到 AppleScript 脚本"
            case .readFailed(let msg):
                return "读取 Word 失败：\(msg)"
            case .noParagraphs:
                return "Word 中没有任何段落，或未打开文档。"
            case .locateFailed:
                return "未在文档中找到该文本"
            case .noActiveDocument:
                return "未检测到打开的 Word 文档"
            }
        }
    }

    /// 执行 osascript，返回 (exitCode, stdout)
    @discardableResult
    private static func runScript(
        _ script: URL,
        arguments: [String] = [],
        timeout: TimeInterval = 180,
        progress: ((Double) -> Void)? = nil
    ) -> (Int32, String) {
        automationSemaphore.wait()
        defer { automationSemaphore.signal() }

        processLock.lock()
        let shouldAbort = isShuttingDown
        processLock.unlock()
        if shouldAbort { return (1, "CANCELLED") }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        var args = [script.path]
        args.append(contentsOf: arguments)
        process.arguments = args

        let pipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = pipe
        process.standardError = errorPipe

        let semaphore = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in semaphore.signal() }

        do {
            try process.run()
        } catch {
            return (-1, "无法启动 osascript: \(error.localizedDescription)")
        }

        processLock.lock()
        if isShuttingDown {
            processLock.unlock()
            process.terminate()
            process.waitUntilExit()
            return (1, "CANCELLED")
        }
        activeProcesses[process.processIdentifier] = process
        processLock.unlock()
        defer {
            processLock.lock()
            activeProcesses.removeValue(forKey: process.processIdentifier)
            processLock.unlock()
        }

        // 立即在独立队列读取输出，避免大文档填满 pipe 后让 osascript 阻塞。
        let output = ProcessOutputBuffer()
        let outputGroup = DispatchGroup()
        outputGroup.enter()
        DispatchQueue.global(qos: .utility).async {
            output.data = pipe.fileHandleForReading.readDataToEndOfFile()
            outputGroup.leave()
        }
        outputGroup.enter()
        DispatchQueue.global(qos: .utility).async {
            var pending = ""
            while true {
                let data = errorPipe.fileHandleForReading.availableData
                if data.isEmpty { break }
                output.errorData.append(data)
                guard progress != nil, let chunk = String(data: data, encoding: .utf8) else { continue }
                pending += chunk
                while let newline = pending.firstIndex(of: "\n") {
                    let line = String(pending[..<newline])
                    pending.removeSubrange(...newline)
                    if let value = parseScriptProgress(line) { progress?(value) }
                }
            }
            if let value = parseScriptProgress(pending) { progress?(value) }
            outputGroup.leave()
        }

        // 等待并限制超时
        let waitResult = semaphore.wait(timeout: .now() + timeout)
        if waitResult == .timedOut {
            process.terminate()
            process.waitUntilExit()
            outputGroup.wait()
            return (1, "TIMEOUT")
        }
        if process.isRunning { process.waitUntilExit() }
        outputGroup.wait()

        var out = String(data: output.data, encoding: .utf8) ?? ""
        let errorText = String(data: output.errorData, encoding: .utf8) ?? ""
        if process.terminationStatus != 0 && !errorText.isEmpty {
            if !out.isEmpty && !out.hasSuffix("\n") { out += "\n" }
            out += errorText
        }
        return (process.terminationStatus, out)
    }

    /// 应用退出时停止所有由本应用启动的 Word 自动化进程。先发 SIGTERM，
    /// 短暂等待清理；仍未结束时只强制终止已登记的 osascript 子进程。
    static func cancelAllScriptsForShutdown() {
        processLock.lock()
        isShuttingDown = true
        let processes = Array(activeProcesses.values)
        processLock.unlock()

        for process in processes where process.isRunning {
            process.terminate()
        }
        let deadline = Date().addingTimeInterval(1.0)
        while Date() < deadline, processes.contains(where: { $0.isRunning }) {
            Thread.sleep(forTimeInterval: 0.02)
        }
        for process in processes where process.isRunning {
            kill(process.processIdentifier, SIGKILL)
        }
    }

    /// 解析 osascript 的 `log "PROGRESS:current:total"` stderr 输出。
    /// 实际行通常形如 `(*PROGRESS:12:40*)`。
    private static func parseScriptProgress(_ line: String) -> Double? {
        guard let marker = line.range(of: "PROGRESS:") else { return nil }
        let payload = line[marker.upperBound...]
        let parts = payload.split(separator: ":", maxSplits: 1)
        guard parts.count == 2,
              let current = Int(parts[0].prefix { $0.isNumber }),
              let total = Int(parts[1].prefix { $0.isNumber }), total > 0 else { return nil }
        return min(max(Double(current) / Double(total), 0), 1)
    }

    /// 读取当前 Word 文档的全部段落（文本 + 整段是否斜体）。
    static func readParagraphs(
        includeFormatting: Bool = true,
        progress: ((Double) -> Void)? = nil
    ) throws -> [WordParagraph] {
        let script = AppResources.file(named: "export-word.applescript")
        guard FileManager.default.fileExists(atPath: script.path) else {
            throw WordError.missingScript
        }
        let arguments = includeFormatting ? [] : ["text-only"]
        let (code, rawOut) = runScript(script, arguments: arguments, progress: progress)
        let out = rawOut.trimmingCharacters(in: .whitespacesAndNewlines)
        if code != 0 {
            // 判断是否因「未打开文档 / 无活动文档」导致
            if isNoDocumentError(out) {
                throw WordError.noActiveDocument(out)
            }
            throw WordError.readFailed(out)
        }
        if out.hasPrefix("ERROR:") {
            let msg = String(out.dropFirst("ERROR:".count))
            if isNoDocumentError(msg) {
                throw WordError.noActiveDocument(msg)
            }
            throw WordError.readFailed(msg)
        }
        if out.isEmpty {
            throw WordError.noParagraphs
        }

        var paragraphs: [WordParagraph] = []
        for rawLine in out.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = String(rawLine)
            // 去掉可能的 \r 结尾
            while line.hasSuffix("\r") { line.removeLast() }
            if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            let parts = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
            let text = parts.count > 0 ? parts[0] : ""
            let italicFlag = parts.count > 1 ? parts[1] : "false"
            let entireItalic = italicFlag.trimmingCharacters(in: .whitespaces).lowercased() == "true"
            var p = WordParagraph(text: text, entireItalic: entireItalic)
            if entireItalic {
                p.italicRanges = [[0, text.count]]
            }
            paragraphs.append(p)
        }
        if paragraphs.isEmpty {
            throw WordError.noParagraphs
        }
        return paragraphs
    }

    /// 返回用户当前正在操作的 Word 活动文档；多窗口时由 Word 的 active document 决定。
    static func activeDocumentIdentity() throws -> DocumentIdentity {
        let script = AppResources.file(named: "active-document.applescript")
        guard FileManager.default.fileExists(atPath: script.path) else { throw WordError.missingScript }
        let (code, rawOut) = runScript(script, timeout: 15)
        let out = rawOut.trimmingCharacters(in: .whitespacesAndNewlines)
        if code != 0 { throw WordError.readFailed(out) }
        if out == "NODOC" { throw WordError.noActiveDocument(out) }
        if out.hasPrefix("ERROR:") { throw WordError.readFailed(String(out.dropFirst(6))) }
        let parts = out.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
        guard parts.count >= 2, parts[0] == "OK" else { throw WordError.readFailed(out) }
        return DocumentIdentity(name: parts[1], path: parts.count > 2 ? parts[2] : "")
    }

    /// 粗略判断 AppleScript 报错是否因「没有打开的文档 / 无活动文档」导致。
    private static func isNoDocumentError(_ msg: String) -> Bool {
        let s = msg.lowercased()
        let markers = [
            "can't get active document",
            "can’t get active document",
            "has no document",
            "no open documents",
            "document is not open",
            "there is no document",
            "active document",
            "has no active",
        ]
        return markers.contains { s.contains($0) }
    }

    /// 在 Word 中定位并选中指定文本。逐条尝试候选文本。
    static func locate(candidates: [String]) -> Bool {
        let script = AppResources.file(named: "locate.applescript")
        guard FileManager.default.fileExists(atPath: script.path) else { return false }
        for s in candidates {
            let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            let search = String(trimmed.prefix(120))
            let (code, out) = runScript(script, arguments: [search], timeout: 30)
            let result = out.trimmingCharacters(in: .whitespacesAndNewlines)
            if code == 0 {
                if result == "OK" { return true }
                if result.hasPrefix("ERROR:") { continue }
            }
        }
        return false
    }

    /// 定位并选中「第 n 处」出现的文本（用于统计条目的上一个/下一个跳转）。
    /// - Returns: `(ok, total, detail)`，ok 是否成功，total 总命中数，detail 用于诊断的详细信息。
    static func locateNth(search: String, nth: Int) -> (ok: Bool, total: Int, detail: String) {
        let script = AppResources.file(named: "locate-nth.applescript")
        guard FileManager.default.fileExists(atPath: script.path) else {
            return (false, 0, "脚本不存在: \(script.lastPathComponent)")
        }
        let trimmed = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return (false, 0, "搜索文本为空") }
        let target = String(trimmed.prefix(120))
        let (code, out) = runScript(script, arguments: [target, String(nth)], timeout: 30)
        let result = out.trimmingCharacters(in: .whitespacesAndNewlines)
        if code != 0 {
            return (false, 0, "osascript 退出码 \(code): \(result)")
        }
        if result == "NODOC" {
            return (false, 0, "未检测到打开的 Word 文档")
        }
        if result.hasPrefix("OK:") {
            let total = Int(result.dropFirst(3)) ?? 1
            return (true, total, result)
        }
        if result.hasPrefix("NOTFOUND:") {
            let total = Int(result.dropFirst("NOTFOUND:".count)) ?? 0
            return (false, total, result)
        }
        return (false, 0, "未知返回: \(result)")
    }

    /// 仅定位第 n 处（不统计总数），用于已缓存总数的快速跳转。
    /// - Parameters:
    ///   - nth: 目标命中序号（1-based，需已由调用方取模到 [1, 总数]）
    /// - Returns: `(ok, found, detail)`，ok 是否成功；失败时 found 为实际命中数（用于更新缓存）
    static func locateNthOnly(search: String, nth: Int) -> (ok: Bool, found: Int, detail: String) {
        let script = AppResources.file(named: "locate-nth.applescript")
        guard FileManager.default.fileExists(atPath: script.path) else {
            return (false, 0, "脚本不存在: \(script.lastPathComponent)")
        }
        let trimmed = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return (false, 0, "搜索文本为空") }
        let target = String(trimmed.prefix(120))
        let (code, out) = runScript(script, arguments: [target, String(nth), "locate"], timeout: 30)
        let result = out.trimmingCharacters(in: .whitespacesAndNewlines)
        if code != 0 {
            return (false, 0, "osascript 退出码 \(code): \(result)")
        }
        if result == "NODOC" {
            return (false, 0, "未检测到打开的 Word 文档")
        }
        if result == "OKLOC" {
            return (true, nth, result)
        }
        if result.hasPrefix("NOTFOUND:") {
            let found = Int(result.dropFirst("NOTFOUND:".count)) ?? 0
            return (false, found, result)
        }
        return (false, 0, "未知返回: \(result)")
    }

    /// 从 Word 当前选区执行一次“查找下一个/上一个”。不会遍历或依次选中中间结果。
    static func findStatsMatch(search: String, forward: Bool) -> (ok: Bool, detail: String) {
        let script = AppResources.file(named: "stats-find.applescript")
        guard FileManager.default.fileExists(atPath: script.path) else {
            return (false, "脚本不存在: \(script.lastPathComponent)")
        }
        let trimmed = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return (false, "搜索文本为空") }
        let target = String(trimmed.prefix(120))
        let direction = forward ? "next" : "previous"
        let (code, out) = runScript(script, arguments: [target, direction], timeout: 30)
        let result = out.trimmingCharacters(in: .whitespacesAndNewlines)
        guard code == 0 else {
            return (false, "osascript 退出码 \(code): \(result)")
        }
        switch result {
        case "OK": return (true, result)
        case "NODOC": return (false, "未检测到打开的 Word 文档")
        case "NOTFOUND": return (false, "未找到该文本")
        default: return (false, result)
        }
    }

    /// 激活 Word 到前台。
    static func activateWord() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", #"tell application "Microsoft Word" to activate"#]
        try? process.run()
    }
}
