import { useState } from 'react'
import { LuPlus, LuX, LuLayoutGrid, LuPencil, LuColumns3, LuRows3 } from 'react-icons/lu'
import type { Term } from './TermView'
import { Launchers } from './TerminalPanel'
import { EmptyState } from './ui'
import { SlidingIndicator } from './fx'
import Tiles from './Tiles'
import { sortableProps } from './sortable'
import type { TileMode } from './tileLayout'

type Props = {
  cwd: string | null
  terms: Term[]
  workspaces: string[]
  active: string
  onPick: (ws: string) => void
  onAddWorkspace: (name: string) => void
  onRenameWorkspace: (from: string, to: string) => void
  onCloseWorkspace: (ws: string) => void
  onAdd: (name?: string, cmd?: string, agent?: string) => void
  onClose: (id: string) => void
  /** Drag a terminal onto another to swap their places. */
  onMoveTerm: (from: string, to: string) => void
  onRenameTerm: (id: string, name: string) => void
  onMoveWorkspace: (from: string, to: string) => void
}

const MODES: { id: TileMode; icon: React.JSX.Element; label: string }[] = [
  { id: 'grid', icon: <LuLayoutGrid />, label: 'Grid — four corners once there are 3+' },
  { id: 'cols', icon: <LuColumns3 />, label: 'Columns — all side by side' },
  { id: 'rows', icon: <LuRows3 />, label: 'Rows — stacked' }
]

export default function AgentView(p: Props): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<TileMode>(
    () => (localStorage.getItem('luna:tileMode') as TileMode) || 'grid'
  )
  const pickMode = (m: TileMode): void => {
    setMode(m)
    localStorage.setItem('luna:tileMode', m)
  }
  const dir = p.cwd ?? '~'
  const commit = (): void => {
    if (editing && draft.trim() && draft.trim() !== editing)
      p.onRenameWorkspace(editing, draft.trim())
    setEditing(null)
  }
  return (
    <div className="agent-view">
      <div className="tabs ws-bar">
        <SlidingIndicator activeSelector=".tab.active" deps={[p.active, p.workspaces, editing]} />
        {p.workspaces.map((ws, i) => (
          <div
            key={ws}
            className={'tab' + (ws === p.active ? ' active' : '')}
            {...sortableProps(i, (from, to) =>
              p.onMoveWorkspace(p.workspaces[from], p.workspaces[to])
            )}
            onClick={() => p.onPick(ws)}
            onDoubleClick={() => {
              setEditing(ws)
              setDraft(ws)
            }}
          >
            <LuLayoutGrid />
            {editing === ws ? (
              <input
                autoFocus
                className="inline"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) =>
                  e.key === 'Enter' ? commit() : e.key === 'Escape' ? setEditing(null) : undefined
                }
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              ws
            )}
            <span className="count">{p.terms.filter((t) => t.ws === ws).length || ''}</span>
            {p.workspaces.length > 1 && (
              <span
                className="x"
                onClick={(e) => {
                  e.stopPropagation()
                  p.onCloseWorkspace(ws)
                }}
              >
                <LuX />
              </span>
            )}
          </div>
        ))}
        <button
          className="small icon"
          title="New workspace (e.g. Frontend, Backend)"
          onClick={() => p.onAddWorkspace(`Workspace ${p.workspaces.length + 1}`)}
        >
          <LuPlus />
        </button>
        <span className="spacer" />
        <span className="dim small" style={{ marginRight: 4 }}>
          <LuPencil /> double-click a tab or a terminal to rename
        </span>
        <span className="seg-tabs" style={{ marginRight: 6 }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? 'on' : ''}
              title={m.label}
              onClick={() => pickMode(m.id)}
            >
              {m.icon}
            </button>
          ))}
        </span>
        <Launchers disabled={!p.cwd} onAdd={p.onAdd} />
      </div>
      {p.workspaces.map((ws) => {
        const tiles = p.terms.filter((t) => t.ws === ws)
        const visible = ws === p.active
        return (
          <div key={ws} className="ws" hidden={!visible}>
            {tiles.length === 0 ? (
              <EmptyState
                icon={<LuLayoutGrid />}
                title={`${ws} is empty`}
                text={
                  p.cwd
                    ? 'Launch agents here. They dock into a grid you can resize by dragging the dividers.'
                    : 'Open a project first.'
                }
              >
                {p.cwd && <Launchers disabled={false} onAdd={p.onAdd} />}
              </EmptyState>
            ) : (
              <Tiles
                ws={ws}
                tiles={tiles}
                cwd={dir}
                visible={visible}
                mode={mode}
                onClose={p.onClose}
                onMove={p.onMoveTerm}
                onRename={p.onRenameTerm}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
