import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { basename, join } from 'path'
import { app } from 'electron'
import { getSettings } from './settings'

export type Summary = { file: string; agent: string; time: string; title: string; body: string }

export const safe = (s: string): string => s.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'unknown'
const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-')

/** <vault>/Luna/<project> with the four subfolders guaranteed to exist. */
export function vaultRoot(project: string): string {
  const base = getSettings().vaultPath || join(project, '.luna', 'vault')
  const root = join(base, 'Luna', basename(project))
  for (const d of ['summaries', 'inbox', 'memory', 'rollups'])
    mkdirSync(join(root, d), { recursive: true })
  return root
}

export function postSummary(
  project: string,
  agent: string,
  title: string,
  text: string,
  diff = ''
): string {
  const file = join(vaultRoot(project), 'summaries', `${stamp()}-${safe(agent)}.md`)
  const diffBlock = diff.trim() ? `\n\n\`\`\`diff\n${diff.trim()}\n\`\`\`\n` : ''
  writeFileSync(
    file,
    `---\nagent: ${agent}\ntime: ${new Date().toISOString()}\ntitle: ${title.replace(/\n/g, ' ')}\n---\n\n${text}${diffBlock}\n`
  )
  return file
}

/** Body without the captured diff fence — for the roll-up prompt and read_summaries. */
export const withoutDiff = (body: string): string =>
  body.replace(/\n*```diff\n[\s\S]*?\n```\n?/g, '').trim()

export function parseSummary(file: string): Summary {
  const raw = readFileSync(file, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  const meta: Record<string, string> = {}
  for (const line of (m?.[1] ?? '').split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i)] = line.slice(i + 1).trim()
  }
  return {
    file,
    agent: meta.agent ?? '?',
    time: meta.time ?? '',
    title: meta.title ?? '',
    body: (m?.[2] ?? raw).trim()
  }
}

export function readSummaries(project: string, limit = 20, after = ''): Summary[] {
  const dir = join(vaultRoot(project), 'summaries')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f > after)
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => parseSummary(join(dir, f)))
}

export function sendMessage(project: string, from: string, to: string, text: string): void {
  appendFileSync(
    join(vaultRoot(project), 'inbox', `${safe(to)}.md`),
    `\n## from ${from} — ${new Date().toISOString()}\n\n${text}\n`
  )
}

export function readInbox(project: string, agent: string, clear = true): string {
  const f = join(vaultRoot(project), 'inbox', `${safe(agent)}.md`)
  if (!existsSync(f)) return ''
  const c = readFileSync(f, 'utf8')
  if (clear) unlinkSync(f)
  return c
}

export const inboxCount = (project: string, agent: string): number =>
  (readInbox(project, agent, false).match(/^## from /gm) ?? []).length

/** Universal memory shared by every project: <vault>/Luna/shared/memory (userData when no vault is set). */
export function sharedRoot(): string {
  const base = getSettings().vaultPath || join(app.getPath('userData'), 'vault')
  const root = join(base, 'Luna', 'shared', 'memory')
  mkdirSync(root, { recursive: true })
  return root
}
export type Scope = 'project' | 'shared'
const memDir = (project: string, scope: Scope): string =>
  scope === 'shared' ? sharedRoot() : join(vaultRoot(project), 'memory')

export const memoryWrite = (
  project: string,
  name: string,
  content: string,
  scope: Scope = 'project'
): void => writeFileSync(join(memDir(project, scope), `${safe(name)}.md`), content)

/** Project note first, then the shared one of the same name. */
export function memoryRead(project: string, name: string): string | null {
  for (const scope of ['project', 'shared'] as Scope[]) {
    const f = join(memDir(project, scope), `${safe(name)}.md`)
    if (existsSync(f)) return readFileSync(f, 'utf8')
  }
  return null
}

export const memoryList = (project: string): { name: string; scope: Scope }[] =>
  (['project', 'shared'] as Scope[]).flatMap((scope) =>
    readdirSync(memDir(project, scope))
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ name: f.slice(0, -3), scope }))
  )

/** Case-insensitive search over project + shared memory and summaries; returns snippets. */
export function memorySearch(
  project: string,
  query: string,
  limit = 8
): { where: string; snippet: string }[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const files: { where: string; path: string }[] = []
  for (const scope of ['project', 'shared'] as Scope[])
    for (const f of readdirSync(memDir(project, scope)).filter((x) => x.endsWith('.md')))
      files.push({
        where: `${scope} memory/${f.slice(0, -3)}`,
        path: join(memDir(project, scope), f)
      })
  for (const f of readdirSync(join(vaultRoot(project), 'summaries')).filter((x) =>
    x.endsWith('.md')
  ))
    files.push({
      where: `summary ${f.slice(0, -3)}`,
      path: join(vaultRoot(project), 'summaries', f)
    })
  const hits: { where: string; snippet: string; score: number }[] = []
  for (const f of files) {
    const raw = withoutDiff(readFileSync(f.path, 'utf8'))
    const low = raw.toLowerCase()
    const score = terms.reduce((n, t) => n + (low.split(t).length - 1), 0)
    if (!score) continue
    const i = Math.max(0, low.indexOf(terms[0]) - 120)
    hits.push({ where: f.where, snippet: raw.slice(i, i + 400).trim(), score })
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ where, snippet }) => ({ where, snippet }))
}

