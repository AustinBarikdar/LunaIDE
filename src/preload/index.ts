import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { LunaApi } from './index.d'

const on = <A extends unknown[]>(ch: string, cb: (...a: A) => void): (() => void) => {
  const h = (_e: IpcRendererEvent, ...a: unknown[]): void => cb(...(a as A))
  ipcRenderer.on(ch, h)
  return () => ipcRenderer.off(ch, h)
}

const api: LunaApi = {
  search: {
    files: (request) => ipcRenderer.invoke('search-files', request),
    text: (request) => ipcRenderer.invoke('search-text', request),
    cancel: (id) => ipcRenderer.send('search-cancel', id)
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins-list'),
    agents: () => ipcRenderer.invoke('plugins-agents'),
    toggle: (n, e) => ipcRenderer.invoke('plugins-toggle', n, e),
    remove: (n) => ipcRenderer.invoke('plugins-remove', n),
    installFolder: () => ipcRenderer.invoke('plugins-install-folder'),
    installGit: (u) => ipcRenderer.invoke('plugins-install-git', u),
    create: (manifest) => ipcRenderer.invoke('plugins-create', manifest),
    reveal: (name) => ipcRenderer.invoke('plugins-reveal', name),
    export: (name) => ipcRenderer.invoke('plugins-export', name),
    refresh: () => ipcRenderer.invoke('plugins-refresh'),
    onChanged: (cb) => on('plugins-changed', cb),
    openDir: () => ipcRenderer.invoke('plugins-open-dir')
  },
  lsp: {
    open: (p, t) => ipcRenderer.invoke('lsp-open', p, t),
    change: (p, t) => ipcRenderer.invoke('lsp-change', p, t),
    close: (p) => ipcRenderer.invoke('lsp-close', p),
    complete: (p, l, c) => ipcRenderer.invoke('lsp-complete', p, l, c),
    hover: (p, l, c) => ipcRenderer.invoke('lsp-hover', p, l, c),
    definition: (p, l, c) => ipcRenderer.invoke('lsp-definition', p, l, c),
    onDiagnostics: (cb) => on('lsp-diagnostics', cb)
  },
  activity: {
    list: () => ipcRenderer.invoke('activity-list'),
    clear: () => ipcRenderer.invoke('activity-clear'),
    say: (to, text) => ipcRenderer.invoke('activity-say', to, text),
    onChanged: (cb) => on('activity-changed', cb)
  },
  vault: {
    graph: () => ipcRenderer.invoke('vault-graph')
  },
  git: {
    status: () => ipcRenderer.invoke('git', 'status'),
    init: () => ipcRenderer.invoke('git', 'init'),
    setRemote: (url) => ipcRenderer.invoke('git', 'setRemote', url),
    commit: (m) => ipcRenderer.invoke('git', 'commit', m),
    push: () => ipcRenderer.invoke('git', 'push'),
    pull: () => ipcRenderer.invoke('git', 'pull'),
    publish: () => ipcRenderer.invoke('git', 'publish'),
    branches: () => ipcRenderer.invoke('git', 'branches'),
    checkout: (name) => ipcRenderer.invoke('git', 'checkout', name),
    createBranch: (name) => ipcRenderer.invoke('git', 'createBranch', name),
    diff: (path) => ipcRenderer.invoke('git', 'diff', path),
    discard: (code, path) => ipcRenderer.invoke('git', 'discard', code, path),
    log: () => ipcRenderer.invoke('git', 'log'),
    show: (hash) => ipcRenderer.invoke('git', 'show', hash),
    gh: () => ipcRenderer.invoke('git', 'gh'),
    ghCreate: (name, visibility) => ipcRenderer.invoke('git', 'ghCreate', name, visibility)
  },
  summaries: {
    list: () => ipcRenderer.invoke('summaries-list'),
    clear: () => ipcRenderer.invoke('summaries-clear'),
    rollups: () => ipcRenderer.invoke('rollups-list'),
    rollup: () => ipcRenderer.invoke('rollup'),
    onChanged: (cb) => on('vault-changed', cb)
  },
  hub: {
    status: () => ipcRenderer.invoke('hub-status'),
    onStatus: (cb) => on('hub-status', cb)
  },
  agents: {
    dispatch: (leader, prompt, coders) =>
      ipcRenderer.invoke('team-dispatch', leader, prompt, coders),
    status: (a) => ipcRenderer.invoke('agents-status', a),
    preview: (a) => ipcRenderer.invoke('agents-preview', a),
    register: (a) => ipcRenderer.invoke('agents-register', a)
  },
  openFolder: () => ipcRenderer.invoke('open-folder'),
  currentProject: () => ipcRenderer.invoke('project-get'),
  popout: {
    open: (view) => ipcRenderer.invoke('popout-open', view),
    reveal: (rel, diff) => ipcRenderer.invoke('popout-reveal', rel, diff),
    onReveal: (cb) => on('popout-reveal', cb)
  },
  openProject: (dir) => ipcRenderer.invoke('open-project', dir),
  pickDir: () => ipcRenderer.invoke('pick-dir'),
  readDir: (p) => ipcRenderer.invoke('read-dir', p),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  writeFile: (p, c) => ipcRenderer.invoke('write-file', p, c),
  fs: {
    create: (dir, name, folder) => ipcRenderer.invoke('fs-create', dir, name, folder),
    rename: (p, name) => ipcRenderer.invoke('fs-rename', p, name),
    trash: (p) => ipcRenderer.invoke('fs-trash', p),
    reveal: (p) => ipcRenderer.invoke('fs-reveal', p),
    exists: (p) => ipcRenderer.invoke('fs-exists', p),
    home: () => ipcRenderer.invoke('home-dir')
  },
  contextMenu: (items) => ipcRenderer.invoke('context-menu', items),
  onFileChanged: (cb) => on('file-changed', cb),
  settings: {
    get: () => ipcRenderer.invoke('settings-get'),
    save: (patch) => ipcRenderer.invoke('settings-save', patch)
  },
  pty: {
    spawn: (id, cwd, agent) => ipcRenderer.send('pty-spawn', id, cwd, agent),
    attach: (id) => ipcRenderer.invoke('pty-attach', id),
    write: (id, data) => ipcRenderer.send('pty-write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty-resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty-kill', id),
    onData: (cb) => on('pty-data', cb),
    onExit: (cb) => on('pty-exit', cb),
    onAgent: (cb) => on('pty-agent', cb)
  }
}

contextBridge.exposeInMainWorld('luna', api)
