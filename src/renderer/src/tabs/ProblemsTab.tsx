import { useEffect, useState } from 'react'
import {
  LuTriangleAlert,
  LuCircleX,
  LuInfo,
  LuCircleCheck,
  LuChevronRight,
  LuChevronDown,
  LuX
} from 'react-icons/lu'
import type { TabProps } from './types'
import type { LspDiagnostic } from '../../../preload/index.d'
import { EmptyState, ViewHead } from '../components/ui'
import { subscribeProblems } from '../components/lspExtensions'

type Snapshot = Map<string, Map<string, LspDiagnostic[]>>

const Icon = ({ s }: { s: LspDiagnostic['severity'] }): React.JSX.Element =>
  s === 'error' ? (
    <LuCircleX className="sev error" />
  ) : s === 'warning' ? (
    <LuTriangleAlert className="sev warning" />
  ) : (
    <LuInfo className="sev info" />
  )

export default function ProblemsTab({
  project,
  reveal,
  onClose
}: TabProps & { onClose?: () => void }): React.JSX.Element {
  const [snap, setSnap] = useState<Snapshot>(new Map())
  const [closed, setClosed] = useState<Set<string>>(new Set())
  useEffect(() => subscribeProblems(setSnap), [])
  const files = [...snap.entries()]
    .map(([path, bySource]) => ({
      path,
      items: [...bySource.values()]
        .flat()
        .sort((a, b) => a.from.line - b.from.line || a.from.ch - b.from.ch)
    }))
    .filter((f) => f.items.length)
  const total = files.reduce((n, f) => n + f.items.length, 0)
  const errors = files.reduce((n, f) => n + f.items.filter((d) => d.severity === 'error').length, 0)
  const rel = (p: string): string =>
    project && p.startsWith(project) ? p.slice(project.length + 1) : p
  return (
    <>
      <ViewHead title="Problems">
        {total > 0 && (
          <span className="dim small">
            {errors} error{errors === 1 ? '' : 's'} · {total - errors} warning
            {total - errors === 1 ? '' : 's'}
          </span>
        )}
        {onClose && (
          <button className="icon small ghost" title="Hide problems section" onClick={onClose}>
            <LuX />
          </button>
        )}
      </ViewHead>
      <div className="panel">
        {files.length === 0 ? (
          <EmptyState
            icon={<LuCircleCheck />}
            title="No problems"
            text="Diagnostics from the language servers and linters for your open files show up here."
          />
        ) : (
          files.map((f) => {
            const open = !closed.has(f.path)
            return (
              <div key={f.path} className="prob-file">
                <button
                  className="disclosure"
                  onClick={() =>
                    setClosed((c) => {
                      const n = new Set(c)
                      if (n.has(f.path)) n.delete(f.path)
                      else n.add(f.path)
                      return n
                    })
                  }
                >
                  {open ? <LuChevronDown /> : <LuChevronRight />}
                  <b>{f.path.split('/').pop()}</b>
                  <span className="dim small ellipsis">{rel(f.path)}</span>
                  <span className="count">{f.items.length}</span>
                </button>
                {open && (
                  <div className="list">
                    {f.items.map((d, i) => (
                      <div
                        key={i}
                        className="list-row prob"
                        onClick={() => reveal(f.path, d.from.line, d.from.ch)}
                        title={d.message}
                      >
                        <Icon s={d.severity} />
                        <span className="prob-msg">{d.message}</span>
                        <span className="dim small mono">
                          {d.source} · {d.from.line + 1}:{d.from.ch + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
