#!/bin/bash
# 打包为带背景图与「拖到 Applications」提示的 .dmg
set -e

APP_BUNDLE="$1"        # 例如 dist/CiteRev.app
DMG_BG="$2"            # 背景图路径（@2x png）
DMG_NAME="${3:-CiteRev-1.1}"
WINDOW_W="${4:-765}"   # 背景图宽度 / 2（@2x -> pt）
WINDOW_H="${5:-431}"   # 背景图高度 / 2（@2x -> pt）

HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$HERE/dist"
STAGE="$DIST_DIR/dmg-stage"
VOL_NAME="CiteRev"

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$APP_BUNDLE" "$STAGE/"
cp "$DMG_BG" "$STAGE/background.png"
# 指向 /Applications 的替身（安装提示）
ln -s /Applications "$STAGE/Applications"

TMP_DMG="$DIST_DIR/$DMG_NAME.tmp.dmg"
OUT_DMG="$DIST_DIR/$DMG_NAME.dmg"

# 1) 创建可写镜像
hdiutil create -ov -volname "$VOL_NAME" -fs HFS+ -srcfolder "$STAGE" -format UDRW -size 200m "$TMP_DMG"

# 2) 挂载
DEV=$(hdiutil attach -nobrowse -noverify "$TMP_DMG" | grep -E '^/dev/' | sed 1q | awk '{print $1}')
VOL="/Volumes/$VOL_NAME"
for i in $(seq 1 20); do [ -d "$VOL" ] && break; sleep 0.3; done

# 3) 用 Finder 设置窗口外观、背景图与图标位置
osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "$VOL_NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 200, 200 + $WINDOW_W, 200 + $WINDOW_H}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 128
    set background picture of theViewOptions to POSIX file ("$VOL/background.png")
    set position of item "CiteRev.app" of container window to {190, 215}
    set position of item "Applications" of container window to {575, 215}
    close
    open
    update without registering applications
    delay 2
  end tell
end tell
APPLESCRIPT

# 4) 卸载
# 隐藏背景图（Finder 中不可见，但仍作为背景使用）
if command -v SetFile >/dev/null 2>&1; then
  SetFile -a V "$VOL/background.png" 2>/dev/null || true
fi
hdiutil detach "$VOL" -force || hdiutil detach "$DEV" -force

# 5) 转换为压缩只读镜像
hdiutil convert "$TMP_DMG" -format UDZO -imagekey zlib-level=9 -o "$OUT_DMG"
rm -f "$TMP_DMG"
rm -rf "$STAGE"

echo "打包完成：$OUT_DMG"
