import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { setImmediate as yieldToEvents } from 'node:timers/promises'
import ignore, { type Ignore } from 'ignore'
import type { SearchRequest, SearchResponse, SearchResult } from '../shared/search'

const SKIP = new Set(['node_modules', '.git', 'out', 'dist', '.DS_Store', '.eslintcache'])
const MAX_BYTES = 1024 * 1024
const empty = (cancelled = false): SearchResponse => ({ results: [], truncated: false, cancelled })
type Rule = { directory: string; matcher: Ignore }

async function* walk(
  directory: string,
  rules: Rule[],
  signal: AbortSignal
): AsyncGenerator<string> {
  signal.throwIfAborted()
  const ignorePath = join(directory, '.gitignore')
  const ignoreStat = await lstat(ignorePath).catch(() => null)
  if (ignoreStat?.isFile() && ignoreStat.size <= MAX_BYTES) {
    const contents = await readFile(ignorePath, { encoding: 'utf8', signal }).catch(() => '')
    rules = [...rules, { directory, matcher: ignore().add(contents) }]
  }
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    signal.throwIfAborted()
    if (SKIP.has(entry.name) || entry.isSymbolicLink()) continue
    const path = join(directory, entry.name)
    let ignored = false
    for (const rule of rules) {
      const local =
        relative(rule.directory, path).split(sep).join('/') + (entry.isDirectory() ? '/' : '')
      const result = rule.matcher.test(local)
      if (result.ignored) ignored = true
      else if (result.unignored) ignored = false
    }
    if (ignored) continue
    if (entry.isDirectory()) yield* walk(path, rules, signal)
    else if (entry.isFile()) yield path
  }
}

/** Lower scores rank first: exact filename, filename prefix, path substring, then subsequence. */
export function fileScore(path: string, query: string): number {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const needle = query.trim().toLowerCase()
  const haystack = path.toLowerCase()
  if (!needle) return 0
  if (name === needle) return 0
  if (name.startsWith(needle)) return 1
  if (name.includes(needle)) return 2
  if (haystack.includes(needle)) return 3
  let index = 0
  for (const char of haystack) if (char === needle[index]) index++
  return index === needle.length ? 4 : Infinity
}

async function textFile(
  path: string,
  buffer: string | undefined,
  signal: AbortSignal
): Promise<string | null> {
  const stat = await lstat(path).catch(() => null)
  if (!stat?.isFile() || stat.size > MAX_BYTES) return null
  if (buffer !== undefined) {
    return Buffer.byteLength(buffer) <= MAX_BYTES && !buffer.includes('\0') ? buffer : null
  }
  const bytes = await readFile(path, { signal }).catch(() => {
    signal.throwIfAborted()
    return null
  })
  if (!bytes || bytes.length > MAX_BYTES || bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export async function searchProject(
  mode: 'files' | 'text',
  request: SearchRequest,
  signal: AbortSignal
): Promise<SearchResponse> {
  signal.throwIfAborted()
  if (mode === 'text' && !request.query) return empty()
  const root = resolve(request.project)
  const buffers = new Map(request.buffers.map((b) => [resolve(b.path), b.content]))
  const opened = new Map(request.openPaths.map((path, index) => [resolve(path), index]))
  const results: (SearchResult & { score: number; open: number })[] = []
  let truncated = false
  const limit = mode === 'files' ? 100 : 500
  const pattern = new RegExp(
    request.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    request.matchCase ? 'gu' : 'giu'
  )
  const wordBefore = /[\p{L}\p{N}_]$/u
  const wordAfter = /^[\p{L}\p{N}_]/u
  const compare = (a: (typeof results)[number], b: (typeof results)[number]): number =>
    a.score - b.score || a.open - b.open || a.relativePath.localeCompare(b.relativePath)
  for await (const path of walk(root, [], signal)) {
    signal.throwIfAborted()
    const relativePath = relative(root, path).split(sep).join('/')
    const score = mode === 'files' ? fileScore(relativePath, request.query) : 0
    if (!Number.isFinite(score)) continue
    const content = await textFile(path, buffers.get(path), signal)
    if (content === null) continue
    const common = { path, relativePath, score, open: opened.get(path) ?? Infinity }
    if (mode === 'files') {
      results.push(common)
      if (results.length > limit) {
        results.sort(compare)
        results.pop()
        truncated = true
      }
    } else {
      // Coordinates use CodeMirror's zero-based UTF-16 column offsets.
      const lines = content.split(/\r\n|\n|\r/)
      for (let line = 0; line < lines.length; line++) {
        if (line % 128 === 0) {
          await yieldToEvents()
          signal.throwIfAborted()
        }
        let matches = 0
        for (const match of lines[line].matchAll(pattern)) {
          if (++matches % 256 === 0) {
            await yieldToEvents()
            signal.throwIfAborted()
          }
          const column = match.index!
          if (
            request.wholeWord &&
            (wordBefore.test(lines[line].slice(Math.max(0, column - 2), column)) ||
              wordAfter.test(
                lines[line].slice(column + match[0].length, column + match[0].length + 2)
              ))
          )
            continue
          if (results.length === limit) {
            truncated = true
            break
          }
          const start = Math.max(0, column - 60)
          results.push({
            ...common,
            line,
            column,
            length: match[0].length,
            preview: (start ? '…' : '') + lines[line].slice(start, start + 240)
          })
        }
        if (truncated) break
      }
      if (truncated) break
    }
  }
  signal.throwIfAborted()
  if (mode === 'files') results.sort(compare)
  return {
    results: results.map(({ path, relativePath, line, column, length, preview }) => ({
      path,
      relativePath,
      line,
      column,
      length,
      preview
    })),
    truncated,
    cancelled: false
  }
}

/** One active popup search. Project changes and newer queries invalidate previous work. */
export class ProjectSearch {
  private project = ''
  private active: { id: string; controller: AbortController } | undefined

  setProject(project: string): void {
    this.active?.controller.abort()
    this.active = undefined
    this.project = resolve(project)
  }

  cancel(id: string): void {
    if (this.active?.id === id) this.active.controller.abort()
  }

  async run(mode: 'files' | 'text', request: SearchRequest): Promise<SearchResponse> {
    if (
      !request ||
      typeof request.id !== 'string' ||
      typeof request.project !== 'string' ||
      typeof request.query !== 'string' ||
      request.query.length > 1000 ||
      !Array.isArray(request.openPaths) ||
      !request.openPaths.every((p) => typeof p === 'string') ||
      !Array.isArray(request.buffers) ||
      !request.buffers.every(
        (b) => b && typeof b.path === 'string' && typeof b.content === 'string'
      )
    ) {
      throw new Error('Invalid search request.')
    }
    if (!this.project || resolve(request.project) !== this.project) return empty(true)
    this.active?.controller.abort()
    const active = { id: request.id, controller: new AbortController() }
    this.active = active
    try {
      const response = await searchProject(mode, request, active.controller.signal)
      return active.controller.signal.aborted ? empty(true) : response
    } catch (error) {
      if (active.controller.signal.aborted) return empty(true)
      throw error
    } finally {
      if (this.active === active) this.active = undefined
    }
  }
}
