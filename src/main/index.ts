import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { watch, writeFileSync, FSWatcher } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { readDir, readFile, writeFile, create as fsCreate, rename as fsRename } from './fs'
import {
  spawnPty,
  writePty,
  resizePty,
  killPty,
  killAll,
  sendToAgent,
  agentsWithTerminal,
  attachPty,
  setPtyListener
} from './pty'
import { getSettings, saveSettings } from './settings'
import {
  startHub,
  stopHub,
  setProject,
  hubStatus,
  HubStatus,
  setInboxHooks,
  knownAgents
} from './hub'
import { preview, register, status as agentStatus, AgentName } from './agents'
import { rollup } from './summarize'
import { ops as gitOps } from './git'
import * as lsp from './lsp'
import * as plugins from './plugins'
import { ProjectSearch } from './search'
import type { SearchRequest } from '../shared/search'
import {
  readSummaries,
  readRollups,
  vaultRoot,
  readEvents,
  graph,
  appendEvent,
  sendMessage,
  clearSummaries,
  safe as vaultSafe
} from './vault'

let win: BrowserWindow
let watcher: FSWatcher | undefined
let vaultWatcher: FSWatcher | undefined
let logWatcher: FSWatcher | undefined
let project = ''
const projectSearch = new ProjectSearch()
/** Built-in + user + plugin language servers, re-applied whenever any of them change. */
function configureLsp(): void {
  if (!project) return
  lsp.configure(
    [...getSettings().languageServers, ...plugins.pluginServers()],
    project,
    (path, source, diags) => win.webContents.send('lsp-diagnostics', path, source, diags)
  )
}
function pluginsChanged(): void {
  configureLsp()
  for (const w of everyWindow()) w.webContents.send('plugins-changed')
}

