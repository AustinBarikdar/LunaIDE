import { useEffect, useState } from 'react'
import {
  LuRefreshCw,
  LuGitBranch,
  LuGitCommitHorizontal,
  LuUpload,
  LuDownload,
  LuCloud
} from 'react-icons/lu'
import type { TabProps } from './types'
import type { GitResult, GitStatus } from '../../../preload/index.d'
import { EmptyState, ViewHead } from '../components/ui'

const statusClass = (code: string): string =>
  code === '??' || code.includes('A') ? 'add' : code.includes('D') ? 'del' : 'mod'

export default function GitTab({ project }: TabProps): React.JSX.Element {
  const [st, setSt] = useState<GitStatus | null>(null)
  const [remote, setRemote] = useState('')
  const [msg, setMsg] = useState('')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = (): void => {
    if (project)
      window.luna.git.status().then((s) => {
        setSt(s)
        setRemote(s.remote)
      })
  }
  useEffect(refresh, [project])

  const run = async (label: string, f: () => Promise<GitResult>): Promise<void> => {
    setBusy(true)
    const r = await f()
    setOut(`$ ${label}\n${r.out || (r.code === 0 ? 'ok' : `exit ${r.code}`)}`)
    setBusy(false)
    refresh()
    window.dispatchEvent(new Event('luna-git-changed'))
  }
  const commit = (): void => {
    if (msg) run('git commit', () => window.luna.git.commit(msg)).then(() => setMsg(''))
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
  return (
    <>
      {head}
      <div className="panel">
        <div className="row">
          <span className="pill accent">
            <LuGitBranch /> {st.branch || 'detached'}
          </span>
          <span className="dim">{st.upstream ? `tracking ${st.upstream}` : 'no upstream'}</span>
        </div>

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
              <div key={c.path} className="list-row">
                <span className={'st ' + statusClass(c.code)}>{c.code}</span>
                <span className="mono ellipsis">{c.path}</span>
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
            <button
              disabled={busy || !st.remote}
              onClick={() => run('git push', window.luna.git.push)}
            >
              <LuUpload /> Push
            </button>
            <button
              disabled={busy || !st.upstream}
              onClick={() => run('git pull', window.luna.git.pull)}
            >
              <LuDownload /> Pull
            </button>
          </div>
        </div>

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

        {out && <pre className="console">{out}</pre>}
      </div>
    </>
  )
}
