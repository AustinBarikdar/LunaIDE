# LunaIDE — Implementation Plan

## Context

Build **LunaIDE**, a custom Roblox development IDE forked from VS Code (Code-OSS, MIT licensed) with built-in Rojo sync, Luau LSP, and an MCP server for AI-assisted development and testing. The IDE provides features like auto-playtest, session history, multi-agent file locking, OpenCloud integration, and persistent codebase learning — inspired by tools like Hawknet but as a standalone branded IDE.

The MCP server supports **any MCP-compatible client** (Claude Code, Claude Desktop, Cursor, etc.) via both stdio and StreamableHTTP transports.

---

## Architecture: Extension-First Hybrid

**Start as a VS Code extension pack, graduate to a branded fork.**

Why not fork immediately:
- VS Code is 1.3M lines of TypeScript, 2.6GB dependencies, 30-min builds — brutal iteration speed
- Can't access official VS Code Marketplace from a fork
- Monthly upstream rebases are a maintenance burden
- 95% of the features can be built as standard VS Code extensions

Why eventually fork:
- Branded "LunaIDE" with custom icons, installer, and identity
- Built-in defaults (Luau LSP pre-configured, Rojo bundled)
- MCP server launches automatically as part of IDE lifecycle
- Custom UI panels (instance tree, property inspector)

**Phases 1-4**: Build everything as extensions, test inside stock VS Code
**Phase 5**: Fork Code-OSS, rebrand, bundle extensions as built-in, ship as "LunaIDE"

---

## Component Architecture

```
LunaIDE
├── packages/core/              VS Code extension (main IDE features)
│   ├── Rojo Manager            spawn/manage rojo serve, sourcemap gen
│   ├── Luau LSP Client         bundled luau-lsp binary, auto-configured
│   ├── Session Manager         snapshots, undo/redo across files
│   ├── Persistent Instructions per-project .lunaide/instructions.md
│   ├── Multi-Studio Manager    track multiple Studio processes
│   ├── OpenCloud Client        REST API wrapper for Open Cloud
│   └── Connection Manager      reconnection, circuit breakers, heartbeat
│
├── packages/mcp-server/        MCP server (stdio or HTTP transport)
│   ├── Tools                   read/write scripts, playtest, diagnostics, etc.
│   ├── Resources               project structure, instructions, output log
│   └── File Locking            multi-agent coordination
│
├── packages/studio-plugin/     Roblox Studio Lua plugin
│   ├── Polling-based comms     Studio can't run HTTP server, so it polls IDE
│   ├── Playtest Controller     start/stop playtest via PluginService
│   ├── Output Capture          hook LogService for output forwarding
│   └── Test Injector           inject and execute test scripts
│
├── packages/shared/            Shared types, protocol definitions, constants
│
└── fork/                       Phase 5: Code-OSS branding patches + CI/CD
```

---

## Phase 1: Foundation (Rojo + Luau LSP Extension)

**Goal:** Working Rojo integration + Luau LSP as a VS Code extension.

### Setup
- Monorepo with pnpm workspaces
- TypeScript 5.5+, esbuild for bundling
- `packages/core/` extension scaffold

### Files to create

**`packages/core/src/extension.ts`** — Main entry point, activates on `workspaceContains:**/default.project.json`

**`packages/core/src/rojo/rojoManager.ts`** — Rojo process lifecycle:
- Auto-detect `rojo` binary from PATH or aftman
- Spawn `rojo serve` for live sync
- Run `rojo sourcemap --watch` for Luau LSP
- Monitor `default.project.json` for changes, restart as needed

**`packages/core/src/rojo/rojoStatus.ts`** — Status bar indicator (Connected/Disconnected/Error)

**`packages/core/src/luau/luauClient.ts`** — Luau LSP client:
- Bundle `luau-lsp` binary per platform (or download on first run)
- Pre-configure for Roblox: `platform.type: "roblox"`, sourcemap enabled
- Wire sourcemap from Rojo into LSP startup

**`packages/core/package.json`** — Extension manifest with commands, settings, activation events

### Key settings
```json
{
  "robloxIde.rojo.path": "auto",
  "robloxIde.rojo.projectFile": "default.project.json",
  "robloxIde.rojo.autoStart": true,
  "robloxIde.rojo.port": 34872
}
```