const notifyHub = (s: HubStatus): void => {
  for (const w of everyWindow()) w.webContents.send('hub-status', s)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    titleBarStyle: 'hiddenInset',
    // liquid glass: the desktop blurs through; CSS keeps the body transparent
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    trafficLightPosition: { x: 12, y: 12 },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((d) => {
    shell.openExternal(d.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Views the user can tear off into their own window. Terminals stay in the main window. */
const popouts = new Map<string, BrowserWindow>()

function openPopout(view: string): void {
  const open = popouts.get(view)
  if (open && !open.isDestroyed()) return open.focus()
  const w = new BrowserWindow({
    width: 560,
    height: 780,
    show: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  popouts.set(view, w)
  w.on('closed', () => popouts.delete(view))
  w.on('ready-to-show', () => w.show())
  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#popout=${view}`)
  else w.loadFile(join(__dirname, '../renderer/index.html'), { hash: `popout=${view}` })
}

/** Everything the main window broadcasts has to reach the torn-off windows too. */
const everyWindow = (): BrowserWindow[] =>
  [win, ...popouts.values()].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())

function openProject(dir: string): string {
  watcher?.close()
  // ponytail: recursive fs.watch is native on macOS; swap for chokidar if Linux support matters
  watcher = watch(dir, { recursive: true }, (_e, name) => {
    const rel = String(name ?? '')
    // build output and the local vault change constantly and would refresh the tree and re-run
    // git status for nothing; the vault has watchers of its own
    if (!rel || /node_modules|\.git\/|^(out|dist)\/|^\.luna\/vault\//.test(rel)) return
    if (/(^|\/)(eslint\.config\.[cm]?js|\.eslintrc[^/]*)$/.test(rel)) lsp.eslintConfigChanged()
    win.webContents.send('file-changed', join(dir, rel))
  })
  project = dir
  projectSearch.setProject(dir)
  setProject(dir)
  lsp.configure(getSettings().languageServers, dir, (path, source, diags) =>
    win.webContents.send('lsp-diagnostics', path, source, diags)
  )
  vaultWatcher?.close()
  vaultWatcher = watch(join(vaultRoot(dir), 'summaries'), () =>
    everyWindow().forEach((w) => w.webContents.send('vault-changed'))
  )
  logWatcher?.close()
  logWatcher = watch(vaultRoot(dir), (_e, name) => {
    if (String(name) === 'log.jsonl')
      everyWindow().forEach((w) => w.webContents.send('activity-changed'))
  })
  const recent = [dir, ...getSettings().recentProjects.filter((p) => p !== dir)].slice(0, 10)
  saveSettings({ recentProjects: recent })
  return dir
}

const INBOX_NUDGE =
  'Luna: you have a new message in your inbox. Call the luna read_inbox tool now and act on it.'

app.whenReady().then(() => {
  electronApp.setAppUserModelId('app.luna')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  ipcMain.handle('open-folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : openProject(r.filePaths[0])
  })
  ipcMain.handle('open-project', (_e, dir: string) => openProject(dir))
  ipcMain.handle('popout-open', (_e, view: string) => openPopout(view))
  ipcMain.handle('popout-reveal', (_e, rel: string, diff?: string) => {
    if (!win || win.isDestroyed()) return
    win.webContents.send('popout-reveal', rel, diff)
    win.focus()
  })
  ipcMain.handle('project-get', () => project)
  ipcMain.handle('pick-dir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('search-files', (_e, request: SearchRequest) =>
    projectSearch.run('files', request)
  )
  ipcMain.handle('search-text', (_e, request: SearchRequest) => projectSearch.run('text', request))
  ipcMain.on('search-cancel', (_e, id: string) => projectSearch.cancel(id))
  ipcMain.handle('read-dir', (_e, p: string) => readDir(p))
  ipcMain.handle('read-file', (_e, p: string) => readFile(p))
  ipcMain.handle('write-file', (_e, p: string, c: string) => writeFile(p, c))
  ipcMain.handle('fs-create', (_e, dir: string, name: string, folder: boolean) =>
    fsCreate(dir, name, folder)
  )
  ipcMain.handle('fs-rename', (_e, p: string, name: string) => fsRename(p, name))
  // to the Trash, so a wrong click is not final
  ipcMain.handle('fs-trash', (_e, p: string) => shell.trashItem(p))
  ipcMain.handle('fs-reveal', (_e, p: string) => shell.showItemInFolder(p))
  // ponytail: a native popup instead of a positioned div; resolves with the id picked, or ''
  ipcMain.handle('context-menu', (e, items: { id: string; label: string }[]) => {
    const window = BrowserWindow.fromWebContents(e.sender) ?? undefined
    return new Promise<string>((resolve) => {
      const menu = Menu.buildFromTemplate(
        items.map((i) =>
          i.id === '-'
            ? { type: 'separator' as const }
            : { label: i.label, click: () => resolve(i.id) }
        )
      )
      menu.popup({ window, callback: () => setTimeout(() => resolve(''), 0) })
    })
  })
  ipcMain.handle('settings-get', () => getSettings())
  ipcMain.handle('settings-save', async (_e, patch) => {
    const before = getSettings().hubPort
    const next = saveSettings(patch)
    if (next.hubPort !== before)
      await startHub(next.hubPort, notifyHub).catch((e) => console.error('hub', e))
    return next
  })
  ipcMain.handle('hub-status', () => hubStatus())
  ipcMain.handle('summaries-list', () => (project ? readSummaries(project, 50) : []))
  ipcMain.handle('summaries-clear', () => (project ? clearSummaries(project) : 0))
  ipcMain.handle('rollups-list', () => (project ? readRollups(project, 3) : []))
  ipcMain.handle('rollup', () => rollup(project))
  ipcMain.handle('git', (_e, op: keyof typeof gitOps, ...args: string[]) =>
    op === 'gh'
      ? gitOps.gh()
      : op === 'discard'
        ? gitOps.discard(project, args[0], args[1], (p) => shell.trashItem(p))
        : (gitOps[op] as (c: string, ...a: string[]) => unknown)(project, ...args)
  )
  ipcMain.handle('agents-preview', (_e, a: AgentName) => preview(a, project, hubStatus().port))
  ipcMain.handle('agents-status', (_e, a: AgentName) => agentStatus(a, project))
  ipcMain.handle('agents-register', (_e, a: AgentName) => register(a, project, hubStatus().port))

  ipcMain.on('pty-spawn', (e, id: string, cwd: string, agent?: string) =>
    spawnPty(id, cwd, e.sender, agent)
  )
  setPtyListener(() => notifyHub(hubStatus()))
  setInboxHooks((agent, from) => {
    // never prompt an agent about something it sent itself
    if (from && vaultSafe(from) === agent) return
    const ok = sendToAgent(agent, INBOX_NUDGE)
    if (ok && project)
      appendEvent(project, {
        kind: 'nudge',
        from: 'luna',
        to: agent,
        text: 'prompted terminal to read inbox'
      })
  }, agentsWithTerminal)
  ipcMain.handle('team-dispatch', (_e, leader: string, prompt: string, coders: string[] = []) => {
    const members = knownAgents().filter((a) => a !== leader)
    const codersList = coders.filter((c) => c !== leader)
    const leaderCodes = coders.includes(leader)
    const roles = codersList.length
      ? `Coders: ${codersList.join(', ')}. ${leaderCodes ? 'You are also a coder: keep a share of the implementation for yourself.' : 'You are the planner only: do NOT write code yourself. Break the job into self-contained coding tasks and hand every one of them out with the luna delegate tool (one call, all assignments), then review what comes back.'}`
      : `No separate coders were chosen: plan the work, then do the implementation yourself.`
    const composed =
      `You are the team leader (planner) for this project. Team members reachable through the luna MCP tools: ${members.join(', ') || '(none yet; call list_agents to check)'}. ${roles} ` +
      `First call the luna memory_search tool with a few keywords from the job to pull in what the team already knows (shared vault + past summaries). Each delegated task must include the files to touch and acceptance criteria; coders cannot see your context. ` +
      `When you finish your part, call post_summary with the files you changed and \`notes\` that explain each added or removed line in plain language, in the order the change flows — the developer reads those as numbered bubbles on the code. Team members report back to your inbox, so call read_inbox before declaring the whole job done.

THE JOB:
${prompt}`
    const ok = sendToAgent(leader, composed)
    if (ok)
      appendEvent(project, {
        kind: 'dispatch',
        from: 'you',
        to: leader,
        title: codersList.length
          ? `planner ${leader} · coders ${coders.join(', ')}`
          : `leader ${leader}`,
        text: prompt
      })
    return ok
      ? `Sent to ${leader}'s terminal.`
      : `No ${leader} terminal is open. Launch it from the Agents view first.`
  })
  ipcMain.handle('plugins-list', () => plugins.listPlugins())
  ipcMain.handle('plugins-agents', () => plugins.pluginAgents())
  ipcMain.handle('plugins-toggle', (_e, name: string, enabled: boolean) => {
    plugins.setEnabled(name, enabled)
    pluginsChanged()
  })
  ipcMain.handle('plugins-remove', (_e, name: string) => {
    plugins.remove(name)
    pluginsChanged()
  })
  ipcMain.handle('plugins-install-folder', async () => {
    const r = await plugins.installFromFolder()
    pluginsChanged()
    return r
  })
  ipcMain.handle('plugins-install-git', async (_e, url: string) => {
    const r = await plugins.installFromGit(url)
    pluginsChanged()
    return r
  })
  ipcMain.handle('plugins-create', (_e, manifest: unknown) => {
    const result = plugins.create(manifest)
    pluginsChanged()
    return result
  })
  ipcMain.handle('plugins-reveal', (_e, name: string) => plugins.reveal(name))
  ipcMain.handle('plugins-export', (_e, name: string) => plugins.exportPlugin(name))
  ipcMain.handle('plugins-refresh', () => pluginsChanged())
  ipcMain.handle('plugins-open-dir', () => plugins.openDir())
  ipcMain.handle('lsp-open', (_e, path: string, text: string) => lsp.open(path, text))
  ipcMain.handle('lsp-change', (_e, path: string, text: string) => lsp.change(path, text))
  ipcMain.handle('lsp-close', (_e, path: string) => lsp.close(path))
  ipcMain.handle('lsp-complete', (_e, path: string, line: number, ch: number) =>
    lsp.complete(path, line, ch)
  )
  ipcMain.handle('activity-list', () => (project ? readEvents(project) : []))
  ipcMain.handle('activity-clear', () => {
    if (project) writeFileSync(join(vaultRoot(project), 'log.jsonl'), '')
  })
  // ponytail: a user chat line = inbox message from "you" + the same nudge the hub uses.
  ipcMain.handle('activity-say', (_e, to: string, text: string) => {
    if (!project) return 'Open a project first.'
    sendMessage(project, 'you', to, text)
    appendEvent(project, { kind: 'message', from: 'you', to, text })
    const ok = sendToAgent(to, INBOX_NUDGE)
    return ok
      ? `Queued for ${to}.`
      : `Queued in ${to}'s inbox; it reads it when a terminal is open.`
  })
  ipcMain.handle('vault-graph', () => (project ? graph(project) : { nodes: [], edges: [] }))
  ipcMain.handle('pty-attach', (_e, id: string) => attachPty(id))
  ipcMain.on('pty-write', (_e, id: string, data: string) => writePty(id, data))
  ipcMain.on('pty-resize', (_e, id: string, cols: number, rows: number) =>
    resizePty(id, cols, rows)
  )
  ipcMain.on('pty-kill', (_e, id: string) => killPty(id))

  createWindow()
  startHub(getSettings().hubPort, notifyHub).catch((e) => console.error('hub', e))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  lsp.stopAll()
  killAll()
  stopHub()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
