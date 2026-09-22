import { useEffect, useState } from 'react'
import {
  LuSparkles,
  LuScrollText,
  LuLoader,
  LuEraser,
  LuRoute,
  LuMinus,
  LuPlus,
  LuChevronRight,
  LuChevronDown,
  LuFileDiff,
  LuMessageSquareText
} from 'react-icons/lu'
import type { TabProps } from './types'
import type { Rollup, Summary } from '../../../preload/index.d'
import Markdown, { DiffView } from '../components/Markdown'
import { Avatar, EmptyState, ViewHead } from '../components/ui'
import { fmtTime } from '../components/util'
import { splitByFile } from '../components/diff'

const stripFrontmatter = (s: string): string => s.replace(/^---\n[\s\S]*?\n---\n\n?/, '')

/** The ```diff fence of a summary body, and the body without it. */
const diffOf = (body: string): string => body.match(/```diff\n([\s\S]*?)\n```/)?.[1] ?? ''
const withoutDiff = (body: string): string =>
  body.replace(/\n*```diff\n[\s\S]*?\n```\n*/, '\n').trim()
const counts = (diff: string): { add: number; del: number } => ({
  add: (diff.match(/^\+(?!\+\+)/gm) ?? []).length,
  del: (diff.match(/^-(?!--)/gm) ?? []).length
})

/**
 * The change as numbered steps, each pinned to a line: click one to open that file with the diff
 * highlighted and the note drawn as a bubble on the line it explains.
 */
function Flow({
  summary,
  open
}: {
  summary: Summary
  open: (step: number) => void
}): React.JSX.Element {
  return (
    <div className="flow">
      <div className="flow-title">
        <LuRoute /> How it flows
      </div>
      {summary.notes.map((n, i) => (
        <button
          key={i}
          className="flow-step"
          title={`Open ${n.file} at this line`}
          onClick={() => open(i + 1)}
        >
          <span className="flow-num">{i + 1}</span>
          <span className="flow-body">
            <span className="flow-why">{n.why}</span>
            <span className="dim small mono">
              {n.kind === 'removed' ? <LuMinus /> : <LuPlus />} {n.file.split('/').pop()} ·{' '}
              {n.anchor.split('\n')[0].trim().slice(0, 60)}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** One agent post: flow first, prose next, the raw diff folded away until asked for. */
function Post({ s, openDiff }: { s: Summary; openDiff: TabProps['openDiff'] }): React.JSX.Element {
  const [showDiff, setShowDiff] = useState(false)
  const diff = diffOf(s.body)
  const files = splitByFile(diff)
  const { add, del } = counts(diff)
  const chunkFor = (file: string): string =>
    files.find((f) => f.path === file || f.path.endsWith(file) || file.endsWith(f.path))?.diff ?? ''
  const open = (step: number): void => {
    const note = s.notes[step - 1]
    openDiff(note.file, chunkFor(note.file), { notes: s.notes, diff, focus: step })
  }
  return (
    <div className="card">
      <div className="card-head">
        <Avatar name={s.agent} />
        <b>{s.agent}</b>
        <span className="dim">{fmtTime(s.time)}</span>
        <span className="spacer" />
        {s.notes.length > 0 && (
          <button
            className="small primary"
            title="Open the code with every step drawn on it"
            onClick={() => open(1)}
          >
            <LuMessageSquareText /> Explain on code
          </button>
        )}
      </div>
      <div className="card-title">{s.title}</div>
      {s.notes.length > 0 && <Flow summary={s} open={open} />}
      <Markdown text={withoutDiff(s.body)} />
      {diff && (
        <>
          <button className="disclosure diff-toggle" onClick={() => setShowDiff((v) => !v)}>
            {showDiff ? <LuChevronDown /> : <LuChevronRight />} <LuFileDiff /> Diff
            <span className="badge ok">+{add}</span>
            <span className="badge err">−{del}</span>
            <span className="dim small">
              {files.length} file{files.length === 1 ? '' : 's'}
            </span>
          </button>
          {showDiff && (
            <DiffView diff={diff} onOpen={(p, d) => openDiff(p, d, { notes: s.notes, diff })} />
          )}
        </>
      )}
    </div>
  )
}

export default function SummariesTab({
  project,
  settings,
  saveSetting,
  openDiff
}: TabProps): React.JSX.Element {
  const [items, setItems] = useState<Summary[]>([])
  const [rollups, setRollups] = useState<Rollup[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const refresh = (): void => {
    window.luna.summaries.list().then(setItems)
    window.luna.summaries.rollups().then(setRollups)
  }
  useEffect(() => {
    refresh()
    return window.luna.summaries.onChanged(refresh)
  }, [project])

  const run = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.luna.summaries.rollup()
      refresh()
    } catch (e) {
      setError(String((e as Error).message ?? e).replace(/^.*Error: /, ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ViewHead title="Summaries">
        <select
          value={settings.summarizer}
          onChange={(e) => saveSetting({ summarizer: e.target.value as 'claude' | 'codex' })}
        >
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
        <button
          className="primary small"
          disabled={!project || busy}
          onClick={run}
          title="Ask the chosen CLI to roll up everything since the last roll-up"
        >
          {busy ? <LuLoader className="spin" /> : <LuSparkles />} Roll up
        </button>
        {confirmClear ? (
          <span className="row tight">
            <span className="dim small">Delete {items.length} posts?</span>
            <button
              className="small danger"
              onClick={() => {
                window.luna.summaries.clear().then(() => {
                  setConfirmClear(false)
                  refresh()
                })
              }}
            >
              Clear
            </button>
            <button className="small ghost" onClick={() => setConfirmClear(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button
            className="small ghost"
            disabled={items.length === 0}
            title="Delete every agent post (roll-ups stay)"
            onClick={() => setConfirmClear(true)}
          >
            <LuEraser /> Clear
          </button>
        )}
      </ViewHead>
      <div className="panel">
        {busy && (
          <div className="card trail">
            <div className="card-head">
              <LuLoader className="spin accent" />
              <b>Rolling up with {settings.summarizer === 'claude' ? 'Claude Code' : 'Codex'}…</b>
            </div>
            <div className="dim small">Reading every summary since the last roll-up.</div>
          </div>
        )}
        {error && <pre className="console error">{error}</pre>}
        {rollups[0] && (
          <div className="card rollup">
            <div className="card-head">
              <Avatar name="luna" />
              <b>Roll-up</b>
              <span className="dim">
                {rollups[0].file
                  .split('/')
                  .pop()
                  ?.replace('.md', '')
                  .replace(/T(\d\d)-(\d\d).*$/, ' $1:$2')}
              </span>
            </div>
            <Markdown text={stripFrontmatter(rollups[0].body)} />
          </div>
        )}
        {items.length === 0 ? (
          <EmptyState
            icon={<LuScrollText />}
            title="No summaries yet"
            text="When an agent calls the luna post_summary tool, its note and diff appear here."
          />
        ) : (
          <div className="section-title">
            Agent posts <span className="count">{items.length}</span>
          </div>
        )}
        {items.map((s) => (
          <Post key={s.file} s={s} openDiff={openDiff} />
        ))}
      </div>
    </>
  )
}
