export type Entry = { name: string; path: string; dir: boolean }
export type Settings = {
  vaultPath: string
  /** 'system' follows the OS appearance. */
  theme: 'light' | 'dark' | 'system'
  /** Write a file on its own a moment after typing stops. */
  autosave: boolean
  editorFontSize: number
  tabSize: number
  wordWrap: boolean
  terminalFontSize: number
  hubPort: number
  summarizer: 'claude' | 'codex'
  summarizerModel: string
  recentProjects: string[]
  languageServers: ServerConfig[]
  disabledPlugins: string[]
}
export type ServerConfig = {
  id: string
  name: string
  enabled: boolean
  kind: 'lsp' | 'eslint'
  builtin?: 'ts' | 'json' | 'css' | 'html'
  command?: string
  args?: string[]
  exts: string[]
}
export type LspDiagnostic = {
  from: { line: number; ch: number }
  to: { line: number; ch: number }
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source?: string
}
export type LspCompletion = { label: string; detail?: string; kind?: number; insert?: string }

export type HubStatus = {
  live: string[]
  running: boolean
  port: number
  project: string
  agents: Record<string, number>
  /** Why the hub is not listening, e.g. the port is taken by another Luna. */
  error?: string
}
export type AgentName = 'claude' | 'codex'
export type Preview = { title: string; body: string }[]

/** A plain-language note pinned to one line an agent added or removed; ordered notes are the flow. */
export type Note = { file: string; anchor: string; why: string; kind?: 'added' | 'removed' }
export type Summary = {
  file: string
  agent: string
  time: string
  title: string
  body: string
  notes: Note[]
}
export type Rollup = { file: string; body: string }

export type GitStatus = {
  repo: boolean
  branch: string
  upstream: string
  remote: string
  ahead: number
  behind: number
  changes: { code: string; path: string }[]
}
export type Commit = {
  hash: string
  short: string
  author: string
  when: string
  subject: string
  parents: string[]
  refs: string[]
  /** Not on the upstream branch yet: it lives only in this clone. */
  local: boolean
}
export type GitLog = { commits: Commit[]; upstream: string }
export type CommitDetail = {
  hash: string
  short: string
  author: string
  email: string
  when: string
  subject: string
  body: string
  /** Branches (local and remote) that contain this commit. */
  branches: string[]
  diff: string
}
export type GhStatus = { installed: boolean; loggedIn: boolean; account: string }
export type GitResult = { code: number; out: string }

export type ActivityEvent = {
  t: string
  kind: 'summary' | 'message' | 'task' | 'rollup' | 'dispatch' | 'nudge' | 'memory'
  from: string
  to?: string
  title?: string
  text: string
}
export type GraphNode = {
  id: string
  label: string
  type: 'agent' | 'summary' | 'rollup' | 'memory' | 'inbox'
  path?: string
  size: number
}
export type Graph = { nodes: GraphNode[]; edges: { a: string; b: string }[] }

export type { Plugin, PluginAgent, PluginManifest } from '../shared/plugins'
import type { Plugin, PluginAgent, PluginManifest } from '../shared/plugins'

export type { SearchMode, SearchRequest, SearchResponse, SearchResult } from '../shared/search'
import type { SearchRequest, SearchResponse } from '../shared/search'

