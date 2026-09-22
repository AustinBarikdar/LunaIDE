// Minimal Language Server Protocol client: one server per language config, full-document sync,
// diagnostics + completion. Plus CLI linters (eslint --format json) that run on the buffer.
// ponytail: no incremental sync, no rename; add when someone misses them.
import { spawn, type ChildProcess } from 'child_process'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import { extname, dirname } from 'path'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection
} from 'vscode-jsonrpc/node'
import { sh, q } from './shell'
import {
  hoverText,
  definitionList,
  type Marked,
  type Location,
  type LspLocation,
  type LspLink
} from './lspText'

export type Diagnostic = {
  from: { line: number; ch: number }
  to: { line: number; ch: number }
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source?: string
}
export type Completion = { label: string; detail?: string; kind?: number; insert?: string }
export type ServerConfig = {
  id: string
  name: string
  enabled: boolean
  /** 'lsp' speaks LSP over stdio; 'eslint' runs the project's eslint as a CLI linter */
  kind: 'lsp' | 'eslint'
  /** bundled server id, or empty for a user-supplied command */
  builtin?: 'ts' | 'json' | 'css' | 'html'
  command?: string
  args?: string[]
  exts: string[]
}

export const DEFAULT_SERVERS: ServerConfig[] = [
  {
    id: 'ts',
    name: 'TypeScript & JavaScript',
    enabled: true,
    kind: 'lsp',
    builtin: 'ts',
    exts: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']
  },
  {
    id: 'eslint',
    name: 'ESLint (project install)',
    enabled: true,
    kind: 'eslint',
    exts: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']
  },
  { id: 'json', name: 'JSON', enabled: true, kind: 'lsp', builtin: 'json', exts: ['json'] },
  {
    id: 'css',
    name: 'CSS / SCSS / Less',
    enabled: true,
    kind: 'lsp',
    builtin: 'css',
    exts: ['css', 'scss', 'less']
  },
  { id: 'html', name: 'HTML', enabled: true, kind: 'lsp', builtin: 'html', exts: ['html', 'htm'] }
]

const LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  py: 'python',
  rs: 'rust',
  go: 'go',
  md: 'markdown'
}
const SEV = ['error', 'error', 'warning', 'info', 'hint'] as const

const req = createRequire(import.meta.url)
// bundled servers run on Electron's own node (ELECTRON_RUN_AS_NODE) so users need nothing installed
const BUILTIN: Record<NonNullable<ServerConfig['builtin']>, () => string> = {
  ts: () => req.resolve('typescript-language-server/lib/cli.mjs'),
  json: () => req.resolve('vscode-langservers-extracted/bin/vscode-json-language-server'),
  css: () => req.resolve('vscode-langservers-extracted/bin/vscode-css-language-server'),
  html: () => req.resolve('vscode-langservers-extracted/bin/vscode-html-language-server')
}

type Server = {
  proc: ChildProcess
  conn: MessageConnection
  ready: Promise<void>
  open: Set<string>
}
const servers = new Map<string, Server>()
const versions = new Map<string, number>()
let configs: ServerConfig[] = DEFAULT_SERVERS
let root = ''
let onDiag: (path: string, source: string, diags: Diagnostic[]) => void = () => {}

export function configure(list: ServerConfig[], project: string, cb: typeof onDiag): void {
  const changed = project !== root || JSON.stringify(list) !== JSON.stringify(configs)
  configs = list
  root = project
  onDiag = cb
  if (changed) stopAll()
}

export function stopAll(): void {
  for (const s of servers.values()) {
    s.conn.dispose()
    s.proc.kill()
  }
  servers.clear()
  versions.clear()
}

const forExt = (path: string, kind: ServerConfig['kind']): ServerConfig | undefined => {
  const ext = extname(path).slice(1).toLowerCase()
  return configs.find((c) => c.enabled && c.kind === kind && c.exts.includes(ext))
}

