-- Shared utilities for Studio Plugin handlers

local Utils = {}

-- Resolve a dot-separated path (e.g. "game.Workspace.SpawnLocation") to an Instance
function Utils.resolveInstancePath(pathStr: string): Instance?
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

return Utils
