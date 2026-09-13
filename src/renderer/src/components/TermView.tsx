import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { live } from './termStore'

/** agent = hub identity for agent terminals (claude, claude-2, codex…); cmd = what to run */
export type Term = { id: string; name: string; cmd?: string; agent?: string; ws: string }

const theme = {
  background: 'rgba(0,0,0,0)',
  foreground: '#1f1f24',
  cursor: '#6c5ce7',
  selectionBackground: 'rgba(108,92,231,0.25)',
  black: '#1f1f24',
  red: '#c62828',
  green: '#2e7d32',
  yellow: '#9a6700',
  blue: '#1a56db',
  magenta: '#8e24aa',
  cyan: '#00838f',
  white: '#8a8a94',
  brightBlack: '#6f6f7a',
  brightRed: '#d64545',
  brightGreen: '#3a9a4a',
  brightYellow: '#b58100',
  brightBlue: '#3b6fe0',
  brightMagenta: '#a64bc2',
  brightCyan: '#0aa0b0',
  brightWhite: '#1f1f24'
}

export default function TermView({
  id,
  cwd,
  cmd,
  agent,
  visible
}: {
  id: string
  cwd: string
  cmd?: string
  agent?: string
  visible: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current!
    let rec = live.get(id)
    if (!rec) {
      const term = new Terminal({
        theme,
        allowTransparency: true,
        fontFamily: 'SF Mono, Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.25,
        cursorBlink: true,
        scrollback: 5000
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      const host = document.createElement('div')
      host.className = 'term-inner'
      term.open(host)
      const offData = window.luna.pty.onData((tid, d) => tid === id && term.write(d))
      const offExit = window.luna.pty.onExit(
        (tid, code) => tid === id && term.write(`\r\n\x1b[2m[exited ${code}]\x1b[0m\r\n`)
      )
      term.onData((d) => window.luna.pty.write(id, d))
      term.onResize(({ cols, rows }) => window.luna.pty.resize(id, cols, rows))
      rec = {
        host,
        term,
        fit,
        off: () => {
          offData()
          offExit()
        }
      }
      live.set(id, rec)
      window.luna.pty.attach(id).then((buf) => {
        if (buf === null) {
          window.luna.pty.spawn(id, cwd, agent)
          // The fit that sized this xterm ran before the pty existed, so tell the new pty its
          // size explicitly — otherwise the shell would wrap at node-pty's default 80 columns.
          window.luna.pty.resize(id, term.cols, term.rows)
          // ponytail: typed-ahead input; the tty buffers it until the shell reads its first line
          if (cmd) window.luna.pty.write(id, cmd + '\r')
        } else {
          term.write(buf)
        }
      })
    }
    const { host, fit } = rec
    el.appendChild(host)
    // ponytail: one fit per settled layout, so dragging a divider resizes the pty once.
    let timer: number | undefined
    const doFit = (): void => {
      if (!el.offsetParent || !el.clientWidth || !el.clientHeight) return
      try {
        fit.fit()
      } catch {
        /* container was torn down mid-fit */
      }
    }
    const ro = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = window.setTimeout(doFit, 150)
    })
    ro.observe(el)
    setTimeout(doFit, 0)
    return () => {
      clearTimeout(timer)
      ro.disconnect()
      if (host.parentElement === el) host.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cwd])
  return <div ref={ref} className="term-view" data-id={id} hidden={!visible} />
}
