import { execFile } from 'child_process'

export type GitStatus = {
  repo: boolean
  branch: string
  upstream: string
  remote: string
  changes: { code: string; path: string }[]
}
type R = { code: number; out: string }

const git = (cwd: string, args: string[]): Promise<R> =>
  new Promise((resolve) =>
    execFile('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({
        code: err ? ((err as { code?: number }).code ?? 1) : 0,
        out: (String(stdout) + String(stderr)).trim()
      })
    )
  )

export function parseStatus(porcelain: string): Pick<GitStatus, 'branch' | 'upstream' | 'changes'> {
  const [head = '', ...rest] = porcelain.split('\n')
  const m = head.match(/^## (?:No commits yet on )?([^.\s]+)(?:\.\.\.(\S+))?/)
  return {
    branch: m?.[1] ?? '',
    upstream: m?.[2] ?? '',
    changes: rest
      .filter(Boolean)
      .map((l) => ({ code: l.slice(0, 2).trim() || '?', path: l.slice(3) }))
  }
}

const MAX_DIFF = 40_000

/** Working-tree diff vs HEAD (tracked) plus full content of untracked files, optionally scoped to `files`. */
export async function diffFor(cwd: string, files: string[] = []): Promise<string> {
  if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).code !== 0) return ''
  const scope = files.length ? ['--', ...files] : []
  const tracked = await git(cwd, ['diff', 'HEAD', '--no-color', ...scope])
  const untracked = await git(cwd, ['ls-files', '--others', '--exclude-standard', ...scope])
  const parts = [tracked.out]
  for (const f of untracked.out.split('\n').filter(Boolean).slice(0, 20)) {
    // ponytail: git exits 1 when --no-index finds differences; the output is still the diff
    parts.push((await git(cwd, ['diff', '--no-index', '--no-color', '--', '/dev/null', f])).out)
  }
  const out = parts.filter(Boolean).join('\n')
  return out.length > MAX_DIFF ? out.slice(0, MAX_DIFF) + '\n... (diff truncated)' : out
}

export const ops = {
  async status(cwd: string): Promise<GitStatus> {
    const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (inside.code !== 0) return { repo: false, branch: '', upstream: '', remote: '', changes: [] }
    const st = await git(cwd, ['status', '--porcelain=v1', '-b'])
    const remote = await git(cwd, ['remote', 'get-url', 'origin'])
    return { repo: true, remote: remote.code === 0 ? remote.out : '', ...parseStatus(st.out) }
  },
  init: (cwd: string): Promise<R> => git(cwd, ['init', '-b', 'main']),
  setRemote: async (cwd: string, url: string): Promise<R> =>
    (await git(cwd, ['remote', 'get-url', 'origin'])).code === 0
      ? git(cwd, ['remote', 'set-url', 'origin', url])
      : git(cwd, ['remote', 'add', 'origin', url]),
  async commit(cwd: string, message: string): Promise<R> {
    const add = await git(cwd, ['add', '-A'])
    if (add.code !== 0) return add
    return git(cwd, ['commit', '-m', message])
  },
  async push(cwd: string): Promise<R> {
    const s = await ops.status(cwd)
    return s.upstream ? git(cwd, ['push']) : git(cwd, ['push', '-u', 'origin', 'HEAD'])
  },
  pull: (cwd: string): Promise<R> => git(cwd, ['pull', '--no-rebase'])
}
