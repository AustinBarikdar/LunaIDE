import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LuRefreshCw,
  LuGitBranch,
  LuGitCommitHorizontal,
  LuUpload,
  LuDownload,
  LuCloud,
  LuGithub,
  LuGitMerge,
  LuFileDiff,
  LuUndo2,
  LuPlus,
  LuChevronDown
} from 'react-icons/lu'
import type { TabProps } from './types'
import type { CommitDetail, GhStatus, GitLog, GitResult, GitStatus } from '../../../preload/index.d'
import { EmptyState, ViewHead } from '../components/ui'
import { fmtTime } from '../components/util'
import { DiffView } from '../components/Markdown'
import { splitByFile } from '../components/diff'

const statusClass = (code: string): string =>
  code === '??' || code.includes('A') ? 'add' : code.includes('D') ? 'del' : 'mod'

/** The open commit: full message, the branches that carry it, and its diff. */
function Detail({
  detail,
  onOpen
}: {
  detail: CommitDetail | null
  onOpen: (p: string, d: string) => void
}): React.JSX.Element {
  if (!detail) return <div className="dim small gdetail">Loading…</div>
  const files = splitByFile(detail.diff)
  return (
    <div className="gdetail" onClick={(e) => e.stopPropagation()}>
      {detail.body && <pre className="gmessage">{detail.body}</pre>}
      <div className="row tight wrap">
        <span className="dim small mono">{detail.short}</span>
        <span className="dim small">
          {detail.author} · {fmtTime(detail.when)}
        </span>
        {detail.branches.map((b) => (
          <span key={b} className={'chip ref' + (b.includes('/') ? ' remote' : '')}>
            {b}
          </span>
        ))}
        <span className="spacer" />
        {files.length > 0 && (
          <button
            className="small"
            title="Open the changed files in the editor, added lines green and removed lines red"
            onClick={() => files.slice(0, 5).forEach((f) => onOpen(f.path, f.diff))}
          >
            <LuFileDiff /> Open{' '}
            {files.length > 1 ? `${Math.min(files.length, 5)} files` : 'in editor'}
          </button>
        )}
      </div>
      {files.length > 0 && (
        <div className="dim small">Click a file name below to open just that one.</div>
      )}
      {detail.diff ? (
        <DiffView diff={detail.diff} onOpen={onOpen} />
      ) : (
        <div className="dim small">No file changes in this commit.</div>
      )}
    </div>
  )
}

