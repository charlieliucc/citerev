# 引用审查 · Swift 版构建脚本
# ------------------------------------------------------------------
# 目标：
#   make run    — 直接以 swift run 运行（开发调试，需本机装有 Swift/Xcode）
#   make build  — 编译成可执行文件
#   make app    — 打包成独立 .app（放入 dist/ 目录，可分发，双击即用）
#   make clean  — 清理构建产物
#
# 最终 .app 不依赖 Python / Node，检测引擎通过系统自带 JavaScriptCore 运行。

APP_NAME := CiteRev
BUNDLE_ID := com.ccliu.citerev

BUILD_DIR := .build
DIST_DIR := dist
APP_BUNDLE := $(DIST_DIR)/$(APP_NAME).app

SWIFT := swift

# dmg 打包参数
DMG_NAME := CiteRev-1.0
DMG_BG := /Users/ccliu/Downloads/background.png
DMG_WINDOW_W := 768
DMG_WINDOW_H := 427
ZIP_FILE := $(DIST_DIR)/CiteRev-macOS.zip

.PHONY: all build run app zip dmg clean

all: app

build:
	$(SWIFT) build -c release

# 直接运行（开发模式，Resources 从工程目录读取）
run:
	$(SWIFT) run

# 打包为独立 .app
app: build
	rm -rf "$(APP_BUNDLE)"
	mkdir -p "$(APP_BUNDLE)/Contents/MacOS" "$(APP_BUNDLE)/Contents/Resources"
	cp "$(BUILD_DIR)/release/CitationMenubar" "$(APP_BUNDLE)/Contents/MacOS/CitationMenubar"
	# 复制资源（JS 引擎 + AppleScript + 驱动脚本）
	cp -R Resources/* "$(APP_BUNDLE)/Contents/Resources/"
	# Web 是真伪检查的唯一源码；构建时复制到 App，排除开发备份目录。
	mkdir -p "$(APP_BUNDLE)/Contents/Resources/web"
	rsync -a --delete --exclude 'backups/' ../web/ "$(APP_BUNDLE)/Contents/Resources/web/"
	# 写入 Info.plist
	@/usr/libexec/PlistBuddy -c "Add :CFBundleName string $(APP_NAME)" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :CFBundleName $(APP_NAME)" "$(APP_BUNDLE)/Contents/Info.plist"
	@/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $(BUNDLE_ID)" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $(BUNDLE_ID)" "$(APP_BUNDLE)/Contents/Info.plist"
	@/usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string CitationMenubar" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable CitationMenubar" "$(APP_BUNDLE)/Contents/Info.plist"
	@/usr/libexec/PlistBuddy -c "Add :CFBundlePackageType string APPL" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || true
	@/usr/libexec/PlistBuddy -c "Add :CFBundleVersion string 1.0" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || true
	@/usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string 1.0" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || true
	@/usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 13.0" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || true
	@/usr/libexec/PlistBuddy -c "Add :NSHighResolutionCapable bool true" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || true
	@/usr/libexec/PlistBuddy -c "Add :LSMultipleInstancesProhibited bool true" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || true
	@/usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon.icns" "$(APP_BUNDLE)/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile AppIcon.icns" "$(APP_BUNDLE)/Contents/Info.plist"
	@echo "打包完成：$(APP_BUNDLE)"
	@echo "分发请运行 make zip，生成经过签名校验的 ZIP。"
	@echo "首次运行需在 系统设置 → 隐私与安全性 → 辅助功能 授权。"

# Documents 等同步目录会重新附加 Finder/FileProvider xattr。先复制到临时目录
# 签名，再封装为 ZIP，并通过重新解压后的副本做严格校验。
zip: app
	@package_dir=$$(mktemp -d /private/tmp/citerev-package.XXXXXX); \
	verify_dir=$$(mktemp -d /private/tmp/citerev-verify.XXXXXX); \
	trap 'rm -rf "$$package_dir" "$$verify_dir"' EXIT; \
	ditto --norsrc --noextattr --noqtn "$(APP_BUNDLE)" "$$package_dir/$(APP_NAME).app"; \
	xattr -cr "$$package_dir/$(APP_NAME).app"; \
	codesign --force --deep --sign - "$$package_dir/$(APP_NAME).app"; \
	codesign --verify --deep --strict "$$package_dir/$(APP_NAME).app"; \
	rm -f "$(ZIP_FILE)"; \
	ditto -c -k --keepParent --norsrc --noextattr "$$package_dir/$(APP_NAME).app" "$(ZIP_FILE)"; \
	ditto -x -k --norsrc --noextattr "$(ZIP_FILE)" "$$verify_dir"; \
	codesign --verify --deep --strict "$$verify_dir/$(APP_NAME).app"
	@echo "已生成并验证：$(ZIP_FILE)"

# 打包为 .dmg 安装盘（带背景图 + 拖到 Applications 提示）
# 背景图：/Users/ccliu/Downloads/bg.png（1530×862 @2x，对应窗口 765×431 pt）
dmg: app
	@bash scripts/make_dmg.sh "$(APP_BUNDLE)" "$(DMG_BG)" "$(DMG_NAME)" "$(DMG_WINDOW_W)" "$(DMG_WINDOW_H)"

clean:
	rm -rf $(BUILD_DIR) $(DIST_DIR)
