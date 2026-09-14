import { useEffect, useState } from 'react'
import type { PluginAgent } from '../../../preload/index.d'
import { LuPlus, LuX, LuSparkles, LuBot, LuTerminal } from 'react-icons/lu'
import TermView, { Term } from './TermView'
import { sortableProps } from './sortable'
import { EmptyState } from './ui'

export function TermIcon({ cmd }: { cmd?: string }): React.JSX.Element {
  return cmd === 'claude' ? <LuSparkles /> : cmd === 'codex' ? <LuBot /> : <LuTerminal />
}

export function Launchers({
  disabled,
  onAdd
}: {
  disabled: boolean
  onAdd: (name?: string, cmd?: string, agent?: string) => void
}): React.JSX.Element {
  const [extra, setExtra] = useState<PluginAgent[]>([])
  useEffect(() => {
    const refresh = (): void => {
      window.luna.plugins.agents().then(setExtra)
    }
    refresh()
    return window.luna.plugins.onChanged(refresh)
  }, [])
  return (
    <>
      {extra.map((a) => (
        <button
          key={a.id}
          className="small launch"
          disabled={disabled}
          onClick={() => onAdd(a.name, a.command, a.id)}
          title={`from a plugin: ${a.command}`}
        >
          <LuBot /> {a.name}
        </button>
      ))}
      <button
        className="small launch claude"
        disabled={disabled}
        onClick={() => onAdd('Claude Code', 'claude', 'claude')}
      >
        <LuSparkles /> Claude
      </button>
      <button
        className="small launch codex"
        disabled={disabled}
        onClick={() => onAdd('Codex', 'codex', 'codex')}
      >
        <LuBot /> Codex
      </button>
      <button className="small icon" disabled={disabled} onClick={() => onAdd()} title="New shell">
        <LuPlus />
      </button>
    </>
  )
}

type Props = {
  cwd: string | null
  terms: Term[]
  onAdd: (name?: string, cmd?: string, agent?: string) => void
  onClose: (id: string) => void
  /** Drag a tab onto another to reorder. */
  onMove: (from: string, to: string) => void
}

/** IDE mode: every terminal as a tab in the bottom panel. */
export default function TerminalPanel({
  cwd,
  terms,
  onAdd,
  onClose,
  onMove
}: Props): React.JSX.Element {
  const [active, setActive] = useState<string | null>(null)
  const current = terms.some((t) => t.id === active) ? active : (terms.at(-1)?.id ?? null)
  const dir = cwd ?? '~'
  return (
    <>
      <div className="tabs">
        {terms.map((t, i) => (
          <div
            key={t.id}
            className={'tab' + (t.id === current ? ' active' : '')}
            {...sortableProps(i, (from, to) => onMove(terms[from].id, terms[to].id))}
            onClick={() => setActive(t.id)}
          >
            <span className={'tab-ico ' + (t.cmd ?? '')}>
              <TermIcon cmd={t.cmd} />
            </span>
            {t.name}
            <span
              className="x"
              onClick={(e) => {
                e.stopPropagation()
                onClose(t.id)
              }}
            >
              <LuX />
            </span>
          </div>
        ))}
        <span className="spacer" />
        <Launchers disabled={!cwd} onAdd={onAdd} />
      </div>
      <div className="term-host">
        {terms.length === 0 && (
          <EmptyState
            icon={<LuTerminal />}
            title={cwd ? 'Start an agent' : 'Terminals'}
            text={
              cwd
                ? 'Each terminal is a login shell in your project. Launch Claude Code or Codex, or open a plain shell.'
                : 'Open a project first.'
            }
          >
            {cwd && <Launchers disabled={false} onAdd={onAdd} />}
          </EmptyState>
        )}
        {terms.map((t) => (
          <TermView
            key={t.id}
            id={t.id}
            cwd={dir}
            cmd={t.cmd}
            agent={t.agent}
            visible={t.id === current}
          />
        ))}
      </div>
    </>
  )
}
