import { useEffect, useState } from 'react'
import { LuSparkles, LuScrollText, LuLoader } from 'react-icons/lu'
import type { TabProps } from './types'
import type { Rollup, Summary } from '../../../preload/index.d'
import Markdown from '../components/Markdown'
import { Avatar, EmptyState, ViewHead } from '../components/ui'
import { fmtTime } from '../components/util'

const stripFrontmatter = (s: string): string => s.replace(/^---\n[\s\S]*?\n---\n\n?/, '')

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
          <div key={s.file} className="card">
            <div className="card-head">
              <Avatar name={s.agent} />
              <b>{s.agent}</b>
              <span className="spacer" />
              <span className="dim">{fmtTime(s.time)}</span>
            </div>
            <div className="card-title">{s.title}</div>
            <Markdown text={s.body} onOpen={openDiff} />
          </div>
        ))}
      </div>
    </>
  )
}
