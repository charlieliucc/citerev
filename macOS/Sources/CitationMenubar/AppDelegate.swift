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
    private var closeHotKey: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?
    private var globalKeyMonitor: Any?
    private var localKeyMonitor: Any?

    private enum HotKeyID: UInt32 {
        case quit = 1
        case hide = 2
        case close = 3
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
        WordController.cancelAllScriptsForShutdown()
        if let quitHotKey { UnregisterEventHotKey(quitHotKey) }
        if let hideHotKey { UnregisterEventHotKey(hideHotKey) }
        if let closeHotKey { UnregisterEventHotKey(closeHotKey) }
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
        guard modifiers.contains(.control),
              !modifiers.contains(.command),
              !modifiers.contains(.option) else { return false }

        // Control 组合键的 charactersIgnoringModifiers 在部分输入法/键盘布局下
        // 可能是控制字符（例如 Ctrl+W 为 U+0017），因此使用物理键码识别。
        switch Int(event.keyCode) {
        case kVK_ANSI_Q:
            DispatchQueue.main.async { [weak self] in self?.quitApp() }
            return true
        case kVK_ANSI_H:
            DispatchQueue.main.async { [weak self] in self?.hideWindow() }
            return true
        case kVK_ANSI_W:
            DispatchQueue.main.async { [weak self] in
                self?.closeWindow()
            }
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
                case .close: delegate.closeWindow()
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
        let closeID = EventHotKeyID(signature: signature, id: HotKeyID.close.rawValue)
        RegisterEventHotKey(UInt32(kVK_ANSI_Q), UInt32(controlKey), quitID,
                            GetApplicationEventTarget(), 0, &quitHotKey)
        RegisterEventHotKey(UInt32(kVK_ANSI_H), UInt32(controlKey), hideID,
                            GetApplicationEventTarget(), 0, &hideHotKey)
        RegisterEventHotKey(UInt32(kVK_ANSI_W), UInt32(controlKey), closeID,
                            GetApplicationEventTarget(), 0, &closeHotKey)
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
        button.toolTip = "CiteRev（左键打开审查窗口，右键菜单）"

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

    /// 注册主菜单。Cmd+W 使用 macOS 原生菜单分发；Ctrl+W 由热键监听兼容。
    private func registerAppMenu() {
        let mainMenu = NSMenu()
        // 应用菜单（第一个菜单名为 app 名称）
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu(title: "CiteRev")
        let hideWindowItem = NSMenuItem(title: "隐藏审查窗口",
                                        action: #selector(hideWindow),
                                        keyEquivalent: "h")
        hideWindowItem.keyEquivalentModifierMask = [.command]
        hideWindowItem.target = self
        appMenu.addItem(hideWindowItem)
        let quitAppItem = NSMenuItem(title: "退出 CiteRev",
                                      action: #selector(quitApp),
                                      keyEquivalent: "q")
        quitAppItem.keyEquivalentModifierMask = [.command]
        quitAppItem.target = self
        appMenu.addItem(quitAppItem)
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // 窗口菜单：提供 macOS 原生 Cmd+W 关闭审查窗口。
        // 与 Cmd+H 隐藏、Cmd+Q 退出保持一致，均通过主菜单分发快捷键。
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "窗口")
        let closeWindowItem = NSMenuItem(title: "关闭审查窗口",
                                         action: #selector(closeWindow),
                                         keyEquivalent: "w")
        closeWindowItem.keyEquivalentModifierMask = [.command]
        closeWindowItem.target = self
        windowMenu.addItem(closeWindowItem)
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }

    /// 菜单栏图标：使用系统 SF Symbol「doc.text.magnifyingglass」（与侧边栏审查图标一致），
    /// 作为 template image 自动适配深浅色背景，无突兀的彩色背景方块（避免"白边"感）。
    private func makeMenuBarImage() -> NSImage? {
        // 优先使用 SF Symbol（与侧边栏审查图标一致），作为 template image
        // 自动适配深浅色背景，与系统其他 app 菜单栏图标风格一致。
        if let symbol = NSImage(systemSymbolName: "doc.text.magnifyingglass",
                                accessibilityDescription: "CiteRev") {
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
        let wc = ResultWindowController()
        // 无论通过 Ctrl+W 还是标题栏红点关闭，都清空控制器引用，下次打开重建新窗口
        wc.onWindowClosed = { [weak self] in
            self?.windowController = nil
        }
        windowController = wc
        wc.showWindow(nil)
        wc.activate()
    }

    /// Ctrl+W：关闭审查窗口。关闭后清除控制器，下次打开会重新创建新窗口。
    @objc private func closeWindow() {
        guard let wc = windowController else { return }
        wc.window?.delegate = nil
        wc.closeWindow()
        windowController = nil
    }

    @objc private func hideWindow() {
        windowController?.window?.orderOut(nil)
    }

    @objc private func quitApp() {
        WordController.cancelAllScriptsForShutdown()
        windowController?.closeWindow()
        NSApp.terminate(nil)
    }
}
