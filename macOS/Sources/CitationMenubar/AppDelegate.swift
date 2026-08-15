import AppKit
import Carbon

/// 应用入口：设置菜单栏图标，管理结果窗口。
/// 左键点击图标 → 直接打开审查窗口；右键点击 → 显示菜单（重新检测/退出）。
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var windowController: ResultWindowController?
    private var menu: NSMenu!
    private var quitHotKey: EventHotKeyRef?
    private var hideHotKey: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?
    private var globalKeyMonitor: Any?
    private var localKeyMonitor: Any?

    private enum HotKeyID: UInt32 {
        case quit = 1
        case hide = 2
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 同时出现在菜单栏 + Dock，支持从 Dock 图标打开窗口
        NSApp.setActivationPolicy(.regular)
        setupDockIcon()
        setupMenuBar()
        registerGlobalHotKeys()
        registerKeyboardMonitorFallback()
        // 打开程序即展示审查窗口
        openWindow()
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let quitHotKey { UnregisterEventHotKey(quitHotKey) }
        if let hideHotKey { UnregisterEventHotKey(hideHotKey) }
        if let hotKeyHandler { RemoveEventHandler(hotKeyHandler) }
        if let globalKeyMonitor { NSEvent.removeMonitor(globalKeyMonitor) }
        if let localKeyMonitor { NSEvent.removeMonitor(localKeyMonitor) }
    }

    /// Carbon 热键之外再监听 Control+Q/H。它同时覆盖应用前台和 Word 前台，
    /// 并兼容部分系统上 Carbon 注册成功但事件未送达应用 target 的情况。
    private func registerKeyboardMonitorFallback() {
        globalKeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            self?.handleControlShortcut(event)
        }
        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if self?.handleControlShortcut(event) == true { return nil }
            return event
        }
    }

    @discardableResult
    private func handleControlShortcut(_ event: NSEvent) -> Bool {
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard modifiers.contains(.control), !modifiers.contains(.command), !modifiers.contains(.option),
              let key = event.charactersIgnoringModifiers?.lowercased() else { return false }
        switch key {
        case "q":
            DispatchQueue.main.async { [weak self] in self?.quitApp() }
            return true
        case "h":
            DispatchQueue.main.async { [weak self] in self?.hideWindow() }
            return true
        default:
            return false
        }
    }

    /// Carbon 全局快捷键在 Word 位于前台时仍然生效，且不要求应用保持键盘焦点。
    private func registerGlobalHotKeys() {
        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        let handler: EventHandlerUPP = { _, event, userData in
            guard let event, let userData else { return OSStatus(eventNotHandledErr) }
            var hotKeyID = EventHotKeyID()
            let status = GetEventParameter(
                event,
                EventParamName(kEventParamDirectObject),
                EventParamType(typeEventHotKeyID),
                nil,
                MemoryLayout<EventHotKeyID>.size,
                nil,
                &hotKeyID
            )
            guard status == noErr else { return status }
            let delegate = Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async {
                switch HotKeyID(rawValue: hotKeyID.id) {
                case .quit: delegate.quitApp()
                case .hide: delegate.hideWindow()
                case .none: break
                }
            }
            return noErr
        }
        InstallEventHandler(
            GetApplicationEventTarget(),
            handler,
            1,
            &eventType,
            Unmanaged.passUnretained(self).toOpaque(),
            &hotKeyHandler
        )

        let signature: OSType = 0x43495445 // "CITE"
        let quitID = EventHotKeyID(signature: signature, id: HotKeyID.quit.rawValue)
        let hideID = EventHotKeyID(signature: signature, id: HotKeyID.hide.rawValue)
        RegisterEventHotKey(UInt32(kVK_ANSI_Q), UInt32(controlKey), quitID,
                            GetApplicationEventTarget(), 0, &quitHotKey)
        RegisterEventHotKey(UInt32(kVK_ANSI_H), UInt32(controlKey), hideID,
                            GetApplicationEventTarget(), 0, &hideHotKey)
    }

    /// 设置 Dock 栏图标（使用 1024×1024 标准尺寸，与系统其他 app 一致）
    private func setupDockIcon() {
        // macOS Dock 推荐 1024×1024 图标，使用与加载项一致的 logo（蓝色方块 + 白色对号）
        let url = AppResources.file(in: "icons", named: "icon-1024.png")
        let fallback = AppResources.file(in: "icons", named: "icon-80.png")
        let iconURL = FileManager.default.fileExists(atPath: url.path) ? url : fallback
        if let icon = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = icon
        }
    }

    /// 用户点击 Dock 图标时重新打开主窗口
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openWindow()
        return true
    }

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        guard let button = statusItem.button else { return }
        button.image = makeMenuBarImage()
        button.imagePosition = .imageOnly
        button.toolTip = "引用审查（左键打开审查窗口，右键菜单）"

        // 关键：不把 menu 赋给 statusItem.menu，否则会拦截所有点击。
        // 改为 button.action 处理左键（打开窗口）与右键（弹出菜单）。
        button.target = self
        button.action = #selector(handleClick)
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])

        menu = NSMenu()
        menu.addItem(withTitle: "打开审查窗口", action: #selector(openWindow), keyEquivalent: "")
        menu.addItem(withTitle: "重新检测", action: #selector(redoDetect), keyEquivalent: "r")
        menu.addItem(.separator())
        let hideItem = menu.addItem(withTitle: "隐藏窗口", action: #selector(hideWindow), keyEquivalent: "h")
        hideItem.keyEquivalentModifierMask = [.control]
        // Ctrl+Q 退出（与系统标准 app 菜单项一致）
        let quitItem = menu.addItem(withTitle: "退出", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.keyEquivalentModifierMask = [.control]
        menu.items.forEach { $0.target = self }

        // 同时注册为 app 主菜单项，使 Ctrl+Q 在任意焦点下都生效
        registerAppMenu()
    }

    /// 注册一个最小的主菜单，让 Cmd+Q / Ctrl+Q 等系统级快捷键有归属
    private func registerAppMenu() {
        let mainMenu = NSMenu()
        // 应用菜单（第一个菜单名为 app 名称）
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu(title: "引用审查")
        let hideWindowItem = NSMenuItem(title: "隐藏审查窗口",
                                        action: #selector(hideWindow),
                                        keyEquivalent: "h")
        hideWindowItem.keyEquivalentModifierMask = [.command]
        hideWindowItem.target = self
        appMenu.addItem(hideWindowItem)
        let quitAppItem = NSMenuItem(title: "退出引用审查",
                                      action: #selector(quitApp),
                                      keyEquivalent: "q")
        quitAppItem.keyEquivalentModifierMask = [.command]
        quitAppItem.target = self
        appMenu.addItem(quitAppItem)
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)
        NSApp.mainMenu = mainMenu
    }

    /// 菜单栏图标：使用系统 SF Symbol「doc.text.magnifyingglass」（与侧边栏审查图标一致），
    /// 作为 template image 自动适配深浅色背景，无突兀的彩色背景方块（避免"白边"感）。
    private func makeMenuBarImage() -> NSImage? {
        // 优先使用 SF Symbol（与侧边栏审查图标一致），作为 template image
        // 自动适配深浅色背景，与系统其他 app 菜单栏图标风格一致。
        if let symbol = NSImage(systemSymbolName: "doc.text.magnifyingglass",
                                accessibilityDescription: "引用审查") {
            symbol.size = NSSize(width: 18, height: 18)
            symbol.isTemplate = true
            return symbol
        }
        return makeFallbackEmojiImage()
    }

    /// 回退：emoji 字符渲染
    private func makeFallbackEmojiImage() -> NSImage? {
        let text = "📚"
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 14),
        ]
        let size = text.size(withAttributes: attrs)
        let image = NSImage(size: size)
        image.lockFocus()
        (text as NSString).draw(at: .zero, withAttributes: attrs)
        image.unlockFocus()
        image.isTemplate = false
        return image
    }

    /// 区分左键/右键：左键打开窗口，右键显示菜单。
    @objc private func handleClick() {
        guard let event = NSApp.currentEvent else {
            openWindow()
            return
        }
        if event.type == .rightMouseUp {
            if let button = statusItem.button {
                menu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.height + 4), in: button)
            }
        } else {
            openWindow()
        }
    }

    @objc private func redoDetect() {
        openWindow()
        windowController?.detect()
    }

    @objc private func openWindow() {
        if let wc = windowController {
            wc.showWindow(nil)
            wc.activate()
            return
        }
        windowController = ResultWindowController()
        windowController?.showWindow(nil)
        windowController?.activate()
    }

    /// Ctrl+H：仅隐藏审查窗口；应用继续在菜单栏运行，可点击菜单栏图标恢复。
    @objc private func hideWindow() {
        windowController?.window?.orderOut(nil)
    }

    @objc private func quitApp() {
        windowController?.closeWindow()
        NSApp.terminate(nil)
    }
}
