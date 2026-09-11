import AppKit
import SwiftUI
@preconcurrency import WebKit

/// 持有单个 WKWebView，使用户在底部页面之间切换时保留真伪检查输入和结果。
/// WKWebView 本身为 lazy，只有用户首次进入“真伪”页时才创建和加载。
@MainActor
final class VerifierBrowserModel: NSObject, ObservableObject, WKNavigationDelegate {
    @Published private(set) var loadError: String?

    private var hasLoaded = false
    private var pageReady = false
    private var pendingSnapshot: VerificationInputSnapshot?
    private var lastAppliedRevision: Int?
    private var injectionAttempt = 0

    private(set) lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.dataset.platform = 'macos';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.allowsMagnification = true
        return view
    }()

    func loadIfNeeded() {
        guard !hasLoaded else { return }
        hasLoaded = true
        guard let webDirectory = AppResources.webDirectory else {
            loadError = "找不到随 App 打包的真伪检查页面"
            return
        }
        let fileURL = webDirectory.appendingPathComponent("verify.html")
        webView.loadFileURL(fileURL, allowingReadAccessTo: webDirectory)
    }

    func apply(snapshot: VerificationInputSnapshot?) {
        guard let snapshot, snapshot.revision != lastAppliedRevision else { return }
        pendingSnapshot = snapshot
        injectionAttempt = 0
        injectPendingSnapshotIfReady()
    }

    private func injectPendingSnapshotIfReady() {
        guard pageReady, let snapshot = pendingSnapshot else { return }
        let script = """
        if (window.CitationVerifierEditor &&
            document.documentElement.dataset.citationVerifierReady === "true") {
          window.CitationVerifierEditor.setText(text);
          return true;
        } else {
          return false;
        }
        """
        Task { @MainActor [weak self, weak webView] in
            guard let self, let webView else { return }
            do {
                let value = try await webView.callAsyncJavaScript(
                    script,
                    arguments: ["text": snapshot.text],
                    in: nil,
                    contentWorld: .page
                )
                if (value as? Bool) == true {
                    self.lastAppliedRevision = snapshot.revision
                    self.pendingSnapshot = nil
                    self.loadError = nil
                } else {
                    self.retryInjection()
                }
            } catch {
                if self.injectionAttempt < 4 {
                    self.retryInjection()
                } else {
                    self.loadError = "无法将 Word 内容带入真伪检查：\(error.localizedDescription)"
                }
            }
        }
    }

    private func retryInjection() {
        guard injectionAttempt < 5 else {
            loadError = "真伪检查页面尚未准备好，请切换页面后重试"
            return
        }
        injectionAttempt += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15 * Double(injectionAttempt)) { [weak self] in
            self?.injectPendingSnapshotIfReady()
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        loadError = nil
        injectPendingSnapshotIfReady()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard navigationAction.navigationType == .linkActivated,
              let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            decisionHandler(.allow)
            return
        }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        loadError = "真伪检查页面加载失败：\(error.localizedDescription)"
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        loadError = "真伪检查页面加载失败：\(error.localizedDescription)"
    }
}

struct VerifierWebView: NSViewRepresentable {
    @ObservedObject var browser: VerifierBrowserModel
    let snapshot: VerificationInputSnapshot?

    func makeNSView(context: Context) -> WKWebView {
        browser.loadIfNeeded()
        browser.apply(snapshot: snapshot)
        return browser.webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        browser.apply(snapshot: snapshot)
    }
}