function start(cfg: ServerConfig): Server {
  const key = cfg.id
  const existing = servers.get(key)
  if (existing) return existing
  let proc: ChildProcess
  if (cfg.builtin) {
    proc = spawn(process.execPath, [BUILTIN[cfg.builtin](), '--stdio'], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
  } else {
    // user-installed server: go through the login shell so PATH matches their terminal
    proc = spawn(
      process.env.SHELL ?? '/bin/zsh',
      ['-lc', `${cfg.command} ${(cfg.args ?? []).map(q).join(' ')}`],
      { cwd: root }
    )
  }
  proc.stderr?.on('data', (d) => console.warn(`[lsp ${cfg.id}]`, String(d).slice(0, 300)))
  proc.on('exit', () => servers.delete(key))
  const conn = createMessageConnection(
    new StreamMessageReader(proc.stdout!),
    new StreamMessageWriter(proc.stdin!)
  )
  conn.onNotification(
    'textDocument/publishDiagnostics',
    (p: { uri: string; diagnostics: LspDiag[] }) => {
      onDiag(
        decodeURIComponent(new URL(p.uri).pathname),
        cfg.name,
        p.diagnostics.map((d) => ({
          from: { line: d.range.start.line, ch: d.range.start.character },
          to: { line: d.range.end.line, ch: d.range.end.character },
          severity: SEV[d.severity ?? 1],
          message: d.message,
          source: d.source ?? cfg.name
        }))
      )
    }
  )
  conn.onRequest('workspace/configuration', (p: { items: unknown[] }) => p.items.map(() => ({})))
  conn.onRequest('client/registerCapability', () => null)
  conn.onRequest('window/workDoneProgress/create', () => null)
  conn.onNotification(() => {})
  conn.listen()
  const ready = conn
    .sendRequest('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(root).href,
      workspaceFolders: [{ uri: pathToFileURL(root).href, name: root.split('/').pop() }],
      capabilities: {
        textDocument: {
          publishDiagnostics: {},
          synchronization: { didSave: true },
          completion: {
            completionItem: { snippetSupport: false, documentationFormat: ['plaintext'] }
          },
          hover: { contentFormat: ['plaintext', 'markdown'] },
          definition: {}
        },
        workspace: { configuration: true, workspaceFolders: true }
      },
      initializationOptions: cfg.builtin === 'json' ? { provideFormatter: false } : {}
    })
    .then(() => conn.sendNotification('initialized', {}))
  const s: Server = { proc, conn, ready, open: new Set() }
  servers.set(key, s)
  return s
}

type LspDiag = {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  severity?: number
  message: string
  source?: string
}

export async function open(path: string, text: string): Promise<void> {
  const cfg = forExt(path, 'lsp')
  if (cfg) {
    const s = start(cfg)
    await s.ready
    versions.set(path, 1)
    s.open.add(path)
    s.conn.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: pathToFileURL(path).href,
        languageId: LANG[extname(path).slice(1)] ?? 'plaintext',
        version: 1,
        text
      }
    })
  }
  void eslint(path, text)
}

export async function change(path: string, text: string): Promise<void> {
  const cfg = forExt(path, 'lsp')
  if (cfg) {
    const s = start(cfg)
    await s.ready
    if (!s.open.has(path)) return open(path, text)
    const v = (versions.get(path) ?? 1) + 1
    versions.set(path, v)
    s.conn.sendNotification('textDocument/didChange', {
      textDocument: { uri: pathToFileURL(path).href, version: v },
      contentChanges: [{ text }]
    })
  }
  void eslint(path, text)
}

export function close(path: string): void {
  const cfg = forExt(path, 'lsp')
  const s = cfg && servers.get(cfg.id)
  if (s?.open.has(path)) {
    s.open.delete(path)
    s.conn.sendNotification('textDocument/didClose', {
      textDocument: { uri: pathToFileURL(path).href }
    })
  }
  versions.delete(path)
}

export async function complete(path: string, line: number, ch: number): Promise<Completion[]> {
  const cfg = forExt(path, 'lsp')
  if (!cfg) return []
  const s = start(cfg)
  await s.ready
  if (!s.open.has(path)) return []
  const r = (await s.conn
    .sendRequest('textDocument/completion', {
      textDocument: { uri: pathToFileURL(path).href },
      position: { line, character: ch }
    })
    .catch(() => null)) as { items?: LspItem[] } | LspItem[] | null
  const items = Array.isArray(r) ? r : (r?.items ?? [])
  return items.slice(0, 60).map((i) => ({
    label: i.label,
    detail: i.detail,
    kind: i.kind,
    insert: i.insertText ?? i.textEdit?.newText
  }))
}
/** A ready server with the file open, or null when nothing speaks for this file. */
async function serverFor(path: string): Promise<Server | null> {
  const cfg = forExt(path, 'lsp')
  if (!cfg) return null
  const s = start(cfg)
  await s.ready
  return s.open.has(path) ? s : null
}
const at = (path: string, line: number, ch: number): object => ({
  textDocument: { uri: pathToFileURL(path).href },
  position: { line, character: ch }
})

