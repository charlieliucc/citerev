-- stats-find.applescript — 像 Word“查找下一个/上一个”一样只移动一次
-- 用法: osascript stats-find.applescript <搜索文本> <next|previous>

on run argv
	set searchText to item 1 of argv
	set moveDirection to item 2 of argv
	set goForward to (moveDirection is not "previous")

	tell application "Microsoft Word"
		try
			if (count of documents) = 0 then return "NODOC"

			set theDoc to active document
			set winSel to selection of window 1

			-- 从当前选区边界开始，避免再次命中当前已经选中的结果。
			if moveDirection is "previous" then
				set cursorPosition to selection start of winSel
			else
				set cursorPosition to selection end of winSel
			end if
			select (create range theDoc start cursorPosition end cursorPosition)

			set theFind to find object of (selection of window 1)
			tell theFind
				clear formatting
				set content to searchText
				-- 统计项按完整作者姓氏/年份/期刊名查找，避免 Han 命中 enhance 等单词片段。
				set match whole word to true
				set match case to false
				set wrap to true
				set forward to goForward
			end tell

			set didFind to execute find theFind
			if didFind then
				return "OK"
			else
				return "NOTFOUND"
			end if
		on error errMsg
			return "ERROR:" & errMsg
		end try
	end tell
end run
