import AppKit

// 引用审查 · macOS 菜单栏工具（Swift 版）
// 需授权：系统设置 → 隐私与安全性 → 辅助功能（允许本 App 控制 Word）

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
