--[[
  HttpPoller — Polls the IDE server for pending commands every 0.5s
  and dispatches them to the appropriate handlers.
]]

local HttpService = game:GetService("HttpService")

local HttpPoller = {}
HttpPoller.__index = HttpPoller

function HttpPoller.new(baseUrl: string, studioId: string)
	local self = setmetatable({}, HttpPoller)
	self._baseUrl = baseUrl
	self._studioId = studioId
	self._handlers = {} :: { [string]: (payload: any) -> (boolean, any?) }
	self._running = false
	self._pollInterval = 0.1
	return self
end

function HttpPoller:registerHandler(commandType: string, handler: (payload: any) -> (boolean, any?))
	self._handlers[commandType] = handler
end

function HttpPoller:start()
	self._running = true

	task.spawn(function()
		while self._running do
			local success, err = pcall(function()
				self:_poll()
			end)

			if not success then
				warn("[LunaIDE] Poll error: " .. tostring(err))
			end

			task.wait(self._pollInterval)
		end
	end)
end

function HttpPoller:stop()
	self._running = false
end

function HttpPoller:_poll()
	-- GET pending commands from the IDE
	local response = HttpService:GetAsync(
		self._baseUrl .. "/studio/commands?studioId=" .. self._studioId,
		false
	)

	local data = HttpService:JSONDecode(response)
	if not data or not data.commands then
		return
	end

	-- Process each command
	for _, command in ipairs(data.commands) do
		self:_processCommand(command)
	end
end

function HttpPoller:_processCommand(command: { id: string, type: string, payload: any })
	local handler = self._handlers[command.type]
	local success, result

	if handler then
		local pcallOk, handlerOk, handlerData = pcall(handler, command.payload)
		if not pcallOk then
			-- Runtime error: pcall caught a throw, error message is in handlerOk
			success = false
			result = handlerOk
		else
			-- Handler returned normally: (boolean, data?)
			success = handlerOk
			result = handlerData
		end
	else
		success = false
		result = "Unknown command type: " .. command.type
	end

	-- POST result back to IDE
	local resultPayload = HttpService:JSONEncode({
		commandId = command.id,
		success = success,
		data = if success then result else nil,
		error = if not success then tostring(result) else nil,
	})

	pcall(function()
		HttpService:PostAsync(
			self._baseUrl .. "/studio/results",
			resultPayload,
			Enum.HttpContentType.ApplicationJson,
			false
		)
	end)
end

return HttpPoller
