// Hooks for the animata-ported effects (kept out of fx.tsx so fast refresh stays happy).
import { useEffect, useState, type RefObject } from 'react'

/** macOS-dock magnification for the children of `ref` matching `selector` (animata container/animated-dock). */
export function useDockMagnify(
  ref: RefObject<HTMLElement | null>,
  selector = '.act',
  reach = 90,
  max = 0.3
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const items = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>(selector)]
    const move = (e: MouseEvent): void => {
      for (const it of items()) {
        const r = it.getBoundingClientRect()
        const d = Math.abs(e.clientY - (r.top + r.height / 2))
        it.style.transform = `scale(${1 + max * Math.max(0, 1 - d / reach)})`
      }
    }
    const leave = (): void => items().forEach((it) => (it.style.transform = ''))
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseleave', leave)
    return () => {
      el.removeEventListener('mousemove', move)
      el.removeEventListener('mouseleave', leave)
    }
  }, [ref, selector, reach, max])
}

/** Types `text` in one character at a time (animata text/typing-text). */
export function useTyping(text: string, speed = 22): string {
  const [st, setSt] = useState({ text, n: 0 })
  if (st.text !== text) setSt({ text, n: 0 })
  useEffect(() => {
    const t = setInterval(
      () => setSt((s) => (s.n >= s.text.length ? s : { ...s, n: s.n + 1 })),
      speed
    )
    return () => clearInterval(t)
  }, [text, speed])
  return text.slice(0, st.n)
}
