import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

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

/** "a.ts" in a folder that already has one becomes "a 2.ts", then "a 3.ts". */
export function uniqueName(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name
  const m = name.match(/^(.+?)(\.[^.]*)?$/)
  const stem = m?.[1] ?? name
  const ext = m?.[2] ?? ''
  for (let i = 2; ; i++) if (!taken(`${stem} ${i}${ext}`)) return `${stem} ${i}${ext}`
}

/** Make a file (empty) or a folder; a taken name gets a number. Returns the path made. */
export function create(dir: string, name: string, folder: boolean): string {
  const path = join(dir, uniqueName(name, (n) => existsSync(join(dir, n))))
  if (folder) mkdirSync(path, { recursive: true })
  else {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '')
  }
  return path
}

/** Rename in place; refuses to overwrite. Returns the new path. */
export function rename(path: string, name: string): string {
  const next = join(dirname(path), name)
  if (next === path) return path
  if (existsSync(next)) throw new Error(`${name} already exists`)
  renameSync(path, next)
  return next
}
