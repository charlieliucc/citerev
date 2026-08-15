(*
 * locate-nth.applescript — 在 Microsoft Word 中定位「第 n 处」出现的文本
 * ------------------------------------------------------------------
 * 用法:
 *   osascript locate-nth.applescript <搜索文本> <第 n 处(从 1 开始)> [模式]
 *   模式省略 / "count" : 统计总命中数并定位第 n 处（首次调用用，一次性扫描）
 *   模式 "locate"      : 仅定位第 n 处（不计数；n 需已由调用方取模到 [1, 总数]）
 * 返回:
 *   count   成功: OK:<总命中数>
 *   locate  成功: OKLOC
 *   未找到     : NOTFOUND:<已找到数>
 *   无文档     : NODOC
 *   出错       : ERROR:<message>
 * 说明（兼容当前 Word 版本的关键修复）:
 *   - 某些 Word 版本中，「find object of <range>」执行 execute find 后，range 并
 *     不会被重定义为命中文本，导致读取到的 start/end 始终是整段文档范围，进而下一轮
 *     create range 起点==终点（空 range），在空 range 上执行 find 会抛
 *     "The object you are trying to access does not exist"。
 *   - 本脚本改用「find object of (selection of window 1)」：execute find 会把窗口选区
 *     真正移动到命中文本，再用 selection start/end of (selection of window 1) 读取精确
 *     位置（顶层 selection 的位置属性在某些环境返回 missing value，必须带 window 上下文）。
 *   - 每轮命中后，把选区折叠到命中末尾作为下一轮查找起点，避免在命中内部重复查找。
 *   - 代价：count 扫描过程中可见选区会随命中移动（一次性，首次调用）；后续快速跳转走
 *     locate 模式，只做 n 次查找后停在目标处，用户只会看到最终一次选中。
 *   - 变量名避开 Word 保留属性（found/total 等）。
 *)

on run argv
	set searchText to item 1 of argv
	set n to (item 2 of argv) as integer
	set theMode to ""
	if (count of argv) >= 3 then set theMode to item 3 of argv
	-- count 模式允许 n=0，表示从第一处向前回绕到最后一处。
	-- locate 模式的 n 已由 Swift 侧取模，仍防御性地限制为至少 1。
	if theMode is "locate" and n < 1 then set n to 1

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
			set docCnt to count of documents
			if docCnt = 0 then return "NODOC"

			set theDoc to active document
			set winSel to selection of window 1

			if theMode is "locate" then
				-- ============ locate 模式：仅找到第 n 处（命中即停，不扫描全部）============
				select (create range theDoc start 0 end 0)
				set hitCount to 0
				set lastStart to 0
				set lastEnd to 0
				repeat while hitCount < n
					set theFind to find object of winSel
					tell theFind
						clear formatting
						set forward to true
						set wrap to false
						set content to searchText
					end tell
					set ok to execute find theFind
					if not ok then exit repeat
					set hitCount to hitCount + 1
					set lastStart to selection start of winSel
					set lastEnd to selection end of winSel
					-- 下一轮查找起点：折叠到命中末尾，避免重复命中
					select (create range theDoc start lastEnd end lastEnd)
				end repeat

				if hitCount = n then
					-- 命中第 n 处后，选中它（已由最后一次 select 定位到该处）
					select (create range theDoc start lastStart end lastEnd)
					return "OKLOC"
				else
					-- 实际命中数少于 n（缓存过期 / 文档变更），返回已找到数供调用方更新缓存
					return "NOTFOUND:" & hitCount
				end if
			else
				-- ============ count 模式：统计总数 + 定位第 n 处 ============
				select (create range theDoc start 0 end 0)
				set matchStarts to {}
				set matchEnds to {}
				set hitTotal to 0

				repeat
					if hitTotal > 9999 then exit repeat
					set theFind to find object of winSel
					tell theFind
						clear formatting
						set forward to true
						set wrap to false
						set content to searchText
					end tell
					set ok to execute find theFind
					if not ok then exit repeat

					set hitStart to selection start of winSel
					set hitEnd to selection end of winSel
					set end of matchStarts to hitStart
					set end of matchEnds to hitEnd
					set hitTotal to hitTotal + 1

					-- 下一轮查找起点：折叠到命中末尾，避免重复命中
					select (create range theDoc start hitEnd end hitEnd)
				end repeat

				if hitTotal = 0 then return "NOTFOUND:0"

				-- 取模回绕到 [1, hitTotal]（1-based），与 Swift 侧 statsNavIndex 回绕一致
				set wrappedN to (((n - 1) mod hitTotal) + hitTotal) mod hitTotal + 1

				-- 选中第 n 处（已回绕）
				select (create range theDoc start (item wrappedN of matchStarts) end (item wrappedN of matchEnds))
				return "OK:" & hitTotal
			end if
		on error errMsg
			return "ERROR:" & errMsg
		end try
	end tell
end run
