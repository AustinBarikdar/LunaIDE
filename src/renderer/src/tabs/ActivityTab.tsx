import { useEffect, useMemo, useState } from 'react'
import {
  LuMessagesSquare,
  LuArrowRight,
  LuClock,
  LuMessageCircle,
  LuEraser,
  LuSend
} from 'react-icons/lu'
import type { TabProps } from './types'
import type { ActivityEvent } from '../../../preload/index.d'
import { Avatar, EmptyState, ViewHead } from '../components/ui'
import { fmtTime } from '../components/util'
import Markdown from '../components/Markdown'
import Timeline, { Step } from '../components/Timeline'

const KIND: Record<ActivityEvent['kind'], string> = {
  summary: 'posted a summary',
  message: 'messaged',
  task: 'assigned a task to',
  rollup: 'wrote a roll-up',
  dispatch: 'sent the job to',
  nudge: 'nudged',
  memory: 'saved a note'
}

/** Agents as nodes on an arc; recent messages draw animated arcs between them. */
function Network({ events }: { events: ActivityEvent[] }): React.JSX.Element {
  const names = useMemo(() => {
    const s = new Set<string>()
    for (const e of events) {
      s.add(e.from)
      if (e.to) s.add(e.to)
    }
    return [...s]
  }, [events])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const W = 340
  const H = 150
  const pos = (i: number): [number, number] => {
    const a = Math.PI + (Math.PI * (i + 1)) / (names.length + 1)
    return [W / 2 + Math.cos(a) * 130, 118 + Math.sin(a) * 90]
  }
  const recent = events.filter((e) => e.to && now - new Date(e.t).getTime() < 90_000).slice(-12)
  if (names.length === 0) return <></>
  return (
    <svg className="network" viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {recent.map((e, i) => {
        const a = pos(names.indexOf(e.from))
        const b = pos(names.indexOf(e.to!))
        const age = (now - new Date(e.t).getTime()) / 90_000
        const mx = (a[0] + b[0]) / 2
        const my = Math.min(a[1], b[1]) - 40
        return (
          <path
            key={i}
            d={`M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`}
            className={'flow ' + e.kind}
            style={{ opacity: 1 - age * 0.8 }}
          />
        )
      })}
      {names.map((n, i) => {
        const [x, y] = pos(i)
        const busy = recent.some((e) => e.to === n && now - new Date(e.t).getTime() < 20_000)
        return (
          <g key={n} transform={`translate(${x},${y})`}>
            {busy && <circle r="18" className="ping" />}
            <circle r="13" className={'node ' + n} />
            <text y="4" className="initial">
              {n.slice(0, 1).toUpperCase()}
            </text>
            <text y="28" className="name">
              {n}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** What each agent is on right now, derived from the last thing that happened to or from it. */
function statusOf(
  name: string,
  events: ActivityEvent[]
): { text: string; working: boolean; since?: string } {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.to === name && (e.kind === 'task' || e.kind === 'dispatch'))
      return {
        text: `working on: ${e.text.split('\n')[0].slice(0, 90)}`,
        working: true,
        since: e.t
      }
    if (e.from === name && e.kind === 'summary')
      return { text: `finished: ${e.title ?? 'a change'}`, working: false, since: e.t }
    if (e.from === name && e.kind === 'message')
      return { text: `reported to ${e.to}`, working: false, since: e.t }
    if (e.from === name && e.kind === 'task')
      return { text: `delegated to ${e.to}; waiting for reports`, working: true, since: e.t }
  }
  return { text: 'idle', working: false }
}

const COLOR: Record<string, string> = {
  claude: '#d97757',
  codex: '#10a37f',
  luna: '#6c5ce7',
  you: '#1c1c22'
}

/** Send a note into an agent's inbox; it reads it on its next turn. */
function Say({ agents, live }: { agents: string[]; live: string[] }): React.JSX.Element {
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const target = agents.includes(to) ? to : (agents[0] ?? '')
  const send = async (): Promise<void> => {
    if (!target || !text.trim()) return
    setNote(await window.luna.activity.say(target, text.trim()))
    setText('')
  }
  return (
    <div className="say">
      <input
        value={text}
        placeholder="Something to change? It waits in their inbox."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
      />
      <div className="row">
        <span className="dim small">to</span>
        <select value={target} onChange={(e) => setTo(e.target.value)} title="Who gets the message">
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
              {live.includes(a) ? '' : ' (no terminal)'}
            </option>
          ))}
        </select>
        <span className="spacer" />
        {note && <span className="dim small ellipsis">{note}</span>}
        <button className="small primary" disabled={!target || !text.trim()} onClick={send}>
          <LuSend /> Queue
        </button>
      </div>
    </div>
  )
}

export default function ActivityTab({ project }: TabProps): React.JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [live, setLive] = useState<string[]>([])
  const [tab, setTab] = useState<'timeline' | 'chat'>('timeline')
  const refresh = (): void => {
    window.luna.activity.list().then(setEvents)
  }
  useEffect(() => {
    refresh()
    window.luna.hub.status().then((s) => setLive(s.live))
    const off = window.luna.hub.onStatus((s) => setLive(s.live))
    const offA = window.luna.activity.onChanged(refresh)
    return () => {
      off()
      offA()
    }
  }, [project])
  const feed = [...events].reverse()
  // "Right now" is about terminals that are open: an agent whose terminal was closed is history,
  // and history lives in the timeline and the chat below.
  const agents = live.filter((n) => n && n !== 'you' && n !== 'luna')
  const seen = [
    ...new Set(
      [...live, ...events.flatMap((e) => [e.from, e.to ?? ''])].filter(
        (n) => n && n !== 'you' && n !== 'luna'
      )
    )
  ]
  const lastLeader = [...events].reverse().find((e) => e.kind === 'dispatch')?.to
  const chatTo =
    lastLeader && seen.includes(lastLeader)
      ? [lastLeader, ...seen.filter((a) => a !== lastLeader)]
      : seen
  const steps: Step[] = events.slice(-40).map((e, i) => ({
    id: String(i) + e.t,
    color: COLOR[e.from] ?? '#6c5ce7',
    date: fmtTime(e.t),
    title: (
      <>
        <b>{e.from}</b> <span className="dim">{KIND[e.kind]}</span>
        {e.to && (
          <>
            {' '}
            <LuArrowRight className="dim" /> <b>{e.to}</b>
          </>
        )}
      </>
    ),
    body:
      e.kind === 'nudge'
        ? undefined
        : (e.title ? e.title + ' — ' : '') + e.text.split('\n')[0].slice(0, 140)
  }))
  return (
    <>
      <ViewHead title="Activity">
        <span className="seg-tabs">
          <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>
            <LuClock /> Timeline
          </button>
          <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
            <LuMessageCircle /> Chat
          </button>
        </span>
        <button
          className="small ghost"
          disabled={events.length === 0}
          title="Clear the activity log for this project"
          onClick={() => window.luna.activity.clear().then(refresh)}
        >
          <LuEraser /> Clear
        </button>
      </ViewHead>
      <div className="panel">
        <Network events={events} />
        {agents.length > 0 && (
          <div className="section">
            <div className="section-title">Right now</div>
            {agents.map((a) => {
              const st = statusOf(a, events)
              return (
                <div key={a} className={'now-row' + (st.working ? ' working' : '')}>
                  <Avatar name={a} size={22} />
                  <b>{a}</b>
                  {st.working && <span className="pulse" />}
                  <span className="state" title={st.text}>
                    {st.text}
                  </span>
                  {st.since && <span className="dim small">{fmtTime(st.since)}</span>}
                </div>
              )
            })}
          </div>
        )}
        {tab === 'timeline' && steps.length > 0 && <Timeline steps={steps} />}
        {tab === 'chat' && chatTo.length > 0 && <Say agents={chatTo} live={live} />}
        {tab === 'chat' && feed.length === 0 ? (
          <EmptyState
            icon={<LuMessagesSquare />}
            title="Nothing yet"
            text="When agents post summaries, message each other, or get tasks, the conversation shows up here live."
          />
        ) : tab === 'chat' ? (
          <div className="feed">
            {feed.map((e, i) => (
              <div key={i} className={'msg ' + e.kind}>
                <Avatar name={e.from} size={24} />
                <div className="bubble">
                  <div className="who">
                    <b>{e.from}</b> <span className="dim">{KIND[e.kind]}</span>
                    {e.to && (
                      <>
                        {' '}
                        <LuArrowRight className="dim" /> <b>{e.to}</b>
                      </>
                    )}
                    <span className="spacer" />
                    <span className="dim">{fmtTime(e.t)}</span>
                  </div>
                  {e.title && <div className="msg-title">{e.title}</div>}
                  {e.kind !== 'nudge' && <Markdown text={e.text} />}
                </div>
              </div>
            ))}
          </div>
        ) : steps.length === 0 ? (
          <EmptyState
            icon={<LuMessagesSquare />}
            title="Nothing yet"
            text="When agents post summaries, message each other, or get tasks, the timeline fills in live."
          />
        ) : null}
      </div>
    </>
  )
}
