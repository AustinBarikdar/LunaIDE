local ScriptHandlers = {}

function ScriptHandlers.register(poller)
	poller:registerHandler("run_code", function(payload)
		local command = payload and payload.command
		if not command then
			return false, "Missing 'command' in payload"
		end

		-- Capture print output by temporarily overriding print
		local outputLines = {}
		local originalPrint = print
		local originalWarn = warn
		print = function(...)
			local args = table.pack(...)
			local parts = {}
			for i = 1, args.n do
				table.insert(parts, tostring(args[i]))
			end
			local line = table.concat(parts, "\\t")
			table.insert(outputLines, line)
			originalPrint(...)
		end
		warn = function(...)
			local args = table.pack(...)
			local parts = {}
			for i = 1, args.n do
				table.insert(parts, tostring(args[i]))
			end
			local line = table.concat(parts, "\\t")
			table.insert(outputLines, "[warn] " .. line)
			originalWarn(...)
		end

		local fn, loadErr = loadstring(command)
		if not fn then
			print = originalPrint
			warn = originalWarn
			return false, "Syntax error: " .. tostring(loadErr)
		end

		local ok, runErr = pcall(fn)
		print = originalPrint
		warn = originalWarn

		if not ok then
			return false, "Runtime error: " .. tostring(runErr)
		end

		return true, {
			output = table.concat(outputLines, "\\n"),
		}
	end)
end

return ScriptHandlers
