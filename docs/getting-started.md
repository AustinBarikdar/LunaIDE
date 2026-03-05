# Getting Started with LunaIDE

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+
- [Rojo](https://rojo.space/) installed globally
- [Roblox Studio](https://www.roblox.com/create)

## Quick Start

### 1. Install Dependencies

```bash
cd LunaIDE
pnpm install
pnpm build
```

### 2. Launch the Extension

Press **F5** in VS Code with the project open — this launches a new VS Code window with the LunaIDE extension loaded.

### 3. Open a Roblox Project

Open a folder containing a `default.project.json` file. The extension will:
- Auto-start **Rojo** (file sync)
- Start **Luau LSP** (autocomplete, type checking)
- Start the **Bridge Server** (MCP communication)
- Start the **Studio Server** (Studio plugin communication)

### 4. Connect Roblox Studio

1. Build the Studio plugin:
   ```bash
   cd packages/studio-plugin
   rojo build -o LunaIDEPlugin.rbxmx
   ```
2. Install `LunaIDEPlugin.rbxmx` into Studio's `Plugins` folder
3. Open your place in Studio — the plugin connects automatically

### 5. Connect an AI Agent

Configure your AI client with the MCP server:

**For Claude Code, Cursor, Windsurf (JSON-based):**
Add the following to your MCP configuration file (e.g., `~/.claude.json`):
```json
{
  "mcpServers": {
    "roblox-ide": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js", "/path/to/your/project"]
    }
  }
}
```

**For Codex CLI (TOML-based):**
Add the following to your `~/.codex/config.toml` file:
```toml
[mcp_servers.lunaide]
command = "node"
args = ["packages/mcp-server/dist/index.js", "/path/to/your/project"]
```

## Key Features

| Feature | How to Use |
|---------|-----------|
| **Rojo Sync** | Automatic — starts on workspace open |
| **Luau LSP** | Automatic — autocomplete, diagnostics, type checking |
| **Session Snapshots** | Auto-snapshots on save, rollback via command palette |
| **Script Templates** | `Cmd+Shift+P` → "LunaIDE: New Script" |
| **Explorer Panel** | Sidebar → LunaIDE Explorer |
| **Property Inspector** | Right-click instance → "Inspect Properties" |
| **Open Cloud** | Set API key via `Cmd+Shift+P` → "LunaIDE: Set Open Cloud API Key" |
| **Playtest Control** | Via AI agent MCP tools or command palette |

## Configuration

Settings are in VS Code preferences under `robloxIde`:

| Setting | Default | Description |
|---------|---------|-------------|
| `robloxIde.rojo.autoStart` | `true` | Auto-start Rojo on workspace open |
| `robloxIde.rojo.path` | `rojo` | Path to Rojo binary |
| `robloxIde.luau.binaryPath` | auto | Path to luau-lsp binary |

## Project Structure

```
your-game/
├── default.project.json    Rojo project config
├── src/
│   ├── server/             ServerScriptService
│   ├── client/             StarterPlayerScripts
│   ├── shared/             ReplicatedStorage
│   └── gui/                StarterGui
├── .lunaide/
│   ├── instructions.md     AI agent instructions
│   ├── sessions/           Session snapshots
│   └── .port               Bridge server port file
└── ...
```
