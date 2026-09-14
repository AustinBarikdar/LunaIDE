import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { LuX } from 'react-icons/lu'
import TermView, { Term } from './TermView'
import { TermIcon } from './TerminalPanel'
import { rowsFor, TileMode } from './tileLayout'
import { dragProps } from './dnd'

export type { TileMode }

/** A Group whose dragged sizes are remembered per panel configuration. */
function Split({
  id,
  orientation,
  panelIds,
  children
}: {
  id: string
  orientation: 'horizontal' | 'vertical'
  panelIds: string[]
  children: React.ReactNode
}): React.JSX.Element {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id,
    panelIds,
    storage: localStorage,
    onlySaveAfterUserInteractions: true
  })
  return (
    <Group
      id={id}
      orientation={orientation}
      className="group"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      {children}
    </Group>
  )
}

/** Terminals of one workspace, docked with draggable dividers; sizes persist across restarts. */
export default function Tiles({
  ws,
  tiles,
  cwd,
  visible,
  mode,
  onClose,
  onMove
}: {
  ws: string
  tiles: Term[]
  cwd: string
  visible: boolean
  mode: TileMode
  onClose: (id: string) => void
  onMove: (from: string, to: string) => void
}): React.JSX.Element {
  const rows = rowsFor(tiles, mode)
  // ponytail: panels are keyed by position, not terminal id, so a remembered size stays with
  // the slot (and localStorage doesn't grow a key per random terminal id).
  const tile = (t: Term, col: number): React.JSX.Element => (
    <Panel key={t.id} id={'c' + col} minSize={140} className="tile">
      <div
        className="tile-head"
        title="Drag to move this terminal"
        {...dragProps(t.id, 'luna/term', onMove)}
      >
        <span className={'tab-ico ' + (t.cmd ?? '')}>
          <TermIcon cmd={t.cmd} />
        </span>
        <b>{t.name}</b>
        <span className="spacer" />
        <button className="icon small ghost" title="Close terminal" onClick={() => onClose(t.id)}>
          <LuX />
        </button>
      </div>
      <div className="term-host">
        <TermView id={t.id} cwd={cwd} cmd={t.cmd} agent={t.agent} visible={visible} />
      </div>
    </Panel>
  )
  const row = (r: Term[], i: number): React.JSX.Element => (
    <Panel key={'row' + i} id={'r' + i} minSize={110} className="tile-row">
      <Split
        id={`luna:tiles:${ws}:${mode}:row${i}`}
        orientation="horizontal"
        panelIds={r.map((_, j) => 'c' + j)}
      >
        {r.flatMap((t, j) =>
          j ? [<Separator key={'s' + t.id} className="sep" />, tile(t, j)] : [tile(t, j)]
        )}
      </Split>
    </Panel>
  )
  return (
    <Split
      id={`luna:tiles:${ws}:${mode}`}
      orientation="vertical"
      panelIds={rows.map((_, i) => 'r' + i)}
    >
      {rows.flatMap((r, i) =>
        i ? [<Separator key={'rs' + i} className="sep" />, row(r, i)] : [row(r, i)]
      )}
    </Split>
  )
}
