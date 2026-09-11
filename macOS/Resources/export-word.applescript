(*
 * export-word.applescript — 从 Microsoft Word 导出全部段落文本及斜体信息
 * ------------------------------------------------------------------
 * 用法: osascript export-word.applescript
 *   - 读取活动文档所有段落，输出拼接字符串（经 stdout 返回）
 *
 * 输出格式（每段一行）：
 *   段落文本 <tab> 整段斜体标志(true/false) <换行>
 *   - 段落内的换行/tab 已统一替换为空格，确保分隔符安全
 *   - 需要 macOS「辅助功能」授权，且 Word 有打开的活动文档
 *)

on reportProgress(progressMessage)
	log progressMessage
end reportProgress

on run argv
	set TAB to ASCII character 9 -- \t
	set NL to ASCII character 10 -- \n
	set includeFormatting to true
	if (count of argv) > 0 and (item 1 of argv as text) is "text-only" then set includeFormatting to false

	tell application "Microsoft Word"
		try
			set theDoc to active document
			set paras to paragraphs of theDoc
			set paraCount to count of paras
			-- Word 对“每个段落的 content”批量取值会返回 missing value 列表，不能直接使用。
			-- 改为一次读取文档正文，再按 Word 段落标记（CR）在本地拆分；这样既正确，
			-- 又省去最昂贵的逐段文本 Apple event。斜体状态也在下方批量读取。
			set fullText to content of text object of theDoc as text
			set AppleScript's text item delimiters to character id 13
			set paraTexts to text items of fullText
			set AppleScript's text item delimiters to ""
			set n to count of paraTexts
			if n > paraCount then set n to paraCount
			set progressStep to n div 20
			if progressStep < 1 then set progressStep to 1
			my reportProgress("PROGRESS:0:" & n)

			-- 一次 Apple event 批量取得段落斜体状态。旧实现逐段查询，长文档会
			-- 产生数百至数千次同步调用，使 Word 长时间显示彩虹光标。
			set italicValues to {}
			set italicCount to 0
			if includeFormatting then
				try
					set italicValues to italic of text object of every paragraph of theDoc
					set italicCount to count of italicValues
				end try
			end if
			-- 用列表累计后一次性拼接，避免大文档反复复制越来越长的字符串。
			set outLines to {}
			repeat with i from 1 to n
				set paraText to (item i of paraTexts as text)

				-- 把段落内的换行/tab/段落标记统一替换为空格，避免破坏分隔符
				set AppleScript's text item delimiters to {return, linefeed, tab, character id 13}
				set paraText to text items of paraText
				set AppleScript's text item delimiters to {" "}
				set paraText to paraText as text
				-- 压缩连续空格（可选，简单保留）

				-- 使用上面批量读取的结果；missing value 或混合格式按 false 处理，
				-- 与旧实现只有明确 true 才标记整段斜体的语义一致。
				set isItalic to false
				if includeFormatting and italicCount >= i then
					try
						if item i of italicValues is true then set isItalic to true
					end try
				end if

				set end of outLines to paraText & TAB & (isItalic as text)
				if (i mod progressStep is 0) or i is n then my reportProgress("PROGRESS:" & i & ":" & n)
			end repeat

			set AppleScript's text item delimiters to NL
			set out to outLines as text
			set AppleScript's text item delimiters to ""
			return out & NL
		on error errMsg
			return "ERROR:" & errMsg
		end try
	end tell
end run