/** Commits newest first, with a rail down the side: hollow dots are still only in this clone. */
function Graph({
  log,
  open,
  detail,
  onPick,
  onOpenFile
}: {
  log: GitLog
  open: string
  detail: CommitDetail | null
  onPick: (hash: string) => void
  onOpenFile: (p: string, d: string) => void
}): React.JSX.Element {
  const { commits, upstream } = log
  if (commits.length === 0)
    return (
      <div className="dim" style={{ padding: '6px 10px' }}>
        No commits yet
      </div>
    )
  return (
    <div className="graph">
      {commits.map((c, i) => {
        const boundary = i > 0 && !c.local && commits[i - 1].local
        return (
          <div key={c.hash}>
            {boundary && (
              <div className="graph-mark">
                <span />
                {upstream ? `on ${upstream}` : 'pushed'}
              </div>
            )}
            <div
              className={
                'gcommit' +
                (c.local ? ' local' : '') +
                (c.parents.length > 1 ? ' merge' : '') +
                (open === c.hash ? ' open' : '')
              }
              onClick={() => onPick(c.hash)}
              title="Show this commit"
            >
              <span className="rail">
                <i className="dot" />
              </span>
              <div className="gbody">
                <div className="row tight">
                  <span className="gsubject ellipsis" title={c.subject}>
                    {c.subject}
                  </span>
                  {c.local && <span className="chip local">local</span>}
                  {c.parents.length > 1 && (
                    <span className="chip">
                      <LuGitMerge /> merge
                    </span>
                  )}
                  {c.refs.map((r) => (
                    <span key={r} className={'chip ref' + (r.includes('/') ? ' remote' : '')}>
                      {r}
                    </span>
                  ))}
                </div>
                <div className="dim small mono">
                  {c.short} · {c.author} · {fmtTime(c.when)}
                </div>
                {open === c.hash && <Detail detail={detail} onOpen={onOpenFile} />}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function GitTab({
  project,
  openDiff,
  openCommit,
  openTerminal
}: TabProps): React.JSX.Element {
  const [st, setSt] = useState<GitStatus | null>(null)
  const [log, setLog] = useState<GitLog>({ commits: [], upstream: '' })
  const [gh, setGh] = useState<GhStatus | null>(null)
  const [remote, setRemote] = useState('')
  const [repoName, setRepoName] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [msg, setMsg] = useState('')
  const [out, setOut] = useState('')
  const [ask, setAsk] = useState(false)
  const [open, setOpen] = useState('')
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  /** The "new branch" name box is open. */
  const [naming, setNaming] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  /** Path of the change waiting for a "discard?" answer. */
  const [confirmDiscard, setConfirmDiscard] = useState('')

  const openRef = useRef(open)
  openRef.current = open
  const projectRef = useRef(project)
  projectRef.current = project

  const refresh = useCallback((): void => {
    if (!project) return
    const forProject = project
    window.luna.git.status().then((s) => {
      if (projectRef.current !== forProject) return
      setSt(s)
      setRemote(s.remote)
      setRepoName((n) => n || forProject.split('/').filter(Boolean).pop() || '')
      if (s.upstream) setAsk(false)
    })
    window.luna.git.log().then((l) => {
      if (projectRef.current === forProject) setLog(l)
    })
    window.luna.git.branches().then((b) => {
      if (projectRef.current === forProject) setBranches(b)
    })
  }, [project])
  useEffect(() => setRepoName(''), [project])
  useEffect(refresh, [refresh])
  useEffect(() => {
    window.luna.git.gh().then(setGh)
  }, [])

  const run = async (label: string, f: () => Promise<GitResult>): Promise<void> => {
    setBusy(true)
    const r = await f()
    setOut(`$ ${label}\n${r.out || (r.code === 0 ? 'ok' : `exit ${r.code}`)}`)
    setBusy(false)
    refresh()
    window.luna.git.gh().then(setGh)
    window.dispatchEvent(new Event('luna-git-changed'))
  }
  const commit = (): void => {
    if (msg && !busy && st && st.changes.length > 0)
      run('git commit', () => window.luna.git.commit(msg)).then(() => setMsg(''))
  }
  const pick = (hash: string): void => {
    if (hash === open) {
      setOpen('')
      return
    }
    setOpen(hash)
    setDetail(null)
    window.luna.git.show(hash).then((d) => {
      if (openRef.current !== hash) return
      setDetail(d)
      // the sidebar is narrow: put the whole commit in the editor as well
      openCommit?.(d)
    })
  }
  const push = (): void => {
    if (st?.upstream) run('git push', window.luna.git.push)
    else setAsk(true)
  }
  const createBranch = (): void => {
    const name = newBranch.trim()
    if (!name || busy) return
    run(`git checkout -b ${name}`, () => window.luna.git.createBranch(name)).then(() => {
      setNaming(false)
      setNewBranch('')
    })
  }
  /** Show one working-tree change in the editor, green and red on the file. */
  const showChange = (path: string): void => {
    // a rename lists as "old -> new"; the new path is the one on disk
    const file = path.split(' -> ').pop()!
    window.luna.git.diff(file).then((d) => openDiff(file, d))
  }

  const head = (
    <ViewHead title="Source control">
      <button className="icon small" title="Refresh" onClick={refresh}>
        <LuRefreshCw />
      </button>
    </ViewHead>
  )

  if (!project)
    return (
      <>
        {head}
        <EmptyState icon={<LuGitBranch />} title="No project" text="Open a folder first." />
      </>
    )
  if (!st) return head
  if (!st.repo)
    return (
      <>
        {head}
        <EmptyState
          icon={<LuGitBranch />}
          title="Not a repository"
          text="Initialise git here to track changes and push."
        >
          <button className="primary" onClick={() => run('git init', window.luna.git.init)}>
            <LuGitBranch /> git init
          </button>
        </EmptyState>
        {out && <pre className="console">{out}</pre>}
      </>
    )

  const github = (
    <div className="section">
      <div className="section-title">GitHub</div>
      {gh === null ? (
        <div className="dim small">Looking for the GitHub CLI…</div>
      ) : !gh.installed ? (
        <div className="dim small">
          Install the GitHub CLI (<span className="mono">brew install gh</span>) to create the repo
          from here, or paste a remote URL below.
        </div>
      ) : !gh.loggedIn ? (
        <div className="row">
          <span className="dim small">The GitHub CLI is here but not signed in.</span>
          <span className="spacer" />
          <button
            onClick={() => {
              openTerminal?.('GitHub login', 'gh auth login')
              setOut('Finish the login in the terminal, then press Refresh.')
            }}
          >
            <LuGithub /> Sign in
          </button>
        </div>
      ) : (
        <>
          <div className="row">
            <LuGithub className="dim" />
            <input
              value={repoName}
              placeholder="repository name"
              onChange={(e) => setRepoName(e.target.value)}
            />
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
            <button
              className="primary"
              disabled={busy || !repoName}
              onClick={() =>
                run(`gh repo create ${repoName}`, () =>
                  window.luna.git.ghCreate(repoName, visibility)
                )
              }
            >
              Create and push
            </button>
          </div>
          <div className="dim small">Signed in as {gh.account || 'GitHub'}.</div>
        </>
      )}
    </div>
  )

  return (
    <>
      {head}
      <div className="panel">
        <div className="row wrap">
          <span className="select-pill accent" title="Switch branch">
            <LuGitBranch /> {st.branch || 'detached'}
            <select
              value={st.branch}
              disabled={busy}
              onChange={(e) => {
                const name = e.target.value
                if (name === '+') setNaming(true)
                else if (name && name !== st.branch)
                  run(`git checkout ${name}`, () => window.luna.git.checkout(name))
              }}
            >
              {!branches.includes(st.branch) && <option value={st.branch}>{st.branch}</option>}
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="+">New branch…</option>
            </select>
            <LuChevronDown />
          </span>
          {st.upstream ? (
            <span className="dim small">tracking {st.upstream}</span>
          ) : (
            <span className="chip local">not on origin yet</span>
          )}
          <span className="spacer" />
          {st.ahead > 0 && <span className="chip">{st.ahead} to push</span>}
          {st.behind > 0 && <span className="chip">{st.behind} to pull</span>}
        </div>
        {naming && (
          <div className="row" style={{ marginTop: 6 }}>
            <LuPlus className="dim" />
            <input
              autoFocus
              value={newBranch}
              placeholder="new branch name, from here"
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createBranch()
                else if (e.key === 'Escape') setNaming(false)
              }}
            />
            <button className="primary" disabled={busy || !newBranch.trim()} onClick={createBranch}>
              Create
            </button>
            <button className="ghost" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </div>
        )}

        <div className="section">
          <div className="section-title">
            Changes {st.changes.length > 0 && <span className="count">{st.changes.length}</span>}
          </div>
          <div className="list">
            {st.changes.length === 0 && (
              <div className="dim" style={{ padding: '6px 10px' }}>
                Working tree clean
              </div>
            )}
            {st.changes.map((c) => (
              <div
                key={c.path}
                className="list-row change"
                title="Show this change in the editor"
                onClick={() => showChange(c.path)}
              >
                <span className={'st ' + statusClass(c.code)}>{c.code}</span>
                <span className="mono ellipsis">{c.path}</span>
                <span className="spacer" />
                {confirmDiscard === c.path ? (
                  <span className="row tight" onClick={(e) => e.stopPropagation()}>
                    <span className="dim small">Discard?</span>
                    <button
                      className="small danger"
                      disabled={busy}
                      onClick={() => {
                        setConfirmDiscard('')
                        run(`discard ${c.path}`, () => window.luna.git.discard(c.code, c.path))
                      }}
                    >
                      Discard
                    </button>
                    <button className="small ghost" onClick={() => setConfirmDiscard('')}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    className="icon small ghost discard"
                    title={
                      c.code === '??' || c.code.includes('A')
                        ? 'Discard: move this file to the Trash'
                        : 'Discard: put this file back the way HEAD has it'
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDiscard(c.path)
                    }}
                  >
                    <LuUndo2 />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-title">Commit</div>
          <textarea
            rows={2}
            placeholder="Message  (↩ to commit all)"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), commit())}
          />
          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="primary"
              disabled={busy || !msg || st.changes.length === 0}
              onClick={commit}
            >
              <LuGitCommitHorizontal /> Commit all
            </button>
            <span className="spacer" />
            <button disabled={busy} onClick={push}>
              <LuUpload /> {st.upstream ? 'Push' : 'Publish branch'}
            </button>
            <button
              disabled={busy || !st.upstream}
              onClick={() => run('git pull', window.luna.git.pull)}
            >
              <LuDownload /> Pull
            </button>
          </div>
          {ask && !st.upstream && (
            <div className="ask">
              {st.remote ? (
                <>
                  <span>
                    <b>{st.branch}</b> has no branch on origin yet. Create it and push?
                  </span>
                  <span className="spacer" />
                  <button onClick={() => setAsk(false)}>Not now</button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => run('git push -u origin HEAD', window.luna.git.publish)}
                  >
                    Create branch
                  </button>
                </>
              ) : (
                <>
                  <span>No remote yet. Create the repository on GitHub, or set a URL below.</span>
                  <span className="spacer" />
                  <button onClick={() => setAsk(false)}>Dismiss</button>
                </>
              )}
            </div>
          )}
        </div>

        {!st.remote && github}

        <div className="section">
          <div className="section-title">Remote</div>
          <div className="row">
            <LuCloud className="dim" />
            <input
              value={remote}
              placeholder="git@github.com:you/repo.git"
              onChange={(e) => setRemote(e.target.value)}
            />
            <button
              disabled={!remote || remote === st.remote}
              onClick={() => run('git remote', () => window.luna.git.setRemote(remote))}
            >
              Set
            </button>
          </div>
        </div>

        <div className="section">
          <div className="section-title">
            History
            {log.commits.some((c) => c.local) && (
              <span className="count">{log.commits.filter((c) => c.local).length} local</span>
            )}
          </div>
          <Graph log={log} open={open} detail={detail} onPick={pick} onOpenFile={openDiff} />
        </div>

        {out && <pre className="console">{out}</pre>}
      </div>
    </>
  )
}
