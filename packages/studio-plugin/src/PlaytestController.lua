--[[
  PlaytestController — Start and stop playtests via the plugin API.
]]

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local RunService = game:GetService("RunService")

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

	if mode == "Play" then
		-- Start Play mode
		self._plugin:GetStudioService("StudioService"):SetValue("play", true)
	elseif mode == "Run" then
		-- Start Run mode (server only)
		self._plugin:GetStudioService("StudioService"):SetValue("run", true)
	elseif mode == "PlayHere" then
		-- Play from current camera position
		self._plugin:GetStudioService("StudioService"):SetValue("playhere", true)
	else
		return false, "Unknown playtest mode: " .. tostring(mode)
	end

	return true, { status = "started", mode = mode }
end

function PlaytestController:stopPlaytest(): (boolean, any?)
	if not RunService:IsRunning() then
		return true, { status = "not_running" }
	end

	-- Stop playtest
	self._plugin:GetStudioService("StudioService"):SetValue("stop", true)

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
