import { useEffect, useState } from 'react'
import { LuGitBranch, LuCircleX, LuTriangleAlert, LuSearch, LuRadio } from 'react-icons/lu'
import type { GitStatus, HubStatus } from '../../../preload/index.d'
import { modifierLabel, type EditorStatus } from './commands'

type Props = {
  project: string | null
  errors: number
  warnings: number
  editor: EditorStatus | null
  hub: HubStatus | null
  onGit: () => void
  onProblems: () => void
  onSearch: () => void
  onHub: () => void
}

export default function StatusBar(props: Props): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<{
    project: string | null
    status: GitStatus | null
  } | null>(null)
  const git = snapshot?.project === props.project ? snapshot.status : null
  useEffect(() => {
    let disposed = false
    let generation = 0
    let timer: ReturnType<typeof setTimeout>
    const refresh = (): void => {
      const current = ++generation
      clearTimeout(timer)
      if (!props.project) return
      timer = setTimeout(() => {
        window.luna.git
          .status()
          .then((status) => {
            if (!disposed && current === generation) setSnapshot({ project: props.project, status })
          })
          .catch(() => {
            if (!disposed && current === generation)
              setSnapshot({ project: props.project, status: null })
          })
      }, 150)
    }
    refresh()
    const off = window.luna.onFileChanged(refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('luna-git-changed', refresh)
    return () => {
      disposed = true
      clearTimeout(timer)
      off()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('luna-git-changed', refresh)
    }
  }, [props.project])
  const branch = !props.project
    ? 'No project'
    : git?.repo
      ? git.branch || 'Detached HEAD'
      : git
        ? 'No repository'
        : 'Git…'
  return (
    <footer className="status-bar" aria-label="Status bar">
      <div className="status-left">
        <button
          className="status-branch"
          title={`${branch} · Open Source Control`}
          onClick={props.onGit}
        >
          <LuGitBranch />
          <span>{branch}</span>
        </button>
        <button
          title="Open Problems"
          aria-label={`${props.errors} errors, ${props.warnings} warnings. Open Problems`}
          onClick={props.onProblems}
        >
          <LuCircleX />
          <span>{props.errors}</span>
          <LuTriangleAlert />
          <span>{props.warnings}</span>
        </button>
      </div>
      <button
        className="status-search"
        title="Search files, project text, and commands"
        onClick={props.onSearch}
      >
        <LuSearch />
        <span>Search</span>
        <span className="status-shortcut">{modifierLabel()}P</span>
      </button>
      <div className="status-right">
        {props.editor && (
          <>
            <span className="status-cursor">
              Ln {props.editor.line}, Col {props.editor.column}
            </span>
            <span className="status-language">{props.editor.language}</span>
          </>
        )}
        <button
          title={
            props.hub?.running
              ? `Hub connected on port ${props.hub.port}`
              : (props.hub?.error ?? 'Hub disconnected')
          }
          aria-label="Open hub settings"
          onClick={props.onHub}
        >
          <LuRadio />
          <span className="status-hub-label">
            {props.hub?.running
              ? 'Hub connected'
              : props.hub?.error
                ? 'Hub port in use'
                : 'Hub offline'}
          </span>
        </button>
      </div>
    </footer>
  )
}
