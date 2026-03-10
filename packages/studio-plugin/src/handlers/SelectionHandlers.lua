local Selection = game:GetService("Selection")
local Utils = require(script.Parent.Utils)

local SelectionHandlers = {}

function SelectionHandlers.register(poller)
	poller:registerHandler("get_selection", function(_payload)
		local selected = Selection:Get()
		local results = {}
		for _, inst in ipairs(selected) do
			table.insert(results, {
				name = inst.Name,
				className = inst.ClassName,
				path = inst:GetFullName(),
			})
		end
		return true, { selection = results }
	end)

	poller:registerHandler("set_selection", function(payload)
		local paths = payload and payload.paths
		if not paths then
			return false, "Missing 'paths' in payload"
		end

		local instances = {}
		for _, pathStr in ipairs(paths) do
			local inst = Utils.resolveInstancePath(pathStr)
			if inst then
				table.insert(instances, inst)
			end
		end

		Selection:Set(instances)
		return true, { selected = #instances }
	end)
end

return SelectionHandlers
