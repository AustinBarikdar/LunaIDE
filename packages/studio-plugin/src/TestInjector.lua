--[[
  TestInjector — Creates and executes test scripts in ServerScriptService.
  Used by AI agents to inject test code without requiring a playtest.
]]

local ServerScriptService = game:GetService("ServerScriptService")

local TestInjector = {}
TestInjector.__index = TestInjector

function TestInjector.new()
	local self = setmetatable({}, TestInjector)
	self._injectedScripts = {} :: { Instance }
	return self
end

function TestInjector:inject(payload: { source: string, name: string? }): (boolean, any?)
	local scriptName = payload.name or ("LunaIDETest_" .. tostring(os.time()))

	-- Remove any existing script with this name
	local existing = ServerScriptService:FindFirstChild(scriptName)
	if existing then
		existing:Destroy()
	end

	-- Set .Source BEFORE parenting to avoid triggering StudioService:SetValue.
	-- Studio's internal source-tracking only applies to DataModel-parented instances,
	-- so setting source on an unparented instance is safe.
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