export function writeRollup(project: string, text: string): string {
  const f = join(vaultRoot(project), 'rollups', `${stamp()}.md`)
  writeFileSync(f, text)
  return f
}

export function readRollups(project: string, limit = 5): { file: string; body: string }[] {
  const dir = join(vaultRoot(project), 'rollups')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => ({ file: join(dir, f), body: readFileSync(join(dir, f), 'utf8') }))
}

/** Summaries newer than the latest roll-up (file names sort by ISO timestamp). */
export function summariesSinceLastRollup(project: string): Summary[] {
  const last =
    readdirSync(join(vaultRoot(project), 'rollups'))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .at(-1) ?? ''
  return readSummaries(project, 200, last.slice(0, -3))
}

/* ---------- activity log + graph ---------- */

export type Event = {
  t: string
  kind: 'summary' | 'message' | 'task' | 'rollup' | 'dispatch' | 'nudge' | 'memory'
  from: string
  to?: string
  title?: string
  text: string
}

export function appendEvent(project: string, ev: Omit<Event, 't'>): void {
  appendFileSync(
    join(vaultRoot(project), 'log.jsonl'),
    JSON.stringify({ t: new Date().toISOString(), ...ev }) + '\n'
  )
}

export function readEvents(project: string, limit = 200): Event[] {
  const f = join(vaultRoot(project), 'log.jsonl')
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((l) => JSON.parse(l) as Event)
}

export type GraphNode = {
  id: string
  label: string
  type: 'agent' | 'summary' | 'rollup' | 'memory' | 'inbox'
  path?: string
  size: number
}
export type Graph = { nodes: GraphNode[]; edges: { a: string; b: string }[] }

/** Obsidian-style graph: files as nodes, edges from authorship, wikilinks, roll-up coverage. */
export function graph(project: string): Graph {
  const root = vaultRoot(project)
  const nodes = new Map<string, GraphNode>()
  const edges: { a: string; b: string }[] = []
  const agent = (name: string): string => {
    const id = `agent:${name}`
    if (!nodes.has(id)) nodes.set(id, { id, label: name, type: 'agent', size: 3 })
    return id
  }
  const files: { id: string; dir: GraphNode['type']; raw: string; name: string }[] = []
  for (const dir of ['summaries', 'rollups', 'memory', 'inbox'] as const) {
    for (const f of readdirSync(join(root, dir))
      .filter((x) => x.endsWith('.md'))
      .sort()) {
      const path = join(root, dir, f)
      const raw = readFileSync(path, 'utf8')
      const id = `${dir}/${f}`
      files.push({
        id,
        dir:
          dir === 'summaries'
            ? 'summary'
            : dir === 'rollups'
              ? 'rollup'
              : dir === 'memory'
                ? 'memory'
                : 'inbox',
        raw,
        name: f.slice(0, -3)
      })
      const label =
        dir === 'summaries'
          ? parseSummary(path).title || f
          : dir === 'rollups'
            ? `roll-up ${f.slice(0, 16).replace('T', ' ')}`
            : f.slice(0, -3)
      nodes.set(id, {
        id,
        label,
        type: files.at(-1)!.dir,
        path,
        size: 1 + Math.min(4, raw.length / 1500)
      })
    }
  }
  for (const f of readdirSync(sharedRoot()).filter((x) => x.endsWith('.md'))) {
    const path = join(sharedRoot(), f)
    const raw = readFileSync(path, 'utf8')
    const id = `shared/${f}`
    files.push({ id, dir: 'memory', raw, name: f.slice(0, -3) })
    nodes.set(id, {
      id,
      label: `shared · ${f.slice(0, -3)}`,
      type: 'memory',
      path,
      size: 2 + Math.min(4, raw.length / 1500)
    })
  }
  let lastRollup: string | null = null
  for (const f of files) {
    if (f.dir === 'summary') {
      const s = parseSummary(join(root, f.id))
      edges.push({ a: f.id, b: agent(s.agent) })
    }
    if (f.dir === 'inbox') edges.push({ a: f.id, b: agent(f.name) })
    for (const m of f.raw.matchAll(/\[\[([^\]|#]+)/g)) {
      const target = files.find((x) => x.name === m[1].trim())
      if (target && target.id !== f.id) edges.push({ a: f.id, b: target.id })
    }
  }
  // each roll-up covers the summaries written after the previous roll-up (file names sort by time)
  const rollups = files.filter((f) => f.dir === 'rollup')
  const summaries = files.filter((f) => f.dir === 'summary')
  for (const r of rollups) {
    const stamp = r.name
    for (const s of summaries) {
      const sStamp = s.name.slice(0, stamp.length)
      if (sStamp <= stamp && (!lastRollup || sStamp > lastRollup)) edges.push({ a: r.id, b: s.id })
    }
    lastRollup = stamp
  }
  return { nodes: [...nodes.values()], edges }
}
