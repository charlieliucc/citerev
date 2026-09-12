import Foundation

/// 定位打包资源文件。支持两种运行方式：
/// 1. 在 .app 内运行：Bundle.main.resourceURL 指向 Contents/Resources
/// 2. swift run 开发时：回退到工程目录下的 Resources/
enum AppResources {
    static var baseURL: URL {
        if let bundleURL = Bundle.main.resourceURL {
            return bundleURL
        }
        // 开发模式：工程根目录的 Resources
        let dev = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("Resources")
        if FileManager.default.fileExists(atPath: dev.path) {
            return dev
        }
        // 兜底：当前目录
        return URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    }

    static func file(named name: String) -> URL {
        return baseURL.appendingPathComponent(name)
    }

    static func file(in subdir: String, named name: String) -> URL {
        return baseURL.appendingPathComponent(subdir).appendingPathComponent(name)
    }

    /// Web verifier 的根目录。打包后位于 Contents/Resources/web；开发模式下
    /// 从独立的 citerev-web 同级仓库读取，也可通过 CITEREV_WEB_DIR 指定路径。
    static var webDirectory: URL? {
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        var candidates = [URL]()
        if let configured = ProcessInfo.processInfo.environment["CITEREV_WEB_DIR"], !configured.isEmpty {
            candidates.append(URL(fileURLWithPath: configured, isDirectory: true))
        }
        candidates += [
            baseURL.appendingPathComponent("web", isDirectory: true),
            cwd.appendingPathComponent("citerev-web", isDirectory: true),
            cwd.deletingLastPathComponent().appendingPathComponent("citerev-web", isDirectory: true),
            cwd.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("citerev-web", isDirectory: true),
        ]
        return candidates.first {
            FileManager.default.fileExists(atPath: $0.appendingPathComponent("verify.html").path)
        }
    }
}
