--[[
  OutputCapture — Hooks LogService.MessageOut to buffer Studio output.
  Sends buffered output to the IDE server periodically.
]]

local HttpService = game:GetService("HttpService")
local LogService = game:GetService("LogService")

local OutputCapture = {}
OutputCapture.__index = OutputCapture

function OutputCapture.new(baseUrl: string, studioId: string)
	local self = setmetatable({}, OutputCapture)
	self._baseUrl = baseUrl
	self._studioId = studioId
	self._buffer = {} :: { {timestamp: number, messageType: string, message: string} }
	self._connection = nil :: RBXScriptConnection?
	self._maxBufferSize = 500
	return self
end

function OutputCapture:start()
	-- Hook into LogService
	self._connection = LogService.MessageOut:Connect(function(message: string, messageType: Enum.MessageType)
		local entry = {
			timestamp = os.time() * 1000, -- milliseconds
			messageType = tostring(messageType.Name),
			message = message,
		}

		table.insert(self._buffer, entry)

		-- Prevent buffer from growing too large
		if #self._buffer > self._maxBufferSize then
			table.remove(self._buffer, 1)
		end
	end)
end

function OutputCapture:flush()
	if #self._buffer == 0 then
		return true
	end

	local entries = self._buffer
	self._buffer = {}

	local payload = HttpService:JSONEncode({
		studioId = self._studioId,
		entries = entries,
	})

	local success, err = pcall(function()
		HttpService:PostAsync(
			self._baseUrl .. "/studio/output",
			payload,
			Enum.HttpContentType.ApplicationJson,
			false
		)
	end)

	if not success then
		-- Put entries back if send failed
		for i = #entries, 1, -1 do
			table.insert(self._buffer, 1, entries[i])
		end
		warn("[LunaIDE] Failed to send output: " .. tostring(err))
		return false
	end

	return true
end

function OutputCapture:stop()
	if self._connection then
		self._connection:Disconnect()
		self._connection = nil
	end
	-- Final flush
	self:flush()
end

function OutputCapture:getBufferSize(): number
	return #self._buffer
end

return OutputCapture
