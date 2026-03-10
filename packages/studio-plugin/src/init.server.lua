--[[
  LunaIDE Studio Plugin — Main entry point.
  
  This plugin connects to the LunaIDE extension running in VS Code/IDE.
  It polls for commands, captures output, and sends instance data.
  
  Architecture:
    IDE runs HTTP server on port 21026
    <- Studio plugin POSTs output log data
    <- Studio plugin POSTs instance tree
    -> Studio plugin GETs pending commands
    <- Studio plugin POSTs command results
]]

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local InsertService = game:GetService("InsertService")

-- Modules
local HttpPoller = require(script.HttpPoller)
local OutputCapture = require(script.OutputCapture)
local PlaytestController = require(script.PlaytestController)
local TestInjector = require(script.TestInjector)
local InstanceSerializer = require(script.InstanceSerializer)

-- Config
local IDE_PORT = 21026
local BASE_URL = "http://127.0.0.1:" .. tostring(IDE_PORT)
local STUDIO_ID = HttpService:GenerateGUID(false)
local PLUGIN_VERSION = "0.1.0"
local OUTPUT_FLUSH_INTERVAL = 1.0 -- seconds
local INSTANCE_SYNC_INTERVAL = 10.0 -- seconds

-- State
local connected = false

-- Initialize components
local poller = HttpPoller.new(BASE_URL, STUDIO_ID)
local outputCapture = OutputCapture.new(BASE_URL, STUDIO_ID)
local playtestController = PlaytestController.new(plugin)
local testInjector = TestInjector.new()

local SystemHandlers = require(script.handlers.SystemHandlers)
local ScriptHandlers = require(script.handlers.ScriptHandlers)
local SelectionHandlers = require(script.handlers.SelectionHandlers)
local InstanceHandlers = require(script.handlers.InstanceHandlers)

SystemHandlers.register(poller, outputCapture, playtestController, testInjector)
ScriptHandlers.register(poller)
SelectionHandlers.register(poller)
InstanceHandlers.register(poller)

-- Handshake with IDE
local function performHandshake(): boolean
	local handshakeData = HttpService:JSONEncode({
		studioId = STUDIO_ID,
		version = PLUGIN_VERSION,
		placeId = game.PlaceId,
		placeName = game.Name or "Unknown",
	})

	local success, err = pcall(function()
		HttpService:PostAsync(
			BASE_URL .. "/studio/handshake",
			handshakeData,
			Enum.HttpContentType.ApplicationJson,
			false
		)
	end)

	if success then
		print("[LunaIDE] Connected to IDE on port " .. tostring(IDE_PORT))
		return true
	else
		-- Silently fail — IDE may not be running
		return false
	end
end

-- Periodic output flushing
local function startOutputFlushing()
	task.spawn(function()
		while connected do
			outputCapture:flush()
			task.wait(OUTPUT_FLUSH_INTERVAL)
		end
	end)
end

-- Periodic instance tree sync
local function startInstanceSync()
	task.spawn(function()
		while connected do
			pcall(function()
				local tree = InstanceSerializer.serializeGame()
				local payload = HttpService:JSONEncode({
					studioId = STUDIO_ID,
					root = tree,
				})
				HttpService:PostAsync(
					BASE_URL .. "/studio/instances",
					payload,
					Enum.HttpContentType.ApplicationJson,
					false
				)
			end)
			task.wait(INSTANCE_SYNC_INTERVAL)
		end
	end)
end

-- Toolbar button
local toolbar = plugin:CreateToolbar("LunaIDE")
local toggleButton = toolbar:CreateButton(
	"LunaIDE",
	"Toggle LunaIDE connection",
	"rbxassetid://6022668888" -- chain-link icon
)
toggleButton.ClickableWhenViewportHidden = true

local function setButtonState(isConnected: boolean)
	toggleButton:SetActive(isConnected)
end

toggleButton.Click:Connect(function()
	if connected then
		connected = false
		outputCapture:stop()
		poller:stop()
		setButtonState(false)
		print("[LunaIDE] Disconnected.")
	else
		connected = performHandshake()
		if connected then
			outputCapture:start()
			poller:start()
			startOutputFlushing()
			startInstanceSync()
			setButtonState(true)
		else
			print("[LunaIDE] Could not connect to LunaIDE — is the IDE open?")
		end
	end
end)

-- Startup
local function startup()
	-- Try to connect to IDE
	connected = performHandshake()

	if not connected then
		-- Retry handshake every 5 seconds
		task.spawn(function()
			while not connected do
				task.wait(5)
				connected = performHandshake()
			end

			if connected then
				outputCapture:start()
				poller:start()
				startOutputFlushing()
				startInstanceSync()
				setButtonState(true)
			end
		end)
		return
	end

	-- Start components
	outputCapture:start()
	poller:start()
	startOutputFlushing()
	startInstanceSync()
	setButtonState(true)
end

-- Cleanup on plugin unload
plugin.Unloading:Connect(function()
	connected = false
	outputCapture:stop()
	poller:stop()
	testInjector:cleanup()
	print("[LunaIDE] Plugin unloaded.")
end)

-- Clean up injected test scripts when playtest stops
local wasRunning = false
RunService.Heartbeat:Connect(function()
	local isRunning = RunService:IsRunning()
	if wasRunning and not isRunning then
		testInjector:cleanup()
	end
	wasRunning = isRunning
end)

startup()
