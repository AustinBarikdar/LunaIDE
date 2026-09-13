// Floating quick-switch menu, ported from animata.design fabs/flower-menu (MIT).
// Petals fan out over a quarter circle from the corner so nothing leaves the window.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LuPlus } from 'react-icons/lu'

export type PetalItem = { icon: ReactNode; label: string; onClick: () => void; active?: boolean }

export default function FlowerMenu({
  items,
  radius = 124
}: {
  items: PetalItem[]
  radius?: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  const n = items.length
  return (
    <div ref={root} className={'flower' + (open ? ' open' : '')}>
      {items.map((it, i) => {
        // 0° points left, 100° a little past straight up
        const a = ((n === 1 ? 50 : (i * 100) / (n - 1)) * Math.PI) / 180
        const x = -radius * Math.cos(a)
        const y = -radius * Math.sin(a)
        return (
          <button
            key={it.label}
            className={'petal' + (it.active ? ' active' : '')}
            data-tip={it.label}
            aria-label={it.label}
            tabIndex={open ? 0 : -1}
            style={{
              transform: open ? `translate(${x}px, ${y}px) scale(1)` : 'translate(0, 0) scale(0.6)',
              transitionDelay: open ? `${20 + i * 22}ms` : `${(n - 1 - i) * 14}ms`
            }}
            onClick={() => {
              it.onClick()
              setOpen(false)
            }}
          >
            {it.icon}
          </button>
        )
      })}
      <button
        className="fab"
        aria-expanded={open}
        aria-label={open ? 'Close quick menu' : 'Quick menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <LuPlus />
      </button>
    </div>
  )
}
