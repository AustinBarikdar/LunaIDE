// Animated vertical timeline (ported from animata.design progress/animatedtimeline, MIT):
// dots light up and the connecting line grows in a top-to-bottom cascade.
import { useEffect, useState, type ReactNode } from 'react'

export type Step = { id: string; title: ReactNode; body?: ReactNode; date?: string; color?: string }

export default function Timeline({ steps }: { steps: Step[] }): React.JSX.Element {
  // cascade: light one more step every 80ms until all are on; restart when the step count changes
  const [st, setSt] = useState({ n: steps.length, lit: 0 })
  if (st.n !== steps.length) setSt({ n: steps.length, lit: 0 })
  useEffect(() => {
    const t = setInterval(() => setSt((s) => (s.lit >= s.n ? s : { ...s, lit: s.lit + 1 })), 80)
    return () => clearInterval(t)
  }, [steps.length])
  const lit = st.lit
  return (
    <ol className="timeline">
      {steps.map((s, i) => (
        <li key={s.id} className={'tl-item' + (i < lit ? ' on' : '')}>
          <span
            className="tl-dot"
            style={{ borderColor: s.color, background: i < lit ? s.color : undefined }}
          />
          {i < steps.length - 1 && (
            <span className="tl-line">
              <i style={{ background: s.color }} />
            </span>
          )}
          <div className="tl-body">
            <div className="tl-title">
              {s.title}
              {s.date && <span className="tl-date">{s.date}</span>}
            </div>
            {s.body && <div className="tl-text">{s.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}
