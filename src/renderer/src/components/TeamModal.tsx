import { useEffect, useMemo, useState } from 'react'
import { LuCrown, LuSend, LuX, LuTerminal, LuSparkles, LuBot } from 'react-icons/lu'
import type { Term } from './TermView'
import { Avatar, EmptyState } from './ui'

type Props = {
  terms: Term[]
  project: string | null
  onClose: () => void
  onLaunch: (agent: 'claude' | 'codex') => void
}

/** Roomy team-prompt composer: pick which open terminal plans and which ones code. */
export default function TeamModal({ terms, project, onClose, onLaunch }: Props): React.JSX.Element {
  const agents = useMemo(() => terms.filter((t) => t.agent), [terms])
  const [leader, setLeader] = useState<string>(agents[0]?.agent ?? '')
  const [coders, setCoders] = useState<string[]>(agents.slice(1).map((t) => t.agent!))
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)

  const leaderId = agents.some((t) => t.agent === leader) ? leader : (agents[0]?.agent ?? '')
  const coderIds = coders.filter((id) => agents.some((t) => t.agent === id))
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = async (): Promise<void> => {
    if (!leaderId || !prompt.trim()) return
    setBusy(true)
    setResult(await window.luna.agents.dispatch(leaderId, prompt.trim(), coderIds))
    setBusy(false)
    setPrompt('')
  }
  const base = (t: Term): string => (t.agent ?? '').replace(/-\d+$/, '')

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal team-modal' + (busy ? ' trail' : '')}>
        <div className="vault-head">
          <LuCrown className="accent" />
          <b>Team prompt</b>
          <span className="dim small">one job in, the planner splits it across the coders</span>
          <span className="spacer" />
          <button className="icon small ghost" title="Close (Esc)" onClick={onClose}>
            <LuX />
          </button>
        </div>
        {agents.length === 0 ? (
          <EmptyState
            icon={<LuTerminal />}
            title="No agent terminals open"
            text="Launch the agents you want on the team first. Each open terminal becomes a team member you can assign a role."
          >
            <button className="primary" disabled={!project} onClick={() => onLaunch('claude')}>
              <LuSparkles /> Launch Claude Code
            </button>
            <button disabled={!project} onClick={() => onLaunch('codex')}>
              <LuBot /> Launch Codex
            </button>
          </EmptyState>
        ) : (
          <div className="team-body">
            <div className="team-main">
              <label className="team-label">The job</label>
              <textarea
                autoFocus
                className="team-text"
                placeholder={
                  'Describe the whole job in as much detail as you like.\n\nThe planner reads it, searches the shared memory, splits it into self-contained tasks, and delegates them to the coders through Luna. Coders report back to the planner when done.'
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
              />
              <div className="row">
                <span className="dim small">
                  <kbd>⌘↩</kbd> sends to{' '}
                  <b>{agents.find((t) => t.agent === leaderId)?.name ?? '…'}</b>
                </span>
                <span className="spacer" />
                {result && (
                  <span className="note" style={{ margin: 0 }}>
                    {result}
                  </span>
                )}
                <button
                  className="primary"
                  disabled={!leaderId || !prompt.trim() || busy}
                  onClick={send}
                >
                  <LuSend /> Send to planner
                </button>
              </div>
            </div>
            <aside className="team-side">
              <div className="team-label">
                <LuCrown /> Plans
              </div>
              <div className="team-list">
                {agents.map((t) => (
                  <label key={t.id} className={'team-row' + (leaderId === t.agent ? ' on' : '')}>
                    <input
                      type="radio"
                      name="leader"
                      checked={leaderId === t.agent}
                      onChange={() => setLeader(t.agent!)}
                    />
                    <Avatar name={base(t)} size={22} />
                    <span className="team-name">
                      <b>{t.name}</b>
                      <span className="dim small">
                        {t.ws} · {t.agent}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="team-label" style={{ marginTop: 14 }}>
                Codes
              </div>
              <div className="team-list">
                {agents.map((t) => (
                  <label
                    key={t.id}
                    className={'team-row' + (coderIds.includes(t.agent!) ? ' on' : '')}
                  >
                    <input
                      type="checkbox"
                      checked={coderIds.includes(t.agent!)}
                      onChange={(e) =>
                        setCoders((c) =>
                          e.target.checked ? [...c, t.agent!] : c.filter((x) => x !== t.agent)
                        )
                      }
                    />
                    <Avatar name={base(t)} size={22} />
                    <span className="team-name">
                      <b>{t.name}</b>
                      <span className="dim small">
                        {t.agent === leaderId ? 'planner keeps a share' : t.ws}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="dim small" style={{ marginTop: 12 }}>
                Every open agent terminal is a team member with its own hub identity, so two Claude
                terminals can hold different roles.
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
