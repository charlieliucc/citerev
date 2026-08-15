# 引用审查 · Swift 版构建脚本
# ------------------------------------------------------------------
# 目标：
#   make run    — 直接以 swift run 运行（开发调试，需本机装有 Swift/Xcode）
#   make build  — 编译成可执行文件
#   make app    — 打包成独立 .app（放入 dist/ 目录，可分发，双击即用）
#   make clean  — 清理构建产物
#
# 最终 .app 不依赖 Python / Node，检测引擎通过系统自带 JavaScriptCore 运行。

APP_NAME := 引用审查
BUNDLE_ID := com.ccliu.citation-review

BUILD_DIR := .build
DIST_DIR := dist
APP_BUNDLE := $(DIST_DIR)/$(APP_NAME).app

SWIFT := swift

.PHONY: all build run app clean

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
	# 若本机已配置开发者证书，可取消注释以签名（分发更顺畅）
	# codesign --force --deep --sign - "$(APP_BUNDLE)"
	@echo "打包完成：$(APP_BUNDLE)"
	@echo "分发：把 $(APP_BUNDLE) 整个文件夹发给对方，双击即可运行。"
	@echo "首次运行需在 系统设置 → 隐私与安全性 → 辅助功能 授权。"

clean:
	rm -rf $(BUILD_DIR) $(DIST_DIR)
