// Luna plugins: a folder with luna-plugin.json. Installed under <userData>/plugins/<name>.
// Share one by pushing the folder to git; others install it by URL. No registry, no build step.
import { app, dialog, shell } from 'electron'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs'
import { basename, join } from 'path'
import { tmpdir } from 'os'
import {
  parsePluginManifest,
  type PluginManifest as Manifest,
  type Plugin,
  type PluginAgent
} from '../shared/plugins'
import { sh, q } from './shell'
import type { ServerConfig } from './lsp'
import { getSettings, saveSettings } from './settings'

export const pluginsDir = (): string => {
  const d = join(app.getPath('userData'), 'plugins')
  mkdirSync(d, { recursive: true })
  return d
}

export function listPlugins(): Plugin[] {
  const disabled = new Set(getSettings().disabledPlugins)
  return readdirSync(pluginsDir(), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => {
      const dir = join(pluginsDir(), e.name)
      try {
        const manifest = readManifest(dir)
        return { dir, manifest, enabled: !disabled.has(manifest.name) }
      } catch (err) {
        return {
          dir,
          manifest: { name: e.name },
          enabled: false,
          error: String((err as Error).message ?? err)
        }
      }
    })
}

/** Language servers contributed by enabled plugins, ready to merge into the LSP config. */
export const pluginServers = (): ServerConfig[] =>
  listPlugins()
    .filter((p) => p.enabled && !p.error)
    .flatMap((p) =>
      (p.manifest.languageServers ?? []).map((s, i) => ({
        id: `plugin:${p.manifest.name}:${i}`,
        name: `${s.name} (${p.manifest.name})`,
        enabled: true,
        kind: 'lsp' as const,
        command: s.command,
        args: s.args ?? ['--stdio'],
        exts: s.exts.map((x) => x.replace(/^\./, '').toLowerCase())
      }))
    )

export const pluginAgents = (): PluginAgent[] =>
  listPlugins()
    .filter((p) => p.enabled && !p.error)
    .flatMap((p) => p.manifest.agents ?? [])

export function setEnabled(name: string, enabled: boolean): void {
  const cur = new Set(getSettings().disabledPlugins)
  if (enabled) cur.delete(name)
  else cur.add(name)
  saveSettings({ disabledPlugins: [...cur] })
}

export function remove(name: string): void {
  const p = listPlugins().find((x) => x.manifest.name === name || basename(x.dir) === name)
  if (p) rmSync(p.dir, { recursive: true, force: true })
}

function readManifest(dir: string): Manifest {
  return parsePluginManifest(JSON.parse(readFileSync(join(dir, 'luna-plugin.json'), 'utf8')))
}

function assertAvailable(name: string): void {
  if (existsSync(join(pluginsDir(), name)) || listPlugins().some((p) => p.manifest.name === name)) {
    throw new Error(
      `A plugin named ${name} is already installed. Choose another name or remove the existing plugin first.`
    )
  }
}

/** Validate and stage before publishing; never merge into an existing installation. */
function installDirectory(src: string): string {
  const manifest = readManifest(src)
  assertAvailable(manifest.name)
  const stage = mkdtempSync(join(pluginsDir(), '.install-'))
  try {
    const payload = join(stage, 'plugin')
    cpSync(src, payload, { recursive: true })
    readManifest(payload)
    assertAvailable(manifest.name)
    renameSync(payload, join(pluginsDir(), manifest.name))
    setEnabled(manifest.name, true)
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
  return `Installed ${manifest.name}.`
}

export async function installFromFolder(): Promise<string> {
  const r = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    message: 'Pick a folder containing luna-plugin.json'
  })
  if (r.canceled || !r.filePaths[0]) return 'Cancelled.'
  return installDirectory(r.filePaths[0])
}

export async function installFromGit(input: string): Promise<string> {
  const url = input.trim()
  if (!/^(https?:\/\/|ssh:\/\/|git@[a-z0-9.-]+:)/i.test(url)) {
    throw new Error('Enter an HTTPS or SSH Git repository URL.')
  }
  const stage = mkdtempSync(join(tmpdir(), 'luna-plugin-'))
  try {
    const src = join(stage, 'plugin')
    const r = await sh(`git clone --depth 1 -- ${q(url)} ${q(src)}`)
    if (r.code !== 0) throw new Error(`Git clone failed:\n${r.out.slice(-600)}`)
    return installDirectory(src)
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

/** Create a ready-to-use plugin from the visual builder. */
export function create(input: unknown): string {
  const manifest = parsePluginManifest(input)
  if (!manifest.agents?.length && !manifest.languageServers?.length) {
    throw new Error('Add an agent or language server to your plugin.')
  }
  assertAvailable(manifest.name)
  const stage = mkdtempSync(join(tmpdir(), 'luna-create-plugin-'))
  try {
    writeFileSync(join(stage, 'luna-plugin.json'), JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(
      join(stage, 'README.md'),
      `# ${manifest.name}\n\n${manifest.description ?? ''}\n\nInstall this folder from Luna → Settings → Extensions → Plugins.\n\nCommands used by this plugin must already be installed and available on PATH.\n\nTo share, push this folder to a Git repository and share its URL.\n`
    )
    installDirectory(stage)
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
  return `Created and enabled ${manifest.name}.`
}

export function reveal(name: string): void {
  const plugin = listPlugins().find((p) => p.manifest.name === name)
  if (!plugin) throw new Error('Plugin not found.')
  shell.showItemInFolder(join(plugin.dir, 'luna-plugin.json'))
}

export async function exportPlugin(name: string): Promise<string> {
  const plugin = listPlugins().find((p) => p.manifest.name === name)
  if (!plugin) throw new Error('Plugin not found.')
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    message: 'Choose a folder to export this plugin into'
  })
  if (result.canceled || !result.filePaths[0]) return 'Cancelled.'
  const dest = join(result.filePaths[0], basename(plugin.dir))
  if (existsSync(dest))
    throw new Error('That folder already exists. Choose another export location.')
  cpSync(plugin.dir, dest, { recursive: true, force: false, errorOnExist: true })
  shell.showItemInFolder(dest)
  return `Exported ${plugin.manifest.name} to ${dest}.`
}

export const openDir = (): Promise<string> => shell.openPath(pluginsDir())
