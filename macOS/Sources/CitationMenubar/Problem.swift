import Foundation
import AppKit

/// 单个问题条目（对应 detect.js 输出的 comment）
struct Problem: Decodable, Identifiable {
    var id: String? { _id }
    let _id: String?
    let color: String?
    let tag: String?
    let quote: String?
    let count: Int?
    let desc: String?
    let searchText: String?
    let inRef: Bool?
    let inText: String?
    let refIndex: Int?
    let refTargets: [String]?

    enum CodingKeys: String, CodingKey {
        case _id = "id"
        case color, tag, quote, count, desc, searchText, inRef, inText, refIndex, refTargets
    }
}

/// detect.js 输出的整体结果
struct DetectionResult: Decodable {
    struct Stats: Decodable {
        let missing: Int?
        let unused: Int?
        let format: Int?
        let mismatch: Int?
        let style: Int?
    }

    /// 统计功能数据（与 citation-word-addin 一致）
    struct StatsData: Decodable {
        struct Row: Decodable, Identifiable {
            let label: String?
            let count: Int?
            let year: String?
            let searchText: String?
            var id: String { (label ?? "") + "|" + (year ?? "") }
        }
        let citeCountRows: [Row]?
        let yearRows: [Row]?
        let journalRows: [Row]?
    }

    let stats: Stats?
    let comments: [Problem]?
    let statsData: StatsData?
}

/// 分类名称与颜色映射（与 Word 加载项 taskpane.css 一致）
enum Category {
    static let names: [String: String] = [
        "missing": "引用缺失",
        "mismatch": "不匹配",
        "style": "样式",
        "unused": "未被引用",
        "format": "格式",
    ]

    /// 主色（对应 CSS 的 --c-*）——使用 Theme 中的动态色，随深色模式切换。
    static let colors: [String: NSColor] = Theme.categoryColors

    /// 浅色背景（对应 CSS 的 --c-*-bg）——深色模式下自动转为半透明强调色。
    static let lightColors: [String: NSColor] = Theme.categoryLightColors

    static func name(for color: String) -> String {
        return names[color] ?? color
    }

    static func color(for key: String) -> NSColor {
        return colors[key] ?? colors["format"]!
    }

    static func lightColor(for key: String) -> NSColor {
        return lightColors[key] ?? Theme.accentTintBackground
    }
}

extension NSColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1.0) {
        let r = CGFloat((hex >> 16) & 0xFF) / 255.0
        let g = CGFloat((hex >> 8) & 0xFF) / 255.0
        let b = CGFloat(hex & 0xFF) / 255.0
        self.init(srgbRed: r, green: g, blue: b, alpha: alpha)
    }
}

extension Problem {
    /// 定位时使用的候选搜索文本
    var locateCandidates: [String] {
        var out: [String] = []
        for key in [quote, searchText, inText] {
            if let v = key {
                let cleaned = v.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
                if !cleaned.isEmpty {
                    out.append(cleaned)
                }
            }
        }
        return out
    }

    /// 展示用：原文（去掉换行）
    var displayQuote: String {
        return Self.decodeHTMLEntities(quote ?? "")
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 展示用：说明（去掉 HTML 标签与多余空白）
    var displayDesc: String {
        return Self.stripHTML(desc ?? "")
    }

    static func stripHTML(_ s: String) -> String {
        // 移除 <...> 标签
        let noTags = s.replacingOccurrences(
            of: "<[^>]+>",
            with: " ",
            options: .regularExpression,
            range: nil
        )
        // 压缩空白
        return Self.decodeHTMLEntities(noTags)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression, range: nil)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 检测引擎沿用了网页端的 HTML 转义；原生界面需要在展示前还原这些实体。
    static func decodeHTMLEntities(_ s: String) -> String {
        return s
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#039;", with: "'")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&apos;", with: "'")
            .replacingOccurrences(of: "&amp;", with: "&")
    }
}
