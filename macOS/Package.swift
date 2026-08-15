// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "CitationMenubar",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "CitationMenubar", targets: ["CitationMenubar"])
    ],
    targets: [
        .executableTarget(
            name: "CitationMenubar",
            path: "Sources/CitationMenubar",
            resources: [
                // 打包时通过脚本把 Resources/ 复制到 .app/Contents/Resources，
                // 因此这里不声明 process resource，改用绝对路径读取。
            ]
        )
    ]
)
