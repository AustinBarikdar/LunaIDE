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

- **Agent view**: no editor. Workspaces run as tabs across the top, and terminals carry names of their own: double-click either to rename (call one "Frontend" and another "Backend"). A renamed terminal keeps the hub identity agents address it by, shown next to its name, and each holds agent terminals docked with draggable dividers. Three layouts sit in the workspace bar: **Grid** balances them (two side by side, four corners at three or four, three across from five up), **Columns** keeps them all in one row, **Rows** stacks them. Drag any divider to size a pane; Luna remembers the sizes per workspace and layout, including after a restart.
- **IDE view**: files, editor, and the terminals as tabs in a bottom panel.

Terminals belong to Luna, not to a view: switching views or workspaces keeps every agent running and replays its recent output when it comes back on screen.

## Layout

- Left edge: activity buttons that switch the sidebar between **Files**, **Git** (init / commit / push / pull / history), **Summaries** (agent posts with diffs + roll-up), **Agents** (hub status + registration) and **Settings** (vault path, hub port, summarizer). Click the active one to collapse the sidebar. **Terms** at the bottom hides the editor for a terminal-only layout.
- Center: CodeMirror editor (⌘S saves). Bottom: terminals (login shells, so `claude` and `codex` are on PATH) with one-click **Claude** / **Codex** launch buttons.
- Clicking a file name inside a summary's diff opens it in the editor with added lines highlighted green and removed lines shown in red where they were.
- The **+** button in the bottom-right corner blooms into a quick menu: jump to any view, flip Agent/IDE view, launch Claude or Codex, open Settings (⌘,).

## Make it yours

**Dark mode** lives in Settings → Appearance: light, dark, or follow the system. It carries the editor and the terminals with it.

**Drag things where you want them.** Tabs slide side to side under the cursor: workspace tabs, editor tabs and terminal tabs all reorder by grabbing one and moving it, with a caret showing where it will land (drop past either end to send it there). The view buttons on the left edge and the terminal tiles reorder by dragging too. Drag one terminal onto another to swap their places in the grid. The rail order and the workspace order are remembered.

**Move the panes too.** IDE view has five slots: the side panel, the editor, a panel to the right of the editor, the bottom panel, and the corner beside it. The right one starts empty, as a thin strip that says **Drag a panel here**; drop anything into it and it opens up.

**Fold any of them away.** Hovering a pane shows two small controls on its left edge: the grip to drag it, and an arrow to fold it. A folded pane slides shut into a labelled strip with an arrow to bring it back, so you can hide the file tree while you work and get it back with one click. Dragging a divider all the way shut folds the pane the same way, and what you folded is still folded next time you open Luna. Every pane has a grip on its left edge that appears when you hover it. Drag one pane onto another slot and the two swap, so the terminals can sit on the left, the editor at the bottom, or the file tree beside the problems list. While you drag, the pane you picked up fades and the pane under the cursor turns into a translucent slot that names what is about to land there; the contents fade in when you let go. The arrangement is remembered; **Reset pane layout** in the quick menu (or the command palette) puts it back.

**Pop a view out.** The last button on the left edge tears the current view off into its own window: Files, Source control, Summaries, Team, or Problems. It stays live, since both windows talk to the same Luna. Clicking a file there opens it in the main window's editor. Terminals stay in the main window.

## Editor

A tab with unsaved edits shows a dot. Closing it, with the **×** or ⌘W, asks whether to save first; **Close Saved Tabs** in the command palette closes everything that is clean and leaves the rest open. ⌘S saves the active file and ⌘⇧S saves them all.

Settings → **Editor** holds the editor font size, the terminal font size, the tab size, **Word wrap**, and **Autosave**, which writes a file on its own about a second after typing stops (nothing ever asks then). Every one of them applies at once, terminals already running included.

A Markdown file has a **Preview** button in the tab bar that shows it rendered in place of the source; **Edit** brings the source back.

## Files

Right-click anywhere in the Files view for the usual file operations: **New File** and **New Folder** (made next to what you clicked, and the name is ready to type over), **Rename** in place, **Move to Trash** (so a slip is undoable from the Trash), **Reveal in Finder**, **Copy Path** or **Copy Relative Path**, and **Open Terminal Here**, which starts a shell in that folder. Open editor tabs follow a rename, including everything under a renamed folder, and close when their file goes to the Trash.

## Status bar and quick search

The thin bottom status bar is available in both views. It shows the Git branch, error and warning counts, Search, and hub connection. IDE mode also shows the active cursor position and file language. Click the branch for Source Control, the problem counts for Problems, or the hub indicator for its settings.

