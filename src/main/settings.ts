import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DEFAULT_SERVERS, type ServerConfig } from './lsp'

export type Settings = {
  vaultPath: string
  hubPort: number
  summarizer: 'claude' | 'codex'
  summarizerModel: string
  recentProjects: string[]
  languageServers: ServerConfig[]
  disabledPlugins: string[]
}

const defaults: Settings = {
  vaultPath: '',
  hubPort: 4141,
  summarizer: 'claude',
  summarizerModel: '',
  recentProjects: [],
  languageServers: DEFAULT_SERVERS,
  disabledPlugins: []
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2))
  return next
}
