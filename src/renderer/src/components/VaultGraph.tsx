// Obsidian-style force-directed graph of the vault, drawn on a canvas.
// ponytail: tiny hand-rolled simulation instead of d3; upgrade if vaults grow past a few hundred notes.
import { useEffect, useRef, useState } from 'react'
import type { Graph, GraphNode } from '../../../preload/index.d'

const COLOR: Record<GraphNode['type'], string> = {
  agent: '#6c5ce7',
  summary: '#0ea5e9',
  rollup: '#f59e0b',
  memory: '#22c55e',
  inbox: '#ec4899'
}
const AGENT: Record<string, string> = {
  claude: '#d97757',
  codex: '#10a37f',
  luna: '#6c5ce7',
  you: '#1c1c22'
}

type P = GraphNode & { x: number; y: number; vx: number; vy: number }

export default function VaultGraph({
  graph,
  onOpen
}: {
  graph: Graph
  onOpen: (path: string) => void
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pts = useRef<P[]>([])
  const [hover, setHover] = useState<P | null>(null)
  const drag = useRef<P | null>(null)

  useEffect(() => {
    const prev = new Map(pts.current.map((p) => [p.id, p]))
    pts.current = graph.nodes.map((n, i) => {
      const old = prev.get(n.id)
      const a = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2
      return {
        ...n,
        x: old?.x ?? 0.5 + Math.cos(a) * 0.3,
        y: old?.y ?? 0.5 + Math.sin(a) * 0.3,
        vx: 0,
        vy: 0
      }
    })
  }, [graph])

  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    let raf = 0
    let alpha = 1
    const byId = (): Map<string, P> => new Map(pts.current.map((p) => [p.id, p]))
    const step = (): void => {
      const ps = pts.current
      const m = byId()
      // repulsion
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i]
          const b = ps[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          const d2 = Math.max(0.0004, dx * dx + dy * dy)
          const f = 0.00022 / d2
          dx *= f
          dy *= f
          a.vx += dx
          a.vy += dy
          b.vx -= dx
          b.vy -= dy
        }
      // springs
      for (const e of graph.edges) {
        const a = m.get(e.a)
        const b = m.get(e.b)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 0.001
        const f = (d - 0.16) * 0.03
        a.vx += (dx / d) * f
        a.vy += (dy / d) * f
        b.vx -= (dx / d) * f
        b.vy -= (dy / d) * f
      }
      for (const p of ps) {
        if (p === drag.current) continue
        p.vx += (0.5 - p.x) * 0.012
        p.vy += (0.5 - p.y) * 0.012
        p.vx *= 0.82
        p.vy *= 0.82
        p.x = Math.min(0.94, Math.max(0.06, p.x + p.vx * alpha))
        p.y = Math.min(0.9, Math.max(0.08, p.y + p.vy * alpha))
      }
      alpha = Math.max(0.05, alpha * 0.995)
    }
    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1
      const W = el.clientWidth
      const H = el.clientHeight
      if (el.width !== W * dpr || el.height !== H * dpr) {
        el.width = W * dpr
        el.height = H * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const m = byId()
      ctx.lineWidth = 1
      for (const e of graph.edges) {
        const a = m.get(e.a)
        const b = m.get(e.b)
        if (!a || !b) continue
        const lit = hover && (hover.id === a.id || hover.id === b.id)
        ctx.strokeStyle = lit ? 'rgba(108,92,231,0.7)' : 'rgba(28,28,34,0.13)'
        ctx.beginPath()
        ctx.moveTo(a.x * W, a.y * H)
        ctx.lineTo(b.x * W, b.y * H)
        ctx.stroke()
      }
      for (const p of pts.current) {
        const r = 4 + p.size * 2.2
        const color = p.type === 'agent' ? (AGENT[p.label] ?? COLOR.agent) : COLOR[p.type]
        ctx.beginPath()
        ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha =
          hover &&
          hover !== p &&
          !graph.edges.some(
            (e) => (e.a === p.id && e.b === hover.id) || (e.b === p.id && e.a === hover.id)
          )
            ? 0.35
            : 1
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        if (p.type === 'agent' || p === hover || p.size > 2.5) {
          ctx.font = `${p.type === 'agent' ? '600 12px' : '11px'} -apple-system, sans-serif`
          ctx.fillStyle = 'rgba(28,28,34,0.85)'
          ctx.textAlign = 'center'
          ctx.fillText(
            p.label.length > 34 ? p.label.slice(0, 33) + '…' : p.label,
            p.x * W,
            p.y * H + r + 13
          )
        }
      }
    }
    const loop = (): void => {
      step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [graph, hover])

  const at = (e: React.MouseEvent): P | null => {
    const el = canvas.current!
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    let best: P | null = null
    let bd = 0.03
    for (const p of pts.current) {
      const d = Math.hypot((p.x - x) * (r.width / r.height), p.y - y)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    return best
  }

  return (
    <div className="graph-wrap">
      <canvas
        ref={canvas}
        className="graph"
        onMouseMove={(e) => {
          if (drag.current) {
            const r = canvas.current!.getBoundingClientRect()
            drag.current.x = (e.clientX - r.left) / r.width
            drag.current.y = (e.clientY - r.top) / r.height
          } else setHover(at(e))
        }}
        onMouseDown={(e) => (drag.current = at(e))}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => {
          drag.current = null
          setHover(null)
        }}
        onDoubleClick={(e) => {
          const p = at(e)
          if (p?.path) onOpen(p.path)
        }}
        style={{ cursor: hover ? 'pointer' : 'default' }}
      />
      <div className="graph-legend">
        {(Object.keys(COLOR) as GraphNode['type'][]).map((t) => (
          <span key={t}>
            <i style={{ background: COLOR[t] }} /> {t}
          </span>
        ))}
        <span className="dim">drag to arrange · double-click to open</span>
      </div>
      {hover && (
        <div className="graph-tip">
          <b>{hover.label}</b>
          <span className="dim"> · {hover.type}</span>
        </div>
      )}
    </div>
  )
}
