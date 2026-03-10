local InsertService = game:GetService("InsertService")
local CollectionService = game:GetService("CollectionService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Utils = require(script.Parent.Utils)

local InstanceHandlers = {}

function InstanceHandlers.register(poller)
	poller:registerHandler("insert_model", function(payload)
		local query = payload and payload.query
		if not query then
			return false, "Missing 'query' in payload"
		end

		local ok, results = pcall(function()
			return InsertService:GetFreeModels(query, 0)
		end)
		if not ok then
			return false, "Failed to search models: " .. tostring(results)
		end

		-- GetFreeModels returns { [1] = { CurrentStartIndex, TotalCount, Results = { ... } } }
		if not results or not results[1] or not results[1].Results or #results[1].Results == 0 then
			return false, "No models found for query: " .. tostring(query)
		end

		local assetId = results[1].Results[1].AssetId

		-- Use game:GetObjects instead of deprecated InsertService:LoadAsset
		local loadOk, objects = pcall(function()
			return game:GetObjects("rbxassetid://" .. tostring(assetId))
		end)
		if not loadOk or not objects or #objects == 0 then
			return false, "Failed to load asset " .. tostring(assetId) .. ": " .. tostring(objects)
		end

		-- Title-case helper
		local function toTitleCase(str: string): string
			return string.gsub(str, "(%a)([%w]*)", function(first, rest)
				return string.upper(first) .. string.lower(rest)
			end)
		end

		-- Avoid duplicate names in Workspace
		local function getUniqueName(name: string): string
			if not game.Workspace:FindFirstChild(name) then
				return name
			end
			local i = 2
			while game.Workspace:FindFirstChild(name .. " " .. tostring(i)) do
				i = i + 1
			end
			return name .. " " .. tostring(i)
		end

		-- Collapse multiple objects into a container (matching official plugin pattern)
		local function collapseObjectsIntoContainer(objs: { Instance }): Instance
			if #objs == 1 then
				return objs[1]
			end
			-- Check if any object is a Model or BasePart
			local hasModel = false
			for _, obj in ipairs(objs) do
				if obj:IsA("Model") or obj:IsA("BasePart") then
					hasModel = true
					break
				end
			end
			local container: Instance
			if hasModel then
				container = Instance.new("Model")
			else
				container = Instance.new("Folder")
			end
			for _, obj in ipairs(objs) do
				obj.Parent = container
			end
			return container
		end

		local result = collapseObjectsIntoContainer(objects)
		local insertedName = toTitleCase(getUniqueName(result.Name or query))
		result.Name = insertedName

		-- Position near camera if it's a Model with a PrimaryPart
		pcall(function()
			if result:IsA("Model") then
				local camera = game.Workspace.CurrentCamera
				if camera and (result :: any).PrimaryPart then
					local cf = camera.CFrame;
					(result :: any):PivotTo(cf * CFrame.new(0, 0, -20))
				end
			end
		end)

		result.Parent = game.Workspace

		return true, { name = insertedName, assetId = assetId }
	end)

	poller:registerHandler("get_children", function(payload)
		local instancePath = payload and payload.path or "game"
		local depth = payload and payload.depth or 1
		
		local instance = Utils.resolveInstancePath(instancePath)
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

		local instance = Utils.resolveInstancePath(instancePath)
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

	poller:registerHandler("create_instance", function(payload)
		local className = payload and payload.className
		local parentPath = payload and payload.parentPath
		if not className or not parentPath then
			return false, "Missing 'className' or 'parentPath' in payload"
		end

		local parent = Utils.resolveInstancePath(parentPath)
		if not parent then
			return false, "Parent not found: " .. tostring(parentPath)
		end

		local ok, inst = pcall(function()
			local newInst = Instance.new(className)
			newInst.Name = payload.name or className

			-- Set initial properties with type coercion
			if payload.properties then
				for propName, propValue in pairs(payload.properties) do
					pcall(function()
						if type(propValue) == "table" then
							if propValue.X ~= nil and propValue.Y ~= nil and propValue.Z ~= nil then
								(newInst :: any)[propName] = Vector3.new(propValue.X, propValue.Y, propValue.Z)
							elseif propValue.R ~= nil and propValue.G ~= nil and propValue.B ~= nil then
								(newInst :: any)[propName] = Color3.new(propValue.R, propValue.G, propValue.B)
							elseif propValue.XScale ~= nil and propValue.XOffset ~= nil and propValue.YScale ~= nil and propValue.YOffset ~= nil then
								(newInst :: any)[propName] = UDim2.new(propValue.XScale, propValue.XOffset, propValue.YScale, propValue.YOffset)
							elseif propValue.X ~= nil and propValue.Y ~= nil then
								(newInst :: any)[propName] = Vector2.new(propValue.X, propValue.Y)
							end
						else
							(newInst :: any)[propName] = propValue
						end
					end)
				end
			end

			newInst.Parent = parent
			return newInst
		end)

		if not ok then
			return false, "Failed to create instance: " .. tostring(inst)
		end

		pcall(function()
			ChangeHistoryService:SetWaypoint("LunaIDE: Create " .. className)
		end)

		return true, {
			name = inst.Name,
			className = inst.ClassName,
			path = inst:GetFullName(),
		}
	end)

	poller:registerHandler("delete_instance", function(payload)
		local pathStr = payload and payload.path
		if not pathStr then
			return false, "Missing 'path' in payload"
		end

		local inst = Utils.resolveInstancePath(pathStr)
		if not inst then
			return false, "Instance not found: " .. tostring(pathStr)
		end

		-- Guard against destroying top-level services
		if inst.Parent == game then
			return false, "Cannot destroy top-level service: " .. inst.Name
		end

		local name = inst.Name
		local ok, err = pcall(function()
			inst:Destroy()
		end)

		if not ok then
			return false, "Failed to destroy instance: " .. tostring(err)
		end

		pcall(function()
			ChangeHistoryService:SetWaypoint("LunaIDE: Delete " .. name)
		end)

		return true, { deleted = name }
	end)

	poller:registerHandler("set_instance_properties", function(payload)
		local pathStr = payload and payload.path
		local properties = payload and payload.properties
		if not pathStr or not properties then
			return false, "Missing 'path' or 'properties' in payload"
		end

		local inst = Utils.resolveInstancePath(pathStr)
		if not inst then
			return false, "Instance not found: " .. tostring(pathStr)
		end

		local results = {}
		for propName, propValue in pairs(properties) do
			local propOk, propErr = pcall(function()
				if type(propValue) == "table" then
					if propValue.X ~= nil and propValue.Y ~= nil and propValue.Z ~= nil then
						(inst :: any)[propName] = Vector3.new(propValue.X, propValue.Y, propValue.Z)
					elseif propValue.R ~= nil and propValue.G ~= nil and propValue.B ~= nil then
						(inst :: any)[propName] = Color3.new(propValue.R, propValue.G, propValue.B)
					elseif propValue.XScale ~= nil and propValue.XOffset ~= nil and propValue.YScale ~= nil and propValue.YOffset ~= nil then
						(inst :: any)[propName] = UDim2.new(propValue.XScale, propValue.XOffset, propValue.YScale, propValue.YOffset)
					elseif propValue.X ~= nil and propValue.Y ~= nil then
						(inst :: any)[propName] = Vector2.new(propValue.X, propValue.Y)
					end
				else
					(inst :: any)[propName] = propValue
				end
			end)
			if propOk then
				results[propName] = "ok"
			else
				results[propName] = "error: " .. tostring(propErr)
			end
		end

		pcall(function()
			ChangeHistoryService:SetWaypoint("LunaIDE: Set properties on " .. inst.Name)
		end)

		return true, { path = pathStr, results = results }
	end)

	poller:registerHandler("move_rename_instance", function(payload)
		local pathStr = payload and payload.path
		if not pathStr then
			return false, "Missing 'path' in payload"
		end

		local inst = Utils.resolveInstancePath(pathStr)
		if not inst then
			return false, "Instance not found: " .. tostring(pathStr)
		end

		local newName = payload.newName
		local newParent = payload.newParent

		if not newName and not newParent then
			return false, "Must provide 'newName' or 'newParent' (or both)"
		end

		if newName then
			inst.Name = newName
		end

		if newParent then
			local parent = Utils.resolveInstancePath(newParent)
			if not parent then
				return false, "New parent not found: " .. tostring(newParent)
			end
			inst.Parent = parent
		end

		pcall(function()
			ChangeHistoryService:SetWaypoint("LunaIDE: Move/rename " .. inst.Name)
		end)

		return true, {
			name = inst.Name,
			path = inst:GetFullName(),
		}
	end)

	poller:registerHandler("manage_tags", function(payload)
		local action = payload and payload.action
		local tag = payload and payload.tag
		if not action or not tag then
			return false, "Missing 'action' or 'tag' in payload"
		end

		if action == "add" then
			local pathStr = payload.path
			if not pathStr then
				return false, "Missing 'path' for add action"
			end
			local inst = Utils.resolveInstancePath(pathStr)
			if not inst then
				return false, "Instance not found: " .. tostring(pathStr)
			end
			CollectionService:AddTag(inst, tag)
			pcall(function()
				ChangeHistoryService:SetWaypoint("LunaIDE: Add tag '" .. tag .. "'")
			end)
			return true, { action = "add", tag = tag, path = pathStr }

		elseif action == "remove" then
			local pathStr = payload.path
			if not pathStr then
				return false, "Missing 'path' for remove action"
			end
			local inst = Utils.resolveInstancePath(pathStr)
			if not inst then
				return false, "Instance not found: " .. tostring(pathStr)
			end
			CollectionService:RemoveTag(inst, tag)
			pcall(function()
				ChangeHistoryService:SetWaypoint("LunaIDE: Remove tag '" .. tag .. "'")
			end)
			return true, { action = "remove", tag = tag, path = pathStr }

		elseif action == "get_tagged" then
			local tagged = CollectionService:GetTagged(tag)
			local results = {}
			for _, inst in ipairs(tagged) do
				table.insert(results, {
					name = inst.Name,
					className = inst.ClassName,
					path = inst:GetFullName(),
				})
			end
			return true, { tag = tag, instances = results }

		else
			return false, "Invalid action: " .. tostring(action) .. ". Must be 'add', 'remove', or 'get_tagged'."
		end
	end)
end

return InstanceHandlers
