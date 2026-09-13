import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type Entry = { name: string; path: string; dir: boolean }

const SKIP = new Set(['node_modules', '.git', 'out', 'dist', '.DS_Store', '.eslintcache'])

export function readDir(path: string): Entry[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((d) => !SKIP.has(d.name))
    .map((d) => ({ name: d.name, path: join(path, d.name), dir: d.isDirectory() }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
}

export const readFile = (path: string): string => readFileSync(path, 'utf8')
export const writeFile = (path: string, content: string): void => writeFileSync(path, content)
