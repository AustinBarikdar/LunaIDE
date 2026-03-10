local RunService = game:GetService("RunService")
local InstanceSerializer = require(script.Parent.Parent.InstanceSerializer)

local SystemHandlers = {}

function SystemHandlers.register(poller, outputCapture, playtestController, testInjector)
	poller:registerHandler("start_playtest", function(payload)
		return playtestController:startPlaytest(payload)
	end)

	poller:registerHandler("stop_playtest", function(payload)
		return playtestController:stopPlaytest()
	end)

	poller:registerHandler("inject_script", function(payload)
		return testInjector:inject(payload)
	end)

	poller:registerHandler("is_running", function(_payload)
		return true, { isRunning = RunService:IsRunning() }
	end)

	poller:registerHandler("get_instances", function(payload)
		local tree = InstanceSerializer.serializeGame()
		return true, tree
	end)

	poller:registerHandler("get_output", function(payload)
		-- Force a flush and return success
		outputCapture:flush()
		return true, { flushed = true }
	end)

	poller:registerHandler("get_studio_mode", function(_payload)
		local isRunning = RunService:IsRunning()
		if not isRunning then
			return true, { mode = "stop" }
		end

		-- Check if it's run mode (server only) vs play mode (client+server)
		local isRunMode = false
		pcall(function()
			isRunMode = RunService:IsRunMode()
		end)

		if isRunMode then
			return true, { mode = "run_server" }
		else
			return true, { mode = "start_play" }
		end
	end)
end

return SystemHandlers
