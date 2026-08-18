import Foundation
import AppKit
import SwiftUI

/// 界面主题：为 macOS 深色 / 浅色模式提供动态语义色。
///
/// 原先所有颜色都硬编码成浅色值（例如 `Color.white`、背景 `0xF3F4F6`、
/// 文字 `0x1F2329`、边框 `0xE5E6EB`），在深色模式下会显示为白底浅色文字，
/// 无法正常阅读。这里改为使用 `NSColor(name: nil, dynamicProvider:)`，让每个语义色根据
/// 当前系统外观（`NSAppearance`) 实时返回浅色 / 深色两套取值，从而原生适配
/// 系统“深色模式”，并且随用户在系统设置中切换外观而自动变化。
enum Theme {
    // MARK: - 背景层

    /// 主窗口背景（浅色页面灰 / 深色近黑）
    static let background = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x1E1E1E)
            : NSColor(hex: 0xF3F4F6)
    })

    /// 卡片 / 面板背景（浅色纯白 / 深色抬升灰）
    static let surface = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x2A2A2A)
            : NSColor(hex: 0xFFFFFF)
    })

    /// 次级表面（被选中筛选 chip 等的灰底）
    static let surfaceSecondary = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x333333)
            : NSColor(hex: 0xF3F4F6)
    })

    // MARK: - 文字

    static let textPrimary = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0xE6E6E6)
            : NSColor(hex: 0x1F2329)
    })

    static let textSecondary = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x9A9A9A)
            : NSColor(hex: 0x646A73)
    })

    // MARK: - 边框 / 分隔

    static let border = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x3D3D3D)
            : NSColor(hex: 0xE5E6EB)
    })

    static let borderHover = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x5A5A5A)
            : NSColor(hex: 0xC0C4CC)
    })

    // MARK: - 强调色（品牌蓝，深浅色保持一致，仅微调亮度保证对比）

    static let accent = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x4096FF)
            : NSColor(hex: 0x1677FF)
    })

    /// 强调色的浅背景（用于统计条数胶囊 / 链接标签等）
    static let accentTintBackground = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x1677FF).withAlphaComponent(0.18)
            : NSColor(hex: 0x1677FF).withAlphaComponent(0.08)
    })

    static let accentSoftBackground = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x4096FF).withAlphaComponent(0.16)
            : NSColor(hex: 0xEDF4FF)
    })

    // MARK: - 分类颜色

    /// 分类主色（色条、标签背景、圆点）——保持与原浅色方案一致的品牌色，
    /// 深色下略微提亮以保证在深色背景上的可读性。
    static let categoryColors: [String: NSColor] = [
        "missing":  NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xFF6B61) : NSColor(hex: 0xF5483B) }),
        "mismatch": NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xFF5B5B) : NSColor(hex: 0xF5222D) }),
        "style":    NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xFFA940) : NSColor(hex: 0xFA8C16) }),
        "unused":   NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xFF9F40) : NSColor(hex: 0xFF8800) }),
        "format":   NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xFFC53D) : NSColor(hex: 0xFAAD14) }),
    ]

    /// 分类浅色背景（用于强调色文字背后的浅底）——深色下用半透明强调色。
    static let categoryLightColors: [String: NSColor] = [
        "missing":  NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xF5483B).withAlphaComponent(0.16) : NSColor(hex: 0xFFF1F0) }),
        "mismatch": NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xF5222D).withAlphaComponent(0.16) : NSColor(hex: 0xFFF1F0) }),
        "style":    NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xFA8C16).withAlphaComponent(0.16) : NSColor(hex: 0xFFF7E6) }),
        "unused":   NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xFF8800).withAlphaComponent(0.16) : NSColor(hex: 0xFFF4E6) }),
        "format":   NSColor(name: nil, dynamicProvider: { $0.isDark ? NSColor(hex: 0xFAAD14).withAlphaComponent(0.16) : NSColor(hex: 0xFFFBE6) }),
    ]

    /// 卡片内“原文引用”区的灰底（浅色 0xF7F8FA / 深色 0x262626）。
    static let quoteBackground = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x262626)
            : NSColor(hex: 0xF7F8FA)
    })

    /// 成功 / 已解决按钮色。
    static let success = NSColor(name: nil, dynamicProvider: { appearance in
        appearance.isDark
            ? NSColor(hex: 0x49C08B)
            : NSColor(hex: 0x16A34A)
    })
}

// MARK: - NSAppearance 辅助

private extension NSAppearance {
    /// 当前有效外观是否为深色（考虑视图继承的 appearance）。
    var isDark: Bool {
        let name = self.name
        if name == .darkAqua || name == .vibrantDark
            || name == .accessibilityHighContrastDarkAqua
            || name == .accessibilityHighContrastVibrantDark {
            return true
        }
        let matched = self.bestMatch(from: [.darkAqua, .aqua])
        return matched == .darkAqua
    }
}

// MARK: - SwiftUI 便捷封装

extension Color {
    init(theme color: NSColor) {
        self.init(nsColor: color)
    }
}
