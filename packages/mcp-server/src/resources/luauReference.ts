import { ResourceDefinition } from './index.js';

const LUAU_GUIDE = `# Roblox Luau Scripting Reference & Best Practices

## Script Types

### Script (Server Script)
- Runs on the **server** in ServerScriptService or Workspace.
- Has full access to server APIs: DataStoreService, MessagingService, HttpService, etc.
- Cannot access client-only APIs: UserInputService, Camera, LocalPlayer, etc.
- Place in: \`ServerScriptService\`, \`ServerStorage\`, or \`Workspace\`.

### LocalScript (Client Script)
- Runs on the **client** for each player individually.
- Has access to: UserInputService, Camera, LocalPlayer, GUIs, SoundService.
- Cannot directly access DataStores, other players' data, or server modules.
- Place in: \`StarterPlayerScripts\`, \`StarterCharacterScripts\`, \`StarterGui\`, \`ReplicatedFirst\`.

### ModuleScript
- Shared code loaded via \`require()\`. Does NOT run on its own.
- Can be used on both server and client depending on location.
- Place in: \`ReplicatedStorage\` (shared), \`ServerStorage\` (server-only), \`StarterPlayerScripts\` (client-only).
- Always return a table or function at the end.

\`\`\`lua
-- ModuleScript pattern
local Module = {}

function Module.doSomething()
    -- logic here
end

return Module
\`\`\`

---

## Client-Server Architecture

### RemoteEvents (fire-and-forget)
\`\`\`lua
-- In ReplicatedStorage: create RemoteEvent named "DamageEvent"

-- Server:
local event = game.ReplicatedStorage:WaitForChild("DamageEvent")
event.OnServerEvent:Connect(function(player, targetId, amount)
    -- ALWAYS validate on server! Never trust client data.
    if typeof(amount) ~= "number" then return end
    if amount < 0 or amount > 100 then return end
    -- apply damage...
end)

-- Client:
local event = game.ReplicatedStorage:WaitForChild("DamageEvent")
event:FireServer(targetId, 25)
\`\`\`

### RemoteFunctions (request-response)
\`\`\`lua
-- Server:
local func = game.ReplicatedStorage:WaitForChild("GetInventory")
func.OnServerInvoke = function(player)
    return DataManager.getInventory(player)
end

-- Client:
local func = game.ReplicatedStorage:WaitForChild("GetInventory")
local inventory = func:InvokeServer()
\`\`\`

### Golden Rules
1. **Always validate client input on the server.** Client information can be useful and trusted in some cases (e.g. UI selections, chat messages, camera direction), but it must ALWAYS be validated on the server — check types, ranges, permissions, and rate-limit calls.
2. **Server is authoritative.** The server decides game state; the client is a view.
3. **Minimize RemoteEvent traffic.** Batch updates, use throttling.
4. **Never expose server modules to the client** via ReplicatedStorage.

---

## Common Services & When to Use Them

| Service | Side | Purpose |
|---------|------|---------|
| Players | Both | Get player list, listen for joins/leaves |
| RunService | Both | Heartbeat, RenderStepped (client-only), game loop |
| ReplicatedStorage | Both | Shared assets, RemoteEvents/Functions, modules |
| ServerScriptService | Server | Server-only scripts |
| ServerStorage | Server | Server-only assets and modules |
| DataStoreService | Server | Persistent player/game data |
| HttpService | Server | External HTTP requests, JSON encode/decode |
| TweenService | Both | Smooth property animations |
| UserInputService | Client | Keyboard, mouse, touch, gamepad input |
| StarterGui | Client | UI templates cloned to PlayerGui |
| Workspace | Both | 3D world, parts, models, terrain |
| SoundService | Both | Audio playback and configuration |
| CollectionService | Both | Tag-based instance grouping |
| PhysicsService | Server | Collision group management |
| MarketplaceService | Both | Dev products, game passes |
| MessagingService | Server | Cross-server communication |
| MemoryStoreService | Server | Temporary cross-server data (queues, sorted maps) |
| PathfindingService | Server | NPC navigation |
| TeleportService | Both | Teleport players between places |

---

## Luau Language Best Practices

### Type Annotations (Luau)
\`\`\`lua
-- Function with typed parameters and return
local function calculateDamage(base: number, multiplier: number): number
    return base * multiplier
end

-- Table types
type PlayerData = {
    coins: number,
    level: number,
    inventory: { string },
}

-- Optional values
local function findPlayer(name: string): Player?
    return game.Players:FindFirstChild(name) :: Player?
end
\`\`\`

### Performance Tips
\`\`\`lua
-- ✅ Cache service references at the top of the script
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

-- ❌ Don't call GetService in loops
RunService.Heartbeat:Connect(function()
    game:GetService("Players") -- wasteful
end)

-- ✅ Use task library for async
task.spawn(function() end)   -- non-yielding spawn
task.defer(function() end)   -- runs next resumption cycle
task.delay(2, function() end) -- delayed execution
task.wait(1)                  -- yields for 1 second

-- ❌ Don't use deprecated functions
wait(1)     -- use task.wait(1)
spawn(fn)   -- use task.spawn(fn)
delay(t,fn) -- use task.delay(t, fn)

-- ✅ Use WaitForChild for replicated instances
local remote = game.ReplicatedStorage:WaitForChild("MyRemote")

-- ❌ Don't index directly (may not have replicated yet)
local remote = game.ReplicatedStorage.MyRemote -- can error

-- ✅ Destroy instances properly
connection:Disconnect()  -- disconnect events
instance:Destroy()       -- clean up instances

-- ✅ Use table.freeze for constants
local CONFIG = table.freeze({
    MAX_HEALTH = 100,
    WALK_SPEED = 16,
    JUMP_POWER = 50,
})
\`\`\`

### Error Handling
\`\`\`lua
-- pcall for operations that might fail
local success, result = pcall(function()
    return dataStore:GetAsync(key)
end)
if success then
    -- use result
else
    warn("DataStore error:", result)
end

-- xpcall with error handler
local success, result = xpcall(function()
    return riskyOperation()
end, function(err)
    warn("Error:", err, debug.traceback())
end)
\`\`\`

---

## Data Persistence (DataStoreService)

\`\`\`lua
local DataStoreService = game:GetService("DataStoreService")
local playerStore = DataStoreService:GetDataStore("PlayerData")

-- Save data
local function saveData(player: Player, data: any)
    local success, err = pcall(function()
        playerStore:SetAsync("Player_" .. player.UserId, data)
    end)
    if not success then
        warn("Save failed for", player.Name, ":", err)
    end
end

-- Load data with retries
local function loadData(player: Player): any?
    local tries = 0
    local data
    repeat
        tries += 1
        local success, result = pcall(function()
            return playerStore:GetAsync("Player_" .. player.UserId)
        end)
        if success then
            data = result
        else
            warn("Load attempt", tries, "failed:", result)
            task.wait(1)
        end
    until data ~= nil or tries >= 3
    return data
end

-- UpdateAsync for safe concurrent writes
local function incrementCoins(player: Player, amount: number)
    local success, err = pcall(function()
        playerStore:UpdateAsync("Player_" .. player.UserId, function(oldData)
            oldData = oldData or { coins = 0 }
            oldData.coins += amount
            return oldData
        end)
    end)
end
\`\`\`

### DataStore Best Practices
- Always use \`pcall\` around DataStore calls.
- Use \`UpdateAsync\` instead of \`SetAsync\` when possible (prevents race conditions).
- Save on \`PlayerRemoving\` AND \`game:BindToClose\`.
- Implement session locking to prevent data duplication.
- Throttle saves (don't save every frame).

---

## Common Patterns

### Singleton Module
\`\`\`lua
local GameManager = {}
GameManager.__index = GameManager

local instance = nil

function GameManager.getInstance()
    if not instance then
        instance = setmetatable({
            isRunning = false,
            round = 0,
        }, GameManager)
    end
    return instance
end

return GameManager
\`\`\`

### Observer Pattern (Signals)
\`\`\`lua
-- Use BindableEvents for custom events
local signal = Instance.new("BindableEvent")

-- Fire
signal:Fire("data1", "data2")

-- Listen
signal.Event:Connect(function(arg1, arg2)
    print(arg1, arg2)
end)
\`\`\`

### Player Setup Pattern
\`\`\`lua
local Players = game:GetService("Players")

local function onPlayerAdded(player: Player)
    -- Load data
    local data = loadData(player)
    
    -- Setup leaderstats
    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player
    
    local coins = Instance.new("IntValue")
    coins.Name = "Coins"
    coins.Value = data and data.coins or 0
    coins.Parent = leaderstats
    
    -- Setup character
    player.CharacterAdded:Connect(function(character)
        local humanoid = character:WaitForChild("Humanoid")
        humanoid.WalkSpeed = 16
        humanoid.Died:Connect(function()
            -- handle death
        end)
    end)
end

local function onPlayerRemoving(player: Player)
    saveData(player, collectPlayerData(player))
end

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)

-- Handle already-connected players (for late plugin loads)
for _, player in Players:GetPlayers() do
    task.spawn(onPlayerAdded, player)
end

-- Save all on shutdown
game:BindToClose(function()
    for _, player in Players:GetPlayers() do
        saveData(player, collectPlayerData(player))
    end
end)
\`\`\`

### Instance Creation Pattern
\`\`\`lua
-- ✅ Set properties BEFORE setting Parent (avoids unnecessary replication)
local part = Instance.new("Part")
part.Name = "Platform"
part.Size = Vector3.new(20, 1, 20)
part.Position = Vector3.new(0, 10, 0)
part.Anchored = true
part.Material = Enum.Material.SmoothPlastic
part.BrickColor = BrickColor.new("Bright blue")
part.Parent = workspace  -- set Parent LAST

-- ❌ Don't pass parent as second arg to Instance.new (deprecated pattern)
local part = Instance.new("Part", workspace)  -- avoid this
\`\`\`

---

## Security Checklist

1. **Sanity-check all RemoteEvent arguments** — type, range, and permissions.
2. **Never store secrets in client-accessible locations** (LocalScripts, ReplicatedStorage).
3. **Rate-limit remote calls** to prevent spam/exploits.
4. **Use server authority** — clients request actions, server validates and executes.
5. **Don't use \`loadstring()\`** or eval patterns — security risk.
6. **Validate Instance paths** — ensure players can only modify their own data.

---

## Code Style Conventions

- Use **camelCase** for local variables and functions: \`local playerData\`, \`function getHealth()\`
- Use **PascalCase** for: module tables, class-like constructors, services, Roblox instances.
- Use **UPPER_SNAKE_CASE** for constants: \`local MAX_RETRIES = 3\`
- Prefer \`local\` over global variables — always.
- Add type annotations to function signatures.
- Group code: services → types → constants → functions → connections/init.
- Comment complex logic, not obvious code.

---

## File Organization (Rojo Projects)

\`\`\`
src/
├── server/           → ServerScriptService
│   ├── init.server.lua
│   └── modules/
│       ├── DataManager.lua
│       └── GameManager.lua
├── client/           → StarterPlayerScripts
│   ├── init.client.lua
│   └── modules/
│       └── InputHandler.lua
├── shared/           → ReplicatedStorage
│   ├── Types.lua
│   ├── Constants.lua
│   └── Utils.lua
└── gui/              → StarterGui
    └── HUD.client.lua
\`\`\`

### Naming conventions for script files:
- \`.server.lua\` → Script (runs on server)
- \`.client.lua\` → LocalScript (runs on client)
- \`.lua\` → ModuleScript (shared, requires explicit require())
`;

export function luauReferenceResource(): ResourceDefinition {
    return {
        uri: 'roblox://reference/luau-guide',
        name: 'Roblox Luau Scripting Guide',
        description: 'Comprehensive Luau scripting reference: script types, client-server architecture, RemoteEvents, DataStores, services, performance tips, security, code style, and common patterns.',
        mimeType: 'text/markdown',
        handler: async () => {
            return {
                contents: [{
                    uri: 'roblox://reference/luau-guide',
                    mimeType: 'text/markdown',
                    text: LUAU_GUIDE,
                }],
            };
        },
    };
}
