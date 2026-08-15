import Foundation
import JavaScriptCore

/// 通过 JavaScriptCore 运行引用检测（替代原 Node 方案）。
///
/// 加载顺序：
///   rules-core.js → JSON 参数配置 → rules-apa7.js → rules-loader.js → driver.js
/// 然后调用全局函数 `citationRunDetection(docJSONString)` 得到问题列表。
enum DetectionEngine {

    /// 单次运行返回结果
    struct RunResult {
        let result: DetectionResult
        let raw: String
    }

    /// 在当前 JSContext 中加载引擎（进程内只应加载一次）。
    /// 返回可复用的 JSContext；若加载失败抛错。
    static func makeContext(activeProfileID: String = "apa7") throws -> JSContext {
        let context = JSContext()!
        context.exceptionHandler = { _, exception in
            if let e = exception {
                print("[JS] 异常: \(e)")
            }
        }

        // 先加载安全的参数配置层，再加载包含算法的 APA 引擎。
        let bootstrapFiles = [
            AppResources.file(named: "prelude.js"),
            AppResources.file(in: "engine", named: "rules-core.js"),
        ]
        for url in bootstrapFiles {
            try evaluate(url: url, in: context)
        }
        for (url, data) in try RuleProfileStore.profileData(activeID: activeProfileID) {
            guard let json = String(data: data, encoding: .utf8) else { throw EngineError.serialize }
            let registration = context.evaluateScript("RuleProfiles.register(\(json));", withSourceURL: url)
            if let ex = context.exception {
                throw EngineError.loadFailed(file: url.lastPathComponent, message: ex.toString() ?? "规则注册失败")
            }
            guard registration?.forProperty("ok")?.toBool() == true else {
                let errors = registration?.forProperty("errors")?.toArray() as? [String]
                throw EngineError.loadFailed(
                    file: url.lastPathComponent,
                    message: errors?.joined(separator: "；") ?? "规则注册失败"
                )
            }
        }
        // JSONSerialization 默认不允许顶层字符串，会抛出无法被 Swift catch 的
        // Objective-C 异常并直接终止进程。启用 fragmentsAllowed 后安全转义规则 ID。
        let escapedIDData = try JSONSerialization.data(withJSONObject: activeProfileID, options: [.fragmentsAllowed])
        let escapedID = String(data: escapedIDData, encoding: .utf8) ?? "\"apa7\""
        let activation = context.evaluateScript("RuleProfiles.activate(\(escapedID));")
        if let ex = context.exception {
            throw EngineError.loadFailed(file: "rules-core.js", message: ex.toString() ?? "规则激活失败")
        }
        guard activation?.forProperty("ok")?.toBool() == true else {
            let errors = activation?.forProperty("errors")?.toArray() as? [String]
            throw EngineError.loadFailed(
                file: "rules-core.js",
                message: errors?.joined(separator: "；") ?? "规则激活失败"
            )
        }

        let isIndependent = RuleProfileStore.availableProfiles()
            .first(where: { $0.id == activeProfileID })?.isIndependentStyle == true
        let files = [
            AppResources.file(in: "engine", named: isIndependent ? "rules-json.js" : "rules-apa7.js"),
            AppResources.file(in: "engine", named: "rules-loader.js"),
            AppResources.file(named: "driver.js"),
        ]
        for url in files {
            try evaluate(url: url, in: context)
        }

        // 校验入口函数是否存在
        if let entry = context.objectForKeyedSubscript("citationRunDetection") {
            if entry.isUndefined { throw EngineError.noEntry }
        } else {
            throw EngineError.noEntry
        }
        return context
    }

    private static func evaluate(url: URL, in context: JSContext) throws {
        let code = try String(contentsOf: url, encoding: .utf8)
        context.evaluateScript(code, withSourceURL: url)
        if let ex = context.exception {
            throw EngineError.loadFailed(file: url.lastPathComponent, message: ex.toString() ?? "未知脚本错误")
        }
    }

    /// 执行检测。`paragraphs` 为 Word 导出后的段落数组。
    static func run(context: JSContext, paragraphs: [[String: Any]]) throws -> RunResult {
        // 构造与 detect.js 相同的输入结构
        let doc: [String: Any] = ["paragraphs": paragraphs]
        let docData = try JSONSerialization.data(withJSONObject: doc, options: [])
        guard let docString = String(data: docData, encoding: .utf8) else {
            throw EngineError.serialize
        }

        guard let fn = context.objectForKeyedSubscript("citationRunDetection"),
              let resultValue = fn.call(withArguments: [docString]) else {
            throw EngineError.execution
        }

        guard let rawString = resultValue.toString() else {
            throw EngineError.execution
        }
        guard let data = rawString.data(using: .utf8) else {
            throw EngineError.decoding
        }
        // 若 JS 层返回 { error, ... }，说明输入有问题
        let result = try JSONDecoder().decode(DetectionResult.self, from: data)
        return RunResult(result: result, raw: rawString)
    }

    enum EngineError: Error, LocalizedError {
        case loadFailed(file: String, message: String)
        case noEntry
        case serialize
        case execution
        case decoding

        var errorDescription: String? {
            switch self {
            case .loadFailed(let file, let message):
                return "加载 JS 引擎失败（\(file)）：\(message)"
            case .noEntry:
                return "JS 引擎缺少入口函数 citationRunDetection"
            case .serialize:
                return "无法序列化检测输入"
            case .execution:
                return "JS 引擎执行失败"
            case .decoding:
                return "无法解析检测结果"
            }
        }
    }
}

/// 段落模型（与 export-word.applescript 的 tab 分隔输出对应）
struct WordParagraph {
    var text: String
    var entireItalic: Bool
    var italicRanges: [[Int]] = []

    func toDict() -> [String: Any] {
        return [
            "text": text,
            "entireItalic": entireItalic,
            "italicRanges": italicRanges,
        ]
    }
}