export interface LunaApi {
  search: {
    files(request: SearchRequest): Promise<SearchResponse>
    text(request: SearchRequest): Promise<SearchResponse>
    cancel(id: string): void
  }
  plugins: {
    list(): Promise<Plugin[]>
    agents(): Promise<PluginAgent[]>
    toggle(name: string, enabled: boolean): Promise<void>
    remove(name: string): Promise<void>
    installFolder(): Promise<string>
    installGit(url: string): Promise<string>
    create(manifest: PluginManifest): Promise<string>
    reveal(name: string): Promise<void>
    export(name: string): Promise<string>
    refresh(): Promise<void>
    onChanged(cb: () => void): () => void
    openDir(): Promise<string>
  }
  lsp: {
    open(path: string, text: string): Promise<void>
    change(path: string, text: string): Promise<void>
    close(path: string): Promise<void>
    complete(path: string, line: number, ch: number): Promise<LspCompletion[]>
    /** Plain-text description of the symbol at line/ch (0-based), or ''. */
    hover(path: string, line: number, ch: number): Promise<string>
    /** Where the symbol at line/ch is defined; empty when the server has no answer. */
    definition(
      path: string,
      line: number,
      ch: number
    ): Promise<{ path: string; line: number; ch: number }[]>
    onDiagnostics(cb: (path: string, source: string, diags: LspDiagnostic[]) => void): () => void
  }
  activity: {
    list(): Promise<ActivityEvent[]>
    clear(): Promise<void>
    /** Queue a message from you in an agent's inbox and nudge its terminal. */
    say(to: string, text: string): Promise<string>
    onChanged(cb: () => void): () => void
  }
  vault: {
    graph(): Promise<Graph>
  }
  git: {
    status(): Promise<GitStatus>
    init(): Promise<GitResult>
    setRemote(url: string): Promise<GitResult>
    commit(message: string): Promise<GitResult>
    push(): Promise<GitResult>
    pull(): Promise<GitResult>
    /** Create this branch on origin and track it. */
    publish(): Promise<GitResult>
    /** Local branches first, then ones that exist only on the remote. */
    branches(): Promise<string[]>
    checkout(name: string): Promise<GitResult>
    createBranch(name: string): Promise<GitResult>
    /** Working-tree diff of one changed file. */
    diff(path: string): Promise<string>
    /** Drop a working-tree change; a file with no committed version goes to the Trash. */
    discard(code: string, path: string): Promise<GitResult>
    log(): Promise<GitLog>
    show(hash: string): Promise<CommitDetail>
    gh(): Promise<GhStatus>
    ghCreate(name: string, visibility: 'private' | 'public'): Promise<GitResult>
  }
  summaries: {
    list(): Promise<Summary[]>
    /** Delete every agent post; returns how many. Roll-ups stay. */
    clear(): Promise<number>
    rollups(): Promise<Rollup[]>
    rollup(): Promise<{ file: string; text: string }>
    onChanged(cb: () => void): () => void
  }
  hub: {
    status(): Promise<HubStatus>
    onStatus(cb: (s: HubStatus) => void): () => void
  }
  agents: {
    /** leader/coders are terminal identities (claude, claude-2, codex…) */
    dispatch(leader: string, prompt: string, coders: string[]): Promise<string>
    status(agent: AgentName): Promise<{ registered: boolean; outdated?: boolean }>
    preview(agent: AgentName): Promise<Preview>
    register(agent: AgentName): Promise<string>
  }
  openFolder(): Promise<string | null>
  /** The folder the app has open, for windows that were torn off. */
  currentProject(): Promise<string>
  popout: {
    /** Tear a view off into its own window. */
    open(view: string): Promise<void>
    /** Ask the main window to show a file (optionally with a diff). */
    reveal(rel: string, diff?: string): Promise<void>
    onReveal(cb: (rel: string, diff?: string) => void): () => void
  }
  openProject(dir: string): Promise<string>
  pickDir(): Promise<string | null>
  readDir(path: string): Promise<Entry[]>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  fs: {
    /** Make an empty file or a folder inside `dir`; a taken name gets a number. Returns its path. */
    create(dir: string, name: string, folder: boolean): Promise<string>
    /** Rename in place (refuses to overwrite). Returns the new path. */
    rename(path: string, name: string): Promise<string>
    trash(path: string): Promise<void>
    reveal(path: string): Promise<void>
    exists(path: string): Promise<boolean>
    home(): Promise<string>
  }
  /** Native popup at the cursor; resolves with the chosen id, '' if dismissed. `id: '-'` is a separator. */
  contextMenu(items: { id: string; label: string }[]): Promise<string>
  onFileChanged(cb: (path: string) => void): () => void
  settings: {
    get(): Promise<Settings>
    save(patch: Partial<Settings>): Promise<Settings>
  }
  pty: {
    spawn(id: string, cwd: string, agent?: string): void
    attach(id: string): Promise<string | null>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(cb: (id: string, data: string) => void): () => void
    onExit(cb: (id: string, code: number) => void): () => void
    /** Main renamed a terminal's hub identity because the one it asked for was taken. */
    onAgent(cb: (id: string, agent: string) => void): () => void
  }
}

declare global {
  interface Window {
    luna: LunaApi
  }
}
