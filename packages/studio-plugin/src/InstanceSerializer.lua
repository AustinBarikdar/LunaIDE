--[[
  InstanceSerializer — Serialize the DataModel tree to JSON
  for sending to the IDE server.
]]

local InstanceSerializer = {}

local MAX_DEPTH = 10

function InstanceSerializer.serialize(instance: Instance, depth: number?): any
	local currentDepth = depth or 0

	if currentDepth > MAX_DEPTH then
		return {
			name = instance.Name,
			className = instance.ClassName,
			children = {},
			truncated = true,
		}
	end

	local children = {}
	for _, child in ipairs(instance:GetChildren()) do
		table.insert(children, InstanceSerializer.serialize(child, currentDepth + 1))
	end

	local properties = {}

	-- Safely try to get common properties
	pcall(function()
		if instance:IsA("BaseScript") then
			properties.Disabled = (instance :: any).Disabled
			properties.RunContext = tostring((instance :: any).RunContext)
		end
	end)

	pcall(function()
		if instance:IsA("BasePart") then
			local pos = (instance :: any).Position
			properties.Position = { X = pos.X, Y = pos.Y, Z = pos.Z }
			properties.Anchored = (instance :: any).Anchored
			properties.CanCollide = (instance :: any).CanCollide
		end
	end)

	pcall(function()
		if instance:IsA("Model") then
			local prim = (instance :: any).PrimaryPart
			properties.PrimaryPart = if prim then prim.Name else nil
		end
	end)

	-- Get attributes
	local attributes = {}
	pcall(function()
		attributes = instance:GetAttributes()
	end)

	-- Get tags
	local tags = {}
	pcall(function()
		tags = instance:GetTags()
	end)

	return {
		name = instance.Name,
		className = instance.ClassName,
		children = children,
		properties = properties,
		attributes = attributes,
		tags = tags,
	}
end

function InstanceSerializer.serializeGame(): any
	return InstanceSerializer.serialize(game)
end

return InstanceSerializer
