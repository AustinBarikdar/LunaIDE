# MCP Tools Reference

LunaIDE provides **19 MCP tools** accessible to AI agents via the MCP server.

## Core Tools

### `read_script`
Read the contents of a Luau/Lua script file.
- **filePath** (string, required) — path to the script

### `write_script`
Write or update a script file. Auto-creates a session snapshot before writing.
- **filePath** (string, required) — path to the script
- **content** (string, required) — new file content
- **description** (string) — snapshot description

### `search_codebase`
Search for text or regex patterns across all Luau files.
- **query** (string, required) — search term or regex
- **regex** (boolean) — treat query as regex
- **include** (string) — glob filter

### `list_instances`
List instances from the Rojo project tree.
- **parentPath** (string) — filter by parent path

### `get_properties`
Get properties of an instance in the Rojo project.
- **path** (string, required) — instance path

### `set_properties`
Set properties on a Rojo project instance.
- **path** (string, required) — instance path
- **properties** (object, required) — properties to set

### `get_diagnostics`
Get Luau LSP diagnostics (errors, warnings).
- **filePath** (string) — specific file, or omit for all

### `get_project_structure`
Get the full Rojo project structure (default.project.json tree).

### `rollback_session`
Rollback to a previous session snapshot.
- **snapshotId** (string, required) — snapshot ID

---

## Studio Tools

### `start_playtest`
Launch a playtest in Roblox Studio.
- **mode** (string) — "Play", "Run", or "PlayHere" (default: "Play")
- **testScript** (string) — Luau source to inject during playtest
- **studioId** (string) — target Studio instance

### `stop_playtest`
Stop a running playtest.
- **studioId** (string) — target Studio instance

### `get_output`
Get Studio output log (prints, warnings, errors).
- **sinceTimestamp** (number) — filter output since this time
- **studioId** (string) — target Studio instance

### `get_children`
Get children of a Roblox instance from the live Studio DataModel.
- **path** (string) — dot-separated path, e.g. "game.Workspace" (default: "game")
- **depth** (number) — recursion depth (default: 1)
- **studioId** (string) — target Studio instance

### `get_instance_properties`
Get detailed properties, attributes, and tags of a live Studio instance.
- **path** (string, required) — dot-separated path, e.g. "game.Workspace.SpawnLocation"
- **studioId** (string) — target Studio instance

---

## File Locking

### `acquire_lock`
Acquire an exclusive lock on a file (5-minute auto-expiration).
- **filePath** (string, required) — file to lock
- **agentId** (string, required) — unique agent identifier

### `release_lock`
Release a previously acquired file lock.
- **filePath** (string, required) — file to unlock
- **agentId** (string, required) — agent that owns the lock

---

## OpenCloud Tools

### `publish_place`
Publish a .rbxl/.rbxlx place file to Roblox.
- **universeId** (number, required)
- **placeId** (number, required)
- **filePath** (string, required) — path to the place file
- **versionType** (string) — "Saved" or "Published" (default: "Published")

### `manage_datastore`
CRUD operations on Roblox DataStores.
- **action** (string, required) — "get", "set", "delete", "list_entries", "list_datastores"
- **universeId** (number, required)
- **datastoreName** (string) — DataStore name
- **key** (string) — entry key
- **value** (any) — value to set
- **scope** (string) — DataStore scope (default: "global")

### `send_message`
Publish a message to a MessagingService topic.
- **universeId** (number, required)
- **topic** (string, required) — topic name
- **message** (string, required) — message content

---

## MCP Resources

| URI | Description |
|-----|-------------|
| `roblox://project/structure` | Full Rojo project tree |
| `roblox://project/instructions` | `.lunaide/instructions.md` content |
| `roblox://diagnostics/all` | All current Luau LSP diagnostics |