| Shortcut (use Ctrl instead of ⌘ on Windows/Linux) | Action                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| ⌘P                                                | Find files by name or path; open files appear first for an empty query |
| ⌘⇧F                                               | Find text across the project, with match-case and whole-word options   |
| ⌘⇧P                                               | Find and run commands, including plugin agent launchers                |
| ⌘F                                                | Find within the current editor                                         |
| ⌘S / ⌘⇧S                                          | Save the active file / save every changed file                         |
| ⌘W                                                | Close the active tab, asking first if it has unsaved edits             |
| ⌘⇧] / ⌘⇧[                                         | Next / previous editor tab                                             |
| ⌘1 … ⌘9                                           | Jump to that editor tab                                                |

Use the popup's Files, Project Text, and Commands buttons to switch modes. Arrow keys navigate, Enter opens a result, and Escape closes the popup and restores focus. Opening a result in Agents mode switches to IDE mode and jumps to the file or match.

Project searches respect nested `.gitignore` files and skip generated folders, symlinks, binary files, and files larger than 1 MB. Unsaved open-file contents take precedence over disk contents. Results are capped at 100 files or 500 text matches; narrow the query when a limit notice appears. Project text search supports literal text only, without project-wide replacement or regular expressions.

## Source control

The Git view carries the branch, the working-tree changes, a commit box, and a **History** graph at the bottom.

The branch name is a menu: pick another branch to check it out (branches that exist only on origin are listed too and start tracking when picked), or choose **New branch…** to start one from where you are. A checkout that git refuses, because of uncommitted changes for instance, shows git's reason in the output box.

Each change in the **Changes** list opens in the editor when clicked, with the working-tree diff on the file. The undo arrow at the end of a row discards that change after a confirmation: a tracked file goes back to how HEAD has it, and a file that has no committed version (untracked, or added and not yet committed) goes to the Trash rather than being deleted outright. Each commit sits on a rail: a filled dot is on the remote, a hollow dot with a **local** chip is still only in your clone, and a line marks where the upstream branch has got to. Branch and tag names show as chips, and merges are labelled.

Click a commit to open it: the full message, every branch that contains it, and the diff in green and red. Click a file inside that diff to open it in the editor with the same highlighting.

**Push** sends the branch when it already tracks a remote one. When it does not, the button reads **Publish branch** and asks before creating the branch on origin. With no remote at all, the **GitHub** section uses the GitHub CLI: it creates the repository (private or public), wires it up as origin and pushes. If the CLI is installed but signed out, Luna opens a terminal running its login for you; if it isn't installed, paste a remote URL under **Remote** instead.

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

**Team prompt** sits at the top of the **Team** view, and the crown button in the title bar (or ⌘T, or the command palette) jumps straight to it. Every open agent terminal is a team member with its own hub identity: the first Claude terminal is `claude`, the second `claude-2`, and so on (Luna passes it as `LUNA_AGENT`; Claude sends it as an `X-Luna-Agent` header via `.mcp.json`, Codex via `env_http_headers`). Pick which terminal **plans** and tick which ones **code**, write the job, send. The planner is told to search shared memory, split the job, and delegate through `delegate`; if it is not also a coder it never writes code itself. Each task lands in that terminal's inbox and Luna types a nudge into it so it starts right away. Coders report back with `send_message` to the planner.

**Registration** lives in Settings → Agents (Register / Re-register with a preview of the exact changes). When you launch an agent that isn't registered yet, a notification in the bottom-right corner offers to do it in one click. Each terminal's identity travels in both the URL and a header, so a CLI that drops custom headers still identifies itself. Registration is read when the CLI starts, so restart terminals that were already running: until then they all report under the base name and share one inbox, which is what makes a planner appear to hand tasks to itself and read an empty inbox. The Team view flags a terminal whose identity never reaches the hub.

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

## Team view and vault graph

Every hub interaction (summaries, messages, delegated tasks, roll-ups, nudges, your dispatches) is appended to `<vault>/Luna/<project>/log.jsonl`. Below the team prompt, the **Team** view lists the agents (launch, registration, hub status), what each open terminal is working on right now, and the activity: the agents as a live network with animated arcs for recent messages, above a timeline or a chat-style feed of who said what to whom. **Clear** empties the log for the project. In the Chat tab a composer at the top queues a note of your own: pick an agent (the current team leader comes first) and Luna drops it in that agent's inbox and nudges its terminal to read it, so you can change course mid-job without interrupting the run.

The **Vault graph** button (activity bar) opens an Obsidian-style force graph of the vault: agents, summaries, roll-ups, memory notes, and inboxes, linked by authorship, `[[wikilinks]]`, and which summaries each roll-up covered. Drag to arrange, double-click a node to open the file in the editor.

Register from Settings → Agents. For Claude Code that writes `.mcp.json` plus a `UserPromptSubmit` hook in `.claude/settings.local.json` that tells Claude when its inbox has mail. For Codex it runs `codex mcp add luna --url …`.

## Vault

`<vault>/Luna/<project>/{summaries,inbox,memory,rollups}` as plain markdown, plus a universal `<vault>/Luna/shared/memory/` that every project and agent can pull from. Point Settings at your Obsidian vault to get graph and search for free; with no path set, Luna uses `<project>/.luna/vault` for project files and the app data folder for the shared memory. Team-prompt leaders are told to call `memory_search` before they start.

## Notes on the code

A summary can carry `notes`: one per meaningful line an agent added or removed, each with an exact snippet of that line and a plain-language reason, listed in the order the change flows. In the Summaries view a post shows its **How it flows** steps right under the title, with an **Explain on code** button in its header; the prose follows, and the raw diff is folded behind a toggle so the list stays short and quick. Click a step (or the button) and the file opens with the diff highlighted, every note drawn as a bubble under the line it explains, and a step bar under the editor tabs that walks the flow with previous and next, opening other files as the steps move into them. A note about a removal hangs off the red line. The idea is that someone who does not know the codebase can read a change top to bottom without opening anything else. **Clear** in the Summaries header deletes the posts (roll-ups stay), after a confirmation.

## Roll-up

The Summaries tab runs your chosen CLI headless (`claude -p` or `codex exec`) over all summaries since the last roll-up, saves the result under `rollups/`, and drops it in every connected agent's inbox. MCP is disabled for that run so the summarizer never re-enters the hub.
