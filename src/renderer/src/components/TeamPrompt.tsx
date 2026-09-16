import { useState } from 'react'
import { LuCrown, LuSend, LuTerminal, LuSparkles, LuBot } from 'react-icons/lu'
import { Avatar, EmptyState } from './ui'

/** One open agent terminal: its hub identity, what the user calls it, and where it lives. */
export type Member = { id: string; name: string; where: string }

/** The one job for the team: pick who plans and who codes, write it, send it to the planner. */
export default function TeamPrompt({
  members,
  project,
  onLaunch
}: {
  members: Member[]
  project: string | null
  onLaunch: (agent: 'claude' | 'codex') => void
}): React.JSX.Element {
  const [leader, setLeader] = useState('')
  const [coders, setCoders] = useState<string[] | null>(null)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)

  const ids = members.map((m) => m.id)
  const leaderId = ids.includes(leader) ? leader : (ids[0] ?? '')
  // Terminals come and go while this sits open, so roles are derived: until the user picks,
  // everyone but the planner codes (a lone planner codes too, or nothing would get written);
  // a pick only survives while that terminal is still here.
  const rest = ids.filter((id) => id !== leaderId)
  const coderIds = (coders ?? (rest.length ? rest : ids)).filter((id) => ids.includes(id))
  const leaderName = members.find((m) => m.id === leaderId)?.name ?? '…'
  const base = (id: string): string => id.replace(/-\d+$/, '')

  const send = async (): Promise<void> => {
    if (!leaderId || !prompt.trim() || busy) return
    setBusy(true)
    setResult(await window.luna.agents.dispatch(leaderId, prompt.trim(), coderIds))
    setBusy(false)
    setPrompt('')
  }

  return (
    <div className={'team-prompt' + (busy ? ' trail' : '')}>
      <div className="team-label">
        <LuCrown /> Team prompt
      </div>
      {members.length === 0 ? (
        <EmptyState
          icon={<LuTerminal />}
          title="No agent terminals open"
          text="Launch the agents you want on the team. Each open terminal becomes a member you can give a role."
        >
          <button className="primary" disabled={!project} onClick={() => onLaunch('claude')}>
            <LuSparkles /> Launch Claude Code
          </button>
          <button disabled={!project} onClick={() => onLaunch('codex')}>
            <LuBot /> Launch Codex
          </button>
        </EmptyState>
      ) : (
        <>
          <textarea
            className="team-text"
            placeholder="Describe the whole job. The planner searches shared memory, splits it into tasks, and delegates them through Luna; coders report back when done."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
          />
          <div className="team-list">
            {members.map((m) => (
              <div key={m.id} className={'team-row' + (leaderId === m.id ? ' on' : '')}>
                <Avatar name={base(m.id)} size={22} />
                <span className="team-name">
                  <b>{m.name}</b>
                  <span className="dim small">{m.where ? `${m.where} · ${m.id}` : m.id}</span>
                </span>
                <span className="spacer" />
                <label className="role-pick" title="This terminal plans the job">
                  <input
                    type="radio"
                    name="team-leader"
                    checked={leaderId === m.id}
                    onChange={() => setLeader(m.id)}
                  />
                  plans
                </label>
                <label className="role-pick" title="This terminal writes code">
                  <input
                    type="checkbox"
                    checked={coderIds.includes(m.id)}
                    onChange={(e) =>
                      setCoders(
                        e.target.checked
                          ? [...coderIds, m.id]
                          : coderIds.filter((id) => id !== m.id)
                      )
                    }
                  />
                  codes
                </label>
              </div>
            ))}
          </div>
          <div className="row">
            <span className="dim small">
              <kbd>⌘↩</kbd> sends to <b>{leaderName}</b>
            </span>
            <span className="spacer" />
            <button className="primary" disabled={!prompt.trim() || busy} onClick={send}>
              <LuSend /> Send to planner
            </button>
          </div>
          {result && <div className="note">{result}</div>}
        </>
      )}
    </div>
  )
}
