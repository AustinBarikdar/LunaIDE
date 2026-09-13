import { LuX } from 'react-icons/lu'

export type Toast = {
  id: string
  title: string
  text?: string
  actions?: { label: string; primary?: boolean; onClick: () => void }[]
}

/** Bottom-right notifications, above the flower button. */
export default function Toasts({
  toasts,
  onDismiss
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}): React.JSX.Element | null {
  if (!toasts.length) return null
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className="toast-head">
            <b>{t.title}</b>
            <span className="spacer" />
            <button className="icon small ghost" title="Dismiss" onClick={() => onDismiss(t.id)}>
              <LuX />
            </button>
          </div>
          {t.text && <div className="dim small">{t.text}</div>}
          {t.actions && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="spacer" />
              {t.actions.map((a) => (
                <button
                  key={a.label}
                  className={'small' + (a.primary ? ' primary' : '')}
                  onClick={a.onClick}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
