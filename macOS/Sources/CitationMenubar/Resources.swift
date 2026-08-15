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
}
