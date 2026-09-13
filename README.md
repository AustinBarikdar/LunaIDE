# Luna

A light-mode Electron + React IDE built around your own CLI coding agents (Claude Code, Codex). Luna adds the connective tissue: a local MCP hub the agents share, an Obsidian-compatible markdown vault for memory, a Summaries tab that rolls up every agent's posts, and a Git tab.

## Run

```bash
npm install
npm run dev
```

`npm test` runs the unit checks, `npm run typecheck` the TypeScript checks, `npm run build:mac` packages the app.

## Credits

Several effects are ported from [animata.design](https://animata.design) (MIT) to plain CSS/React: blurry blobs, animated dock, shining button, glowing card, animated border trail, fluid tabs, shimmer and typing text. See `src/renderer/src/components/fx.tsx` and the `/* fx */` block in `styles.css`.

## Two views

On launch Luna asks how you want to work (tick "remember" to skip the question; the titlebar switch changes it any time):

- **Agent view**: no editor. Workspaces run as tabs across the top (rename one to "Frontend", add "Backend"…), and each holds agent terminals docked with draggable dividers. Three layouts sit in the workspace bar: **Grid** balances them (two side by side, four corners at three or four, three across from five up), **Columns** keeps them all in one row, **Rows** stacks them. Drag any divider to size a pane; Luna remembers the sizes per workspace and layout, including after a restart.
- **IDE view**: files, editor, and the terminals as tabs in a bottom panel.

Terminals belong to Luna, not to a view: switching views or workspaces keeps every agent running and replays its recent output when it comes back on screen.

## Layout

- Left edge: activity buttons that switch the sidebar between **Files**, **Git** (init / commit / push / pull), **Summaries** (agent posts with diffs + roll-up), **Agents** (hub status + registration) and **Settings** (vault path, hub port, summarizer). Click the active one to collapse the sidebar. **Terms** at the bottom hides the editor for a terminal-only layout.
- Center: CodeMirror editor (⌘S saves). Bottom: terminals (login shells, so `claude` and `codex` are on PATH) with one-click **Claude** / **Codex** launch buttons.
- Clicking a file name inside a summary's diff opens it in the editor with added lines highlighted green and removed lines shown in red where they were.
- The **+** button in the bottom-right corner blooms into a quick menu: jump to any view, flip Agent/IDE view, launch Claude or Codex, open Settings (⌘,).

## Status bar and quick search

The thin bottom status bar is available in both views. It shows the Git branch, error and warning counts, Search, and hub connection. IDE mode also shows the active cursor position and file language. Click the branch for Source Control, the problem counts for Problems, or the hub indicator for its settings.

| Shortcut (use Ctrl instead of ⌘ on Windows/Linux) | Action                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| ⌘P                                                | Find files by name or path; open files appear first for an empty query |
| ⌘⇧F                                               | Find text across the project, with match-case and whole-word options   |
| ⌘⇧P                                               | Find and run commands, including plugin agent launchers                |
| ⌘F                                                | Find within the current editor                                         |

Use the popup's Files, Project Text, and Commands buttons to switch modes. Arrow keys navigate, Enter opens a result, and Escape closes the popup and restores focus. Opening a result in Agents mode switches to IDE mode and jumps to the file or match.

Project searches respect nested `.gitignore` files and skip generated folders, symlinks, binary files, and files larger than 1 MB. Unsaved open-file contents take precedence over disk contents. Results are capped at 100 files or 500 text matches; narrow the query when a limit notice appears. Project text search supports literal text only, without project-wide replacement or regular expressions.

## MCP hub

Luna serves `http://127.0.0.1:4141/mcp/<agent>` while a project is open. The path segment is the agent's identity. Tools:

| tool                                  | what it does                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `post_summary(title, text)`           | save a summary to the vault; shows in the Summaries tab                              |
| `read_summaries(limit)`               | read everyone's recent summaries                                                     |
| `send_message(to, text)`              | drop a note in another agent's inbox                                                 |
| `read_inbox()`                        | read and clear your inbox                                                            |
| `delegate(assignments)`               | team-leader tool: queue a task per agent and prompt their terminal                   |
| `list_agents()`                       | who Luna knows about, and who has a terminal open                                    |
| `memory_write(name, content, scope?)` | save a note; `scope: "shared"` puts it in the universal vault every project can read |
| `memory_read / memory_list`           | read a note (project first, then shared) / list both scopes                          |
| `memory_search(query)`                | keyword search over project memory, the shared vault, and past summaries             |

## Team prompt

**Team prompt** (Agents view header, flower menu, or the command palette) opens a full-size composer. Every open agent terminal is a team member with its own hub identity: the first Claude terminal is `claude`, the second `claude-2`, and so on (Luna passes it as `LUNA_AGENT`; Claude sends it as an `X-Luna-Agent` header via `.mcp.json`, Codex via `env_http_headers`). Pick which terminal **plans** and tick which ones **code**, write the job, send. The planner is told to search shared memory, split the job, and delegate through `delegate`; if it is not also a coder it never writes code itself. Each task lands in that terminal's inbox and Luna types a nudge into it so it starts right away. Coders report back with `send_message` to the planner.

**Registration** lives in Settings → Agents (Register / Re-register with a preview of the exact changes). When you launch an agent that isn't registered yet, a notification in the bottom-right corner offers to do it in one click.

## Linting, language servers, and plugins

Luna speaks the Language Server Protocol (what most VS Code language extensions wrap). Bundled and on by default: TypeScript/JavaScript, JSON, CSS/SCSS/Less, HTML, and your project's own ESLint (run on the live buffer, no config needed beyond the project's). Diagnostics show as squiggles, gutter marks, a count on each editor tab, and in the **Problems** panel docked in the IDE's bottom-right corner next to the terminals (toggle it from the editor tab bar; click a problem to jump to it). Completion comes from the same servers. Add any other server (pyright, rust-analyzer, gopls…) in Settings → Extensions by command.

