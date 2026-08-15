on run
	tell application "Microsoft Word"
		try
			if (count of documents) = 0 then return "NODOC"
			set theDoc to active document
			set docName to name of theDoc as text
			set docPath to ""
			try
				set docPath to full name of theDoc as text
			on error
				-- 尚未保存的新文档没有完整路径，名称仍可区分 Document1/Document2。
			end try
			return "OK" & tab & docName & tab & docPath
		on error errMsg
			return "ERROR:" & errMsg
		end try
	end tell
end run
