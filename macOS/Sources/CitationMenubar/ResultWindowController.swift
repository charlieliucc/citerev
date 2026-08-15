import AppKit
import SwiftUI
import Combine

/// 结果窗口控制器：负责创建 SwiftUI 视图并作为独立窗口显示。
final class ResultWindowController: NSWindowController, NSWindowDelegate {
    private var model: ResultViewModel!
    private var titleObservation: AnyCancellable?

    convenience init() {
        let model = ResultViewModel()
        let contentView = ResultView(model: model)
        let hosting = NSHostingController(rootView: contentView)

        // 窗口尺寸：窄一点，避免右边溢出（底栏导航不影响宽度）
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 620),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "引用审查 · 首页"
        window.minSize = NSSize(width: 420, height: 480)
        window.contentViewController = hosting
        // 固定内容尺寸，避免被 SwiftUI 内容的 preferredContentSize 撑大
        window.setContentSize(NSSize(width: 480, height: 620))
        // 使用普通窗口层级：切换到 Word 或其他应用时不再始终遮挡在最前方。
        window.level = .normal

        self.init(window: window)
        self.model = model
        window.delegate = self
        self.titleObservation = model.$navigationTitle
            .removeDuplicates()
            .receive(on: RunLoop.main)
            .sink { [weak window] section in
                window?.title = "引用审查 · \(section)"
            }

        // 打开后仅按设置预读取；真正检测必须由用户点击“开始检测”。
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak model] in
            model?.preloadActiveDocumentIfEnabled()
        }
    }

    /// 将窗口置于前台、激活并停靠在屏幕右侧（带合适边距，不溢出）。
    func activate() {
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
        if let w = window {
            Self.positionOnRight(of: w)
        }
    }

    /// 将窗口停靠在主屏幕右侧。留出足够边距，避免右边/顶部被屏幕圆角或安全区遮住。
    private static func positionOnRight(of window: NSWindow) {
        guard let screen = NSScreen.main else {
            window.center()
            return
        }
        // visibleFrame 已减去菜单栏与 Dock，使用它作为安全区域
        let visible = screen.visibleFrame
        // 窗口的实际边框尺寸（含标题栏）
        let frame = window.frame
        let margin: CGFloat = 40

        // 右边缘：可见区右边界 - 窗口宽 - 边距
        var x = visible.maxX - frame.width - margin
        // 若窗口比可见区还宽，则退回到左边缘以内，避免溢出
        if x < visible.minX + margin {
            x = visible.minX + margin
        }
        // 顶部留出足够间隙，避免被菜单栏/安全区遮挡
        let y = visible.maxY - frame.height - margin
        window.setFrame(NSRect(x: x, y: y, width: frame.width, height: frame.height), display: true)
    }

    /// 触发重新检测（供菜单栏右键菜单调用）。
    func detect() {
        model?.detect()
    }

    func closeWindow() {
        window?.close()
    }

    func windowWillClose(_ notification: Notification) {
        // 窗口关闭后清空引用，允许下次重新创建
    }
}
