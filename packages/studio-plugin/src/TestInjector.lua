--[[
  TestInjector — Creates and executes test scripts in ServerScriptService.
  Used by AI agents to inject test code during playtest.
]]

local ServerScriptService = game:GetService("ServerScriptService")
local RunService = game:GetService("RunService")

local TestInjector = {}
TestInjector.__index = TestInjector

function TestInjector.new()
	local self = setmetatable({}, TestInjector)
	self._injectedScripts = {} :: { Instance }
	return self
end

function TestInjector:inject(payload: { source: string, name: string? }): (boolean, any?)
	if not RunService:IsRunning() then
		return false, "Cannot inject script: no playtest is running"
	end

	local scriptName = payload.name or ("LunaIDETest_" .. tostring(os.time()))

	-- Check if a script with this name already exists
	local existing = ServerScriptService:FindFirstChild(scriptName)
	if existing then
		existing:Destroy()
	end

	-- Create and inject the script
	local testScript = Instance.new("Script")
	testScript.Name = scriptName
	testScript.Source = payload.source
	testScript.Parent = ServerScriptService

	table.insert(self._injectedScripts, testScript)

	return true, {
		name = scriptName,
		status = "injected",
	}
end

function TestInjector:cleanup()
	for _, script in ipairs(self._injectedScripts) do
		if script and script.Parent then
			script:Destroy()
		end
	end
	self._injectedScripts = {}
end

return TestInjector
