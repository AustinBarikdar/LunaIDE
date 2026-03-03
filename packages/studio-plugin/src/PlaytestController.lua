--[[
  PlaytestController — Start and stop playtests via the plugin API.
]]

local RunService = game:GetService("RunService")
local StudioTestService = game:GetService("StudioTestService")

local PlaytestController = {}
PlaytestController.__index = PlaytestController

local STOP_SETTING_KEY = "LunaIDE_StopPlaytest"

function PlaytestController.new(plugin: Plugin)
	local self = setmetatable({}, PlaytestController)
	self._plugin = plugin
	
	-- Determine DataModel type
	local dataModelType = "Unknown"
	if RunService:IsEdit() then
		dataModelType = "Edit"
	elseif RunService:IsServer() then
		dataModelType = "Server"
	elseif RunService:IsClient() then
		dataModelType = "Client"
	end
	
	-- Start background monitor if we are the Server datamodel (playtest active)
	if dataModelType == "Server" then
		self._plugin:SetSetting(STOP_SETTING_KEY, false)
		task.spawn(function()
			while true do
				if self._plugin:GetSetting(STOP_SETTING_KEY) then
					self._plugin:SetSetting(STOP_SETTING_KEY, false)
					pcall(function()
						StudioTestService:EndTest({})
					end)
				end
				task.wait(0.5)
			end
		end)
	end
	
	return self
end

-- If callback finishes before timeout, returns callback result, otherwise returns timeoutResult
-- StudioTestService:ExecutePlayModeAsync({}) may error "Previous call to start play session has not been completed" immediately(still yielding) or yield until stop.
local function callWithTimeout(callback: () -> any, timeout: number, timeoutResult: string): (string?, boolean)
	local BindableEvent = Instance.new("BindableEvent")
	local isDone = false
	local result = timeoutResult
	local isTimeout = false

	task.spawn(function()
		local _success, res = pcall(function()
			return callback()
		end)
		if not isDone then
			isDone = true
			if res ~= nil then result = tostring(res) end
			BindableEvent:Fire()
		end
	end)
	
	task.spawn(function()
		task.wait(timeout)
		if not isDone then
			isDone = true
			isTimeout = true
			BindableEvent:Fire()
		end
	end)

	if not isDone then
		BindableEvent.Event:Wait()
	end
	
	BindableEvent:Destroy()
	return result, isTimeout
end

function PlaytestController:startPlaytest(payload: { mode: string? }): (boolean, any?)
	local mode = payload and payload.mode or "Play"

	if RunService:IsRunning() then
		return true, { status = "already_running" }
	end

	if mode ~= "Play" and mode ~= "PlayHere" and mode ~= "Run" then
		return false, "Unknown playtest mode: " .. tostring(mode)
	end

	local statusMessage = "started"
	
	if mode == "Play" or mode == "PlayHere" then
		local result, isTimeout = callWithTimeout(function()
			return StudioTestService:ExecutePlayModeAsync({})
		end, 0.1, "started")
		if not isTimeout then
			statusMessage = result or "Unknown error"
		end
	elseif mode == "Run" then
		local result, isTimeout = callWithTimeout(function()
			return StudioTestService:ExecuteRunModeAsync({})
		end, 0.1, "started")
		if not isTimeout then
			statusMessage = result or "Unknown error"
		end
	end

	return true, { status = statusMessage, mode = mode }
end

function PlaytestController:stopPlaytest(): (boolean, any?)
	-- RunService:IsRunning() always returns false for Edit DataModels,
	-- so we skip it to prevent silently blocking the "stop" function
	-- from injecting the global setting if Edit receives the command.
	
	self._plugin:SetSetting(STOP_SETTING_KEY, true)
	
	return true, { status = "stopped" }
end

return PlaytestController