### Verification
- Open a Rojo project in VS Code with extension installed
- Luau autocomplete and diagnostics work
- Status bar shows Rojo connection state

---

## Phase 2: MCP Server + Session Management

**Goal:** AI agents can read/write scripts, get diagnostics, see project structure.

### MCP Server (`packages/mcp-server/`)
Built with `@modelcontextprotocol/sdk`, both stdio and StreamableHTTP transports.

**Tools:**
| Tool | Description |
|------|-------------|
| `read_script` | Read a Luau script from project |
| `write_script` | Write script content, auto-creates snapshot |
| `search_codebase` | Search across project files |
| `list_instances` | List game instances from Rojo project tree |
| `get_properties` | Get properties/attributes/tags of an instance |
| `set_properties` | Set properties on an instance |
| `get_diagnostics` | Get Luau LSP errors/warnings |
| `get_project_structure` | Full Rojo project tree |
| `rollback_session` | Rollback to a previous snapshot |

**Resources:**
| URI | Description |
|-----|-------------|
| `roblox://project/structure` | Rojo project tree |
| `roblox://project/instructions` | Persistent instructions file |
| `roblox://diagnostics/all` | All Luau diagnostics |

### Session Manager (`packages/core/src/sessions/`)
- `sessionManager.ts` — Intercept file writes, create snapshots
- `snapshotStore.ts` — Store diffs in `.lunaide/sessions/{id}.json`
- `sessionTreeView.ts` — Sidebar TreeView for session timeline
- `diffEngine.ts` — Compute and apply diffs (using `diff-match-patch`)

### Persistent Instructions (`packages/core/src/instructions/`)
- Read `.lunaide/instructions.md` from workspace
- Expose as MCP resource so AI agents read them
- Command: "LunaIDE: Edit Instructions"

### MCP <-> Extension Bridge
- stdio: extension launches MCP server as child process, communicates via JSON-RPC
- HTTP: extension exposes local API on random port, MCP server discovers via `.lunaide/.port`

### Verification
- Configure Claude Code (or any MCP client) with MCP server config
- AI can read scripts, get diagnostics, modify code, and see snapshots

---

## Phase 3: Studio Integration + Auto-Playtest

**Goal:** AI can launch playtest, inject test code, capture output.

### Studio Plugin (`packages/studio-plugin/`)
Studio plugins can't run HTTP servers, so we use **polling architecture**:

```
IDE runs Express server on port 21026
  <- Studio plugin POSTs output log data
  <- Studio plugin POSTs instance tree
  -> Studio plugin GETs pending commands
  <- Studio plugin POSTs command results
```

**Files:**
- `init.server.lua` — Plugin entry, starts polling loop
- `HttpPoller.lua` — Poll IDE server every 0.5s for commands
- `PlaytestController.lua` — Start/stop playtest via PluginService
- `OutputCapture.lua` — Hook LogService.MessageOut
- `TestInjector.lua` — Create and execute test scripts in ServerScriptService
- `InstanceSerializer.lua` — Serialize DataModel tree to JSON

Build with Rojo (`default.project.json` in `studio-plugin/`).

### IDE-side Server (`packages/core/src/studio/`)
- `studioHttpServer.ts` — Express server accepting plugin connections
- `studioDetector.ts` — Detect running Studio processes (pgrep/tasklist)
- `studioManager.ts` — Map Studio instances to Rojo ports
- `studioConnection.ts` — Per-studio connection state

### Connection Resilience (`packages/core/src/connection/`)
- `connectionManager.ts` — WebSocket lifecycle with exponential backoff reconnection
- `circuitBreaker.ts` — After 5 failures, pause 60s, then retry once
- `messageQueue.ts` — Outgoing messages queued until acknowledged
- `heartbeat.ts` — Ping every 10s, dead if no pong within 5s

### New MCP Tools
| Tool | Description |
|------|-------------|
| `start_playtest` | Launch Studio playtest, optionally inject test script |
| `stop_playtest` | Stop running playtest |
| `get_output` | Get Studio output log since timestamp |

### Verification
- Install Studio plugin, open project in Studio + IDE
- AI starts playtest, injects test code, reads output, identifies errors

---

## Phase 4: Multi-Agent + OpenCloud

**Goal:** Multiple AI agents with file locking, plus cloud operations.