/** What the server knows about the symbol under the cursor, as plain text ('' for nothing). */
export async function hover(path: string, line: number, ch: number): Promise<string> {
  const s = await serverFor(path)
  if (!s) return ''
  const r = (await s.conn
    .sendRequest('textDocument/hover', at(path, line, ch))
    .catch(() => null)) as { contents: Marked | Marked[] } | null
  return r ? hoverText(r.contents) : ''
}

export async function definition(path: string, line: number, ch: number): Promise<Location[]> {
  const s = await serverFor(path)
  if (!s) return []
  const r = (await s.conn
    .sendRequest('textDocument/definition', at(path, line, ch))
    .catch(() => null)) as LspLocation | LspLocation[] | LspLink[] | null
  return definitionList(r)
}

type LspItem = {
  label: string
  detail?: string
  kind?: number
  insertText?: string
  textEdit?: { newText: string }
}

/* ---------- eslint on the live buffer ---------- */
type EslintMessage = {
  line: number
  column: number
  endLine?: number
  endColumn?: number
  severity: number
  message: string
  ruleId?: string
}
type EslintApi = {
  lintText(text: string, opts: { filePath: string }): Promise<{ messages: EslintMessage[] }[]>
}
const eslintTimers = new Map<string, ReturnType<typeof setTimeout>>()
// ponytail: the project's own eslint, loaded once and kept. Spawning the CLI cost 1.2–2.2 s of CPU
// on every pause while typing (measured); the same lint through the API is ~15 ms once the
// config is loaded. Falls back to the CLI when the package cannot be loaded in-process.
let eslintApi: { root: string; api: EslintApi | null } | undefined
async function loadEslint(): Promise<EslintApi | null> {
  if (eslintApi && eslintApi.root === root) return eslintApi.api
  let api: EslintApi | null = null
  try {
    const req = createRequire(pathToFileURL(root + '/package.json').href)
    const mod = req('eslint') as { ESLint: new (o: { cwd: string }) => EslintApi }
    api = new mod.ESLint({ cwd: root })
  } catch {
    api = null
  }
  eslintApi = { root, api }
  return api
}
/** The linter config changed on disk: load it again on the next lint. */
export function eslintConfigChanged(): void {
  eslintApi = undefined
}
const toDiags = (messages: EslintMessage[]): Diagnostic[] =>
  messages.map((m) => ({
    from: { line: m.line - 1, ch: m.column - 1 },
    to: { line: (m.endLine ?? m.line) - 1, ch: (m.endColumn ?? m.column + 1) - 1 },
    severity: m.severity === 2 ? 'error' : 'warning',
    message: m.message + (m.ruleId ? `  (${m.ruleId})` : ''),
    source: 'eslint'
  }))
async function eslintCli(path: string, text: string): Promise<EslintMessage[] | null> {
  const r = await sh(`npx --no-install eslint --format json --stdin --stdin-filename ${q(path)}`, {
    cwd: dirname(path),
    input: text
  })
  const start = r.out.indexOf('[{')
  if (start < 0) return null // eslint not installed in this project, or no config: stay quiet
  try {
    const [file] = JSON.parse(r.out.slice(start)) as { messages: EslintMessage[] }[]
    return file?.messages ?? []
  } catch {
    return null
  }
}
async function eslint(path: string, text: string): Promise<void> {
  const cfg = forExt(path, 'eslint')
  if (!cfg || !root) return
  clearTimeout(eslintTimers.get(path))
  eslintTimers.set(
    path,
    setTimeout(async () => {
      const api = await loadEslint()
      let messages: EslintMessage[] | null = null
      if (api) {
        try {
          const [file] = await api.lintText(text, { filePath: path })
          messages = file?.messages ?? []
        } catch {
          messages = null // a config this build cannot load: try the CLI below
        }
      }
      if (messages === null) messages = await eslintCli(path, text)
      if (messages) onDiag(path, cfg.name, toDiags(messages))
    }, 400)
  )
}
