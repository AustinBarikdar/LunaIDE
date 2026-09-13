import { useEffect, useState } from 'react'
import { LuX, LuRefreshCw, LuNetwork } from 'react-icons/lu'
import type { Graph } from '../../../preload/index.d'
import VaultGraph from './VaultGraph'
import { EmptyState } from './ui'

export default function VaultModal({
  onClose,
  onOpen
}: {
  onClose: () => void
  onOpen: (path: string) => void
}): React.JSX.Element {
  const [graph, setGraph] = useState<Graph | null>(null)
  const refresh = (): void => {
    window.luna.vault.graph().then(setGraph)
  }
  useEffect(() => {
    refresh()
    const off1 = window.luna.summaries.onChanged(refresh)
    const off2 = window.luna.activity.onChanged(refresh)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off1()
      off2()
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const counts = graph
    ? graph.nodes.reduce<Record<string, number>>(
        (m, n) => ((m[n.type] = (m[n.type] ?? 0) + 1), m),
        {}
      )
    : {}
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal vault-modal">
        <div className="vault-head">
          <LuNetwork className="accent" />
          <b>Vault graph</b>
          <span className="dim small">
            {Object.entries(counts)
              .map(
                ([k, v]) =>
                  `${v} ${k === 'summary' ? (v === 1 ? 'summary' : 'summaries') : k === 'inbox' ? (v === 1 ? 'inbox' : 'inboxes') : k === 'memory' ? (v === 1 ? 'memory' : 'memories') : k + (v === 1 ? '' : 's')}`
              )
              .join(' · ') || ''}
          </span>
          <span className="spacer" />
          <button className="icon small" title="Refresh" onClick={refresh}>
            <LuRefreshCw />
          </button>
          <button className="icon small ghost" title="Close (Esc)" onClick={onClose}>
            <LuX />
          </button>
        </div>
        {graph && graph.nodes.length > 0 ? (
          <VaultGraph
            graph={graph}
            onOpen={(p) => {
              onOpen(p)
              onClose()
            }}
          />
        ) : (
          <EmptyState
            icon={<LuNetwork />}
            title="Vault is empty"
            text="Summaries, roll-ups, memory notes, and inbox messages will appear here as a graph."
          />
        )}
      </div>
    </div>
  )
}
