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

-- Modules
local HttpPoller = require(script.Parent.HttpPoller)
local OutputCapture = require(script.Parent.OutputCapture)
local PlaytestController = require(script.Parent.PlaytestController)
local TestInjector = require(script.Parent.TestInjector)
local InstanceSerializer = require(script.Parent.InstanceSerializer)

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

-- Register command handlers
poller:registerHandler("start_playtest", function(payload)
	return playtestController:startPlaytest(payload)
end)

poller:registerHandler("stop_playtest", function(payload)
	return playtestController:stopPlaytest()
end)

poller:registerHandler("inject_script", function(payload)
	return testInjector:inject(payload)
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

-- Resolve a dot-separated path (e.g. "game.Workspace.SpawnLocation") to an Instance
local function resolveInstancePath(pathStr: string): Instance?
	local parts = string.split(pathStr, ".")
	local current: Instance = game

	for i, part in ipairs(parts) do
		if part == "game" then
			continue
		end
		local child = current:FindFirstChild(part)
		if not child then
			return nil
		end
		current = child
	end

	return current
end

poller:registerHandler("get_children", function(payload)
	local instancePath = payload and payload.path or "game"
	local depth = payload and payload.depth or 1
	
	local instance = resolveInstancePath(instancePath)
	if not instance then
		return false, "Instance not found: " .. tostring(instancePath)
	end

	local function serializeChildren(inst: Instance, currentDepth: number): any
		local children = {}
		for _, child in ipairs(inst:GetChildren()) do
			local entry: any = {
				name = child.Name,
				className = child.ClassName,
				childCount = #child:GetChildren(),
			}
			-- Recurse if depth allows
			if currentDepth < depth then
				entry.children = serializeChildren(child, currentDepth + 1)
			end
			table.insert(children, entry)
		end
		return children
	end

	return true, {
		path = instancePath,
		name = instance.Name,
		className = instance.ClassName,
		children = serializeChildren(instance, 1),
	}
end)

poller:registerHandler("get_instance_properties", function(payload)
	local instancePath = payload and payload.path
	if not instancePath then
		return false, "Missing 'path' in payload"
	end

	local instance = resolveInstancePath(instancePath)
	if not instance then
		return false, "Instance not found: " .. tostring(instancePath)
	end

	-- Gather properties
	local properties = {}

	-- Common properties
	pcall(function() properties.Name = instance.Name end)
	pcall(function() properties.ClassName = instance.ClassName end)
	pcall(function() properties.Parent = if instance.Parent then instance.Parent:GetFullName() else nil end)
	pcall(function() properties.Archivable = instance.Archivable end)

	-- BasePart properties
	pcall(function()
		if instance:IsA("BasePart") then
			local pos = (instance :: any).Position
			properties.Position = { X = pos.X, Y = pos.Y, Z = pos.Z }
			local size = (instance :: any).Size
			properties.Size = { X = size.X, Y = size.Y, Z = size.Z }
			properties.Anchored = (instance :: any).Anchored
			properties.CanCollide = (instance :: any).CanCollide
			properties.Transparency = (instance :: any).Transparency
			properties.Material = tostring((instance :: any).Material)
			local color = (instance :: any).Color
			properties.Color = { R = color.R, G = color.G, B = color.B }
			properties.CFrame = tostring((instance :: any).CFrame)
		end
	end)

	-- Model
	pcall(function()
		if instance:IsA("Model") then
			local prim = (instance :: any).PrimaryPart
			properties.PrimaryPart = if prim then prim.Name else nil
		end
	end)

	-- Script properties
	pcall(function()
		if instance:IsA("BaseScript") then
			properties.Disabled = (instance :: any).Disabled
			properties.RunContext = tostring((instance :: any).RunContext)
			properties.Source = (instance :: any).Source
		end
	end)

	-- GuiObject
	pcall(function()
		if instance:IsA("GuiObject") then
			properties.Visible = (instance :: any).Visible
			local pos = (instance :: any).Position
			properties.Position = tostring(pos)
			local size = (instance :: any).Size
			properties.Size = tostring(size)
			properties.ZIndex = (instance :: any).ZIndex
		end
	end)

	-- Value objects
	pcall(function()
		if instance:IsA("ValueBase") then
			properties.Value = tostring((instance :: any).Value)
		end
	end)

	-- Attributes
	local attributes = {}
	pcall(function()
		attributes = instance:GetAttributes()
	end)

	-- Tags
	local tags = {}
	pcall(function()
		tags = instance:GetTags()
	end)

	return true, {
		path = instancePath,
		fullName = instance:GetFullName(),
		name = instance.Name,
		className = instance.ClassName,
		properties = properties,
		attributes = attributes,
		tags = tags,
		childCount = #instance:GetChildren(),
	}
end)

-- Handshake with IDE
local function performHandshake(): boolean
	local handshakeData = HttpService:JSONEncode({
		studioId = STUDIO_ID,
		version = PLUGIN_VERSION,
		placeId = game.PlaceId,
		placeName = game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId).Name or "Unknown",
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
			end
		end)
		return
	end

	-- Start components
	outputCapture:start()
	poller:start()
	startOutputFlushing()
	startInstanceSync()
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
RunService:GetPropertyChangedSignal("Running"):Connect(function()
	if not RunService:IsRunning() then
		testInjector:cleanup()
	end
end)

startup()
