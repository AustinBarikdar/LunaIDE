import type { ReactNode } from 'react'

const COLORS: Record<string, string> = { claude: '#d97757', codex: '#10a37f', luna: '#6c5ce7' }
const PALETTE = ['#6c5ce7', '#0ea5e9', '#f59e0b', '#ec4899', '#22c55e', '#8b5cf6']

function agentColor(name: string): string {
  if (COLORS[name]) return COLORS[name]
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function Avatar({ name, size = 22 }: { name: string; size?: number }): React.JSX.Element {
  return (
    <span
      className="avatar"
      style={{ background: agentColor(name), width: size, height: size, fontSize: size * 0.5 }}
      title={name}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  children
}: {
  icon: ReactNode
  title: string
  text?: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {text && <div className="empty-text">{text}</div>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  )
}

export function ViewHead({
  title,
  children
}: {
  title: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="view-head">
      <span className="view-title">{title}</span>
      <span className="spacer" />
      {children}
    </div>
  )
}
