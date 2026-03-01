--[[
  PlaytestController — Start and stop playtests via the plugin API.
]]

local RunService = game:GetService("RunService")
local StudioTestService = game:GetService("StudioTestService")

local PlaytestController = {}
PlaytestController.__index = PlaytestController

function PlaytestController.new(plugin: Plugin)
	local self = setmetatable({}, PlaytestController)
	self._plugin = plugin
	return self
end

function PlaytestController:startPlaytest(payload: { mode: string? }): (boolean, any?)
	local mode = payload and payload.mode or "Play"

	if RunService:IsRunning() then
		return true, { status = "already_running" }
	end

	if mode ~= "Play" and mode ~= "PlayHere" and mode ~= "Run" then
		return false, "Unknown playtest mode: " .. tostring(mode)
	end

	local spawnErr = nil
	if mode == "Play" or mode == "PlayHere" then
		task.spawn(function()
			local ok, err = pcall(function()
				StudioTestService:ExecutePlayModeAsync(nil)
			end)
			if not ok then spawnErr = err end
		end)
	elseif mode == "Run" then
		task.spawn(function()
			local ok, err = pcall(function()
				StudioTestService:ExecuteRunModeAsync(nil)
			end)
			if not ok then spawnErr = err end
		end)
	end
	task.wait(0)
	if spawnErr then
		return false, "Failed to start playtest: " .. tostring(spawnErr)
	end

	return true, { status = "started", mode = mode }
end

function PlaytestController:stopPlaytest(): (boolean, any?)
	if not RunService:IsRunning() then
		return true, { status = "not_running" }
	end

	local ok, err = pcall(function()
		RunService:Stop()
	end)
	if not ok then
		return false, "Failed to stop playtest: " .. tostring(err)
	end

	return true, { status = "stopped" }
end

function PlaytestController:getStatus(): (boolean, any?)
	return true, {
		isRunning = RunService:IsRunning(),
		isServer = RunService:IsServer(),
		isClient = RunService:IsClient(),
	}
end

return PlaytestController
