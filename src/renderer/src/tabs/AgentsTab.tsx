import { useEffect, useState } from 'react'
import { LuCrown, LuPlay, LuChevronDown, LuChevronRight, LuServer } from 'react-icons/lu'
import type { TabProps } from './types'
import type { AgentName, HubStatus } from '../../../preload/index.d'
import { Avatar, ViewHead } from '../components/ui'

const NAMES: Record<AgentName, string> = { claude: 'Claude Code', codex: 'Codex' }
const ago = (t: number): string => {
  const s = Math.round((Date.now() - t) / 1000)
  return s < 60
    ? `${s}s ago`
    : s < 3600
      ? `${Math.round(s / 60)}m ago`
      : `${Math.round(s / 3600)}h ago`
}

function AgentRow({
  agent,
  hub,
  project,
  launch,
  onSettings
}: {
  agent: AgentName
  hub: HubStatus | null
  project: string | null
  launch: (a: AgentName) => void
  onSettings: () => void
}): React.JSX.Element {
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [outdated, setOutdated] = useState(false)
  useEffect(() => {
    window.luna.agents.status(agent).then((s) => {
      setRegistered(s.registered)
      setOutdated(!!s.outdated)
    })
  }, [agent, project, hub?.live.length])
  const live = hub?.live.filter((l) => l === agent || l.startsWith(agent + '-')) ?? []
  const seen = hub?.agents[agent]
  return (
    <div className="card agent-row">
      <div className="card-head">
        <Avatar name={agent} size={28} />
        <b>{NAMES[agent]}</b>
        <span className="spacer" />
        <button
          className="primary small"
          disabled={!project}
          onClick={() => launch(agent)}
          title="Open a terminal running this agent"
        >
          <LuPlay /> Launch
        </button>
      </div>
      <div className="chips">
        <span className={'chip ' + (live.length ? 'ok' : '')}>
          <i />{' '}
          {live.length
            ? `${live.length} terminal${live.length === 1 ? '' : 's'} open`
            : 'no terminal'}
        </span>
        <span
          className={'chip ' + (registered ? 'ok' : registered === false ? 'warn' : '')}
          title={registered === false ? 'Register in Settings → Agents' : undefined}
          onClick={registered === false ? onSettings : undefined}
          style={registered === false ? { cursor: 'pointer' } : undefined}
        >
          <i />{' '}
          {registered === null
            ? 'checking…'
            : registered
              ? 'hub registered'
              : outdated
                ? 'hub setup outdated · update'
                : 'not registered · set up'}
        </span>
        {seen && <span className="chip">last hub call {ago(seen)}</span>}
      </div>
    </div>
  )
}

export default function AgentsTab({ project, launch, openTeam }: TabProps): React.JSX.Element {
  const [hub, setHub] = useState<HubStatus | null>(null)
  const [showHub, setShowHub] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    window.luna.hub.status().then(setHub)
    const t = setInterval(() => tick((n) => n + 1), 10000)
    const off = window.luna.hub.onStatus(setHub)
    return () => {
      off()
      clearInterval(t)
    }
  }, [])
  const others = Object.keys(hub?.agents ?? {}).filter((a) => !/^(claude|codex)(-\d+)?$/.test(a))
  const openAgentSettings = (): void => {
    window.dispatchEvent(new CustomEvent('luna:settings', { detail: 'agents' }))
  }
  return (
    <>
      <ViewHead title="Agents">
        <span className={'pill ' + (hub?.running ? 'ok' : 'warn')} title="MCP hub">
          <i />
          {hub?.running ? `hub :${hub.port}` : 'hub off'}
        </span>
        <button
          className="primary small"
          disabled={!project}
          onClick={openTeam}
          title="Give the team one job; the planner splits it"
        >
          <LuCrown /> Team prompt
        </button>
      </ViewHead>
      <div className="panel">
        <AgentRow
          agent="claude"
          hub={hub}
          project={project}
          launch={launch}
          onSettings={openAgentSettings}
        />
        <AgentRow
          agent="codex"
          hub={hub}
          project={project}
          launch={launch}
          onSettings={openAgentSettings}
        />
        {others.map((name) => (
          <div key={name} className="card-row list-row">
            <Avatar name={name} />
            <b>{name}</b>
            <span className="spacer" />
            <span className="dim">called the hub {ago(hub!.agents[name])} · no terminal</span>
          </div>
        ))}

        <button className="disclosure" onClick={() => setShowHub((v) => !v)}>
          {showHub ? <LuChevronDown /> : <LuChevronRight />} <LuServer /> Hub details
        </button>
        {showHub && (
          <div className="card">
            <code className="mono">http://127.0.0.1:{hub?.port}/mcp/&lt;agent&gt;</code>
            <div className="dim small" style={{ marginTop: 6 }}>
              Tools: post_summary · read_summaries · send_message · read_inbox · delegate ·
              list_agents · memory_write · memory_read · memory_list
            </div>
            <div className="dim small" style={{ marginTop: 4 }}>
              Port and vault path live in Settings (⌘,).
            </div>
          </div>
        )}
      </div>
    </>
  )
}