**Plugins** are folders with a `luna-plugin.json`, installed under Luna's app data:

```json
{
  "name": "python-tools",
  "version": "1.0.0",
  "description": "Pyright for Python files",
  "languageServers": [
    { "name": "Python", "command": "pyright-langserver", "args": ["--stdio"], "exts": ["py"] }
  ],
  "agents": [{ "id": "gemini", "name": "Gemini CLI", "command": "gemini" }]
}
```

Settings → Extensions → **Plugins** has three pages:

- **Create plugin**: choose an agent, language-server, or Python/Pyright template, fill in the fields, and select **Create and enable**. Add multiple agents and servers to a plugin, and preview its generated JSON before creating it. No manual JSON editing is needed.
- **Install plugin**: choose a folder containing `luna-plugin.json` or enter an HTTPS/SSH Git repository URL. Luna validates the manifest before installing and rejects duplicate names without replacing an existing plugin.
- **Installed**: search, enable/disable, open files, export a plugin folder, or remove a plugin. Use Reload after editing files manually. Agent launch buttons update immediately when plugins change.

Plugin names and agent IDs use lowercase letters and numbers separated by dots, hyphens, or underscores. Language-server arguments are entered one per line; file extensions are comma-separated. Plugin commands must already be installed and available on your terminal's PATH; enabled language servers start automatically. To share a plugin, export its folder or push it to a Git repository and share the URL. Full VS Code extensions cannot run in Luna; their language servers can.

## Activity and vault graph

Every hub interaction (summaries, messages, delegated tasks, roll-ups, nudges, your dispatches) is appended to `<vault>/Luna/<project>/log.jsonl`. The **Activity** view shows the agents as a live network with animated arcs for recent messages, above a chat-style feed of who said what to whom. **Clear** empties the log for the project. In the Chat tab a composer at the top queues a note of your own: pick an agent (the current team leader comes first) and Luna drops it in that agent's inbox and nudges its terminal to read it, so you can change course mid-job without interrupting the run.

The **Vault graph** button (activity bar or flower menu) opens an Obsidian-style force graph of the vault: agents, summaries, roll-ups, memory notes, and inboxes, linked by authorship, `[[wikilinks]]`, and which summaries each roll-up covered. Drag to arrange, double-click a node to open the file in the editor.

Register from the Agents tab. For Claude Code that writes `.mcp.json` plus a `UserPromptSubmit` hook in `.claude/settings.local.json` that tells Claude when its inbox has mail. For Codex it runs `codex mcp add luna --url …`.

## Vault

`<vault>/Luna/<project>/{summaries,inbox,memory,rollups}` as plain markdown, plus a universal `<vault>/Luna/shared/memory/` that every project and agent can pull from. Point Settings at your Obsidian vault to get graph and search for free; with no path set, Luna uses `<project>/.luna/vault` for project files and the app data folder for the shared memory. Team-prompt leaders are told to call `memory_search` before they start.

## Roll-up

The Summaries tab runs your chosen CLI headless (`claude -p` or `codex exec`) over all summaries since the last roll-up, saves the result under `rollups/`, and drops it in every connected agent's inbox. MCP is disabled for that run so the summarizer never re-enters the hub.