### File Locking (`packages/mcp-server/src/locking/`)
- `lockManager.ts` — In-memory `Map<path, { agentId, token, acquiredAt, expiresAt }>`
- Locks expire after 5 minutes to prevent deadlocks
- `write_script` checks lock before writing
- Clear error messages on contention

**New tools:** `acquire_lock`, `release_lock`

### OpenCloud Client (`packages/core/src/opencloud/`)
- `openCloudClient.ts` — Base HTTP client, API key via VS Code SecretStorage
- `placeApi.ts` — Publish places
- `assetApi.ts` — Upload/manage assets
- `datastoreApi.ts` — DataStore CRUD
- `messagingApi.ts` — Publish messages to topics

**New MCP tools:** `publish_place`, `upload_asset`, `manage_datastore`

### Verification
- Two AI agents work on different files simultaneously without conflicts
- Publish a place to Roblox via AI command

---

## Phase 5: Fork + Branding

**Goal:** Branded "LunaIDE" application with bundled extensions.

1. Clone `microsoft/vscode` at stable tag
2. Modify `product.json`:
   - Name: "LunaIDE"
   - `extensionsGallery` -> Open VSX Registry
   - Remove Microsoft-specific telemetry/auth
3. Replace icons and branding assets
4. Bundle core + MCP extensions into `src/extensions/`
5. Default settings: `.luau` file association, Rojo auto-start, Luau LSP platform
6. GitHub Actions CI/CD for macOS (arm64/x64), Windows, Linux builds
7. Custom welcome tab with setup wizard
8. Create installers (.dmg, .exe, .deb)

---

## Phase 6: Polish + Advanced Features

- Custom Instance tree view in sidebar (like Studio Explorer)
- Property inspector panel (WebView)
- Script template gallery
- Automated test runner with reporting
- Performance optimization
- Documentation

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Monorepo | pnpm workspaces |
| Language | TypeScript 5.5+ |
| Bundler | esbuild |
| LSP client | vscode-languageclient v8 |
| MCP SDK | @modelcontextprotocol/sdk |
| MCP transport | stdio + StreamableHTTP (both, for any MCP client) |
| HTTP server | Express.js |
| Studio plugin | Luau |
| Diff engine | diff-match-patch |
| Secrets | VS Code SecretStorage API |
| Testing | Vitest (MCP), @vscode/test-electron (extension) |
| CI/CD | GitHub Actions |

---

## Key Risks

| Risk | Mitigation |
|------|-----------|
| Studio can't run HTTP server | Polling architecture (Studio polls IDE) — proven pattern from luau-lsp |
| Fork maintenance burden | Extension-first approach minimizes fork changes to branding only; auto-rebase scripts |
| Luau LSP binary distribution | Download from GitHub releases on first run (like official extension) |
| Open Cloud rate limits (45 req/min) | Request queuing with rate limiting, cache reads |
| Multi-agent file conflicts | File-level locking with 5-min auto-expiration |
| MCP <-> Extension communication | stdio for single-agent, HTTP bridge for multi-agent |

---

## Project Structure

```
LunaIDE/
├── packages/
│   ├── core/                    VS Code extension
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── rojo/            Rojo manager, config, sourcemap, status
│   │   │   ├── luau/            LSP client, binary resolution, diagnostics
│   │   │   ├── sessions/        Session manager, snapshots, tree view, diff
│   │   │   ├── instructions/    Persistent instructions manager
│   │   │   ├── studio/          Studio detector, connection, HTTP server
│   │   │   ├── opencloud/       Open Cloud API client + endpoints
│   │   │   ├── connection/      Connection manager, circuit breaker, heartbeat
│   │   │   └── bridge/          MCP <-> extension communication
│   │   └── test/
│   │
│   ├── mcp-server/              MCP server
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tools/           All MCP tool implementations
│   │   │   ├── resources/       MCP resource providers
│   │   │   ├── locking/         File-level lock manager
│   │   │   └── bridge/          Extension bridge client
│   │   └── test/
│   │
│   ├── studio-plugin/           Roblox Studio plugin (Luau)
│   │   ├── default.project.json
│   │   └── src/                 init.server.lua + modules
│   │
│   └── shared/                  Shared types, protocol, constants
│
├── fork/                        Phase 5: Code-OSS fork patches
│   ├── branding/                product.json patch, icons
│   └── scripts/                 prepare.sh, build.sh
│
├── package.json                 Root monorepo config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── plan.md                      This file
└── .gitignore
```
