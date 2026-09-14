import { execFile } from 'child_process'

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

export function parseStatus(
  porcelain: string
): Pick<GitStatus, 'branch' | 'upstream' | 'ahead' | 'behind' | 'changes'> {
  const [head = '', ...rest] = porcelain.split('\n')
  // branch names can contain single dots (e.g. "release/1.0"); only ".." (forbidden in refs) can
  // mark the "branch...upstream" separator, so a lone "." must belong to the branch name itself
  const m = head.match(/^## (?:No commits yet on )?((?:[^.\s]|\.(?!\.))+)(?:\.\.\.(\S+))?/)
  return {
    branch: m?.[1] ?? '',
    upstream: m?.[2]?.replace(/\s*\[.*/, '') ?? '',
    ahead: Number(head.match(/\bahead (\d+)/)?.[1] ?? 0),
    behind: Number(head.match(/\bbehind (\d+)/)?.[1] ?? 0),
    changes: rest
      .filter(Boolean)
      .map((l) => ({ code: l.slice(0, 2).trim() || '?', path: l.slice(3) }))
  }
}

/** One line of `git log --pretty=format:…` with \x1f between fields. */
export function parseLog(out: string, unpushed: Set<string> | null): Commit[] {
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash = '', short = '', author = '', when = '', subject = '', parents = '', refs = ''] =
        line.split('\x1f')
      return {
        hash,
        short,
        author,
        when,
        subject,
        parents: parents.split(' ').filter(Boolean),
        refs: refs
          .split(', ')
          .map((r) => r.replace(/^HEAD -> /, '').trim())
          .filter((r) => r && r !== 'HEAD'),
        // ponytail: no upstream means nothing has been pushed anywhere yet
        local: unpushed ? unpushed.has(hash) : true
      }
    })
}

// ponytail: Electron inherits a bare PATH, so find gh the way the user's terminal would, once.
let ghBin: string | null | undefined
async function findGh(): Promise<string | null> {
  if (ghBin !== undefined) return ghBin
  const shell = process.env.SHELL || '/bin/zsh'
  const r = await new Promise<R>((resolve) =>
    execFile(shell, ['-lc', 'command -v gh'], (err, stdout) =>
      resolve({ code: err ? 1 : 0, out: String(stdout).trim() })
    )
  )
  ghBin = r.code === 0 && r.out ? r.out.split('\n')[0] : null
  return ghBin
}

const ghCli = async (args: string[], cwd?: string): Promise<R> => {
  const bin = await findGh()
  if (!bin) return { code: 127, out: 'gh: the GitHub CLI is not installed' }
  return new Promise((resolve) =>
    execFile(bin, args, { cwd, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({
        code: err ? ((err as { code?: number }).code ?? 1) : 0,
        out: (String(stdout) + String(stderr)).trim()
      })
    )
  )
}

const MAX_DIFF = 40_000

/** Working-tree diff vs HEAD (tracked) plus full content of untracked files, optionally scoped to `files`. */
export async function diffFor(cwd: string, files: string[] = []): Promise<string> {
  if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).code !== 0) return ''
  const scope = files.length ? ['--', ...files] : []
  const tracked = await git(cwd, ['diff', 'HEAD', '--no-color', ...scope])
  // -z: NUL-separated, unquoted — a plain "\n" split mangles names git would otherwise quote
  // (non-ASCII, spaces, quotes), so the follow-up diff below fails on a filename that doesn't exist
  const untracked = await git(cwd, ['ls-files', '--others', '--exclude-standard', '-z', ...scope])
  const parts = [tracked.out]
  for (const f of untracked.out.split('\0').filter(Boolean).slice(0, 20)) {
    // ponytail: git exits 1 when --no-index finds differences; the output is still the diff
    parts.push((await git(cwd, ['diff', '--no-index', '--no-color', '--', '/dev/null', f])).out)
  }
  const out = parts.filter(Boolean).join('\n')
  return out.length > MAX_DIFF ? out.slice(0, MAX_DIFF) + '\n... (diff truncated)' : out
}

export const ops = {
  async status(cwd: string): Promise<GitStatus> {
    const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (inside.code !== 0)
      return {
        repo: false,
        branch: '',
        upstream: '',
        remote: '',
        ahead: 0,
        behind: 0,
        changes: []
      }
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
  pull: (cwd: string): Promise<R> => git(cwd, ['pull', '--no-rebase']),

  /** Create the branch on origin and start tracking it. */
  publish: (cwd: string): Promise<R> => git(cwd, ['push', '-u', 'origin', 'HEAD']),

  async log(cwd: string, limit = '60'): Promise<GitLog> {
    const s = await ops.status(cwd)
    if (!s.repo) return { commits: [], upstream: '' }
    const fmt = ['%H', '%h', '%an', '%ad', '%s', '%P', '%D'].join('%x1f')
    const r = await git(cwd, [
      'log',
      '--date=iso-strict',
      `-n${Number(limit) || 60}`,
      `--pretty=format:${fmt}`
    ])
    if (r.code !== 0) return { commits: [], upstream: s.upstream }
    const unpushed = s.upstream
      ? new Set(
          (await git(cwd, ['rev-list', `${s.upstream}..HEAD`])).out.split('\n').filter(Boolean)
        )
      : null
    return { commits: parseLog(r.out, unpushed), upstream: s.upstream }
  },

  /** One commit: message, which branches carry it, and its diff. */
  async show(cwd: string, hash: string): Promise<CommitDetail> {
    const empty: CommitDetail = {
      hash,
      short: hash.slice(0, 7),
      author: '',
      email: '',
      when: '',
      subject: '',
      body: '',
      branches: [],
      diff: ''
    }
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) return empty
    const fmt = ['%H', '%h', '%an', '%ae', '%ad', '%s', '%b'].join('%x1f')
    const meta = await git(cwd, ['show', '-s', '--date=iso-strict', `--format=${fmt}`, hash])
    if (meta.code !== 0) return empty
    const [full = hash, short = '', author = '', email = '', when = '', subject = '', body = ''] =
      meta.out.split('\x1f')
    // ponytail: --first-parent so a merge shows what it brought in instead of nothing
    const d = await git(cwd, ['show', '--first-parent', '--no-color', '--format=', hash])
    const branches = await git(cwd, [
      'branch',
      '-a',
      '--contains',
      hash,
      '--format=%(refname:short)'
    ])
    return {
      hash: full,
      short,
      author,
      email,
      when,
      subject,
      body: body.trim(),
      branches: branches.out
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b && !b.includes('HEAD')),
      diff: d.out.length > MAX_DIFF ? d.out.slice(0, MAX_DIFF) + '\n... (diff truncated)' : d.out
    }
  },

  /** Is the GitHub CLI here, and is it signed in? */
  async gh(): Promise<GhStatus> {
    const v = await ghCli(['--version'])
    if (v.code !== 0) return { installed: false, loggedIn: false, account: '' }
    const a = await ghCli(['auth', 'status'])
    return {
      installed: true,
      loggedIn: a.code === 0,
      account: a.out.match(/account (\S+)/)?.[1] ?? ''
    }
  },

  /** Create the repo on GitHub, wire it up as origin and push. */
  ghCreate: (cwd: string, name: string, visibility = 'private'): Promise<R> =>
    ghCli(
      [
        'repo',
        'create',
        name,
        '--source=.',
        '--remote=origin',
        '--push',
        visibility === 'public' ? '--public' : '--private'
      ],
      cwd
    )
}
