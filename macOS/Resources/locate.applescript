(*
 * locate.applescript — 在 Microsoft Word 中定位并选中指定文本
 * ------------------------------------------------------------------
 * 用法: osascript locate.applescript <搜索文本>
 *   - 在活动文档中查找「搜索文本」，找到后自动选中并滚动到可见
 * 返回:
 *   成功: OK
 *   未找到: NOTFOUND
 *   出错: ERROR:<message>
 *)

on run argv
	set searchText to item 1 of argv

	tell application "Microsoft Word"
		-- activate 在部分环境（无自动化/辅助功能授权）会报错 -1708，
		-- 若让其抛出，整个脚本会以退出码 1 终止，导致「定位失败」。
		-- 激活只是加分项，查找/选中核心逻辑不应受其影响，故单独吞掉该错误。
		try
			activate
		on error
			-- 忽略激活失败
		end try
		try
			set theFind to find object of selection
			tell theFind
				clear formatting
				set forward to true
				set wrap to true
				set content to searchText
			end tell

			set execResult to execute find theFind
			if execResult then
				-- 找到后已自动选中，Word 会滚动到可见
				return "OK"
			else
				return "NOTFOUND"
			end if
		on error errMsg
			return "ERROR:" & errMsg
		end try
	end tell
end run
