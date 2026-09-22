import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { live } from './termStore'
import { termTheme, terminalFontSize } from './theme'
import { findPathLinks, resolveLink } from './termLinks'

/** agent = hub identity for agent terminals (claude, claude-2, codex…); cmd = what to run */
/** cwd: a folder other than the project root, e.g. "Open terminal here" from the file tree. */
export type Term = {
  id: string
  name: string
  cmd?: string
  agent?: string
  ws: string
  cwd?: string
}

// paths already seen on disk; a miss is asked again since the file may appear later
const known = new Set<string>()
let home = ''
const exists = async (p: string): Promise<boolean> => {
  if (known.has(p)) return true
  const yes = await window.luna.fs.exists(p)
  if (yes) known.add(p)
  return yes
}

/** File paths in the output link to the editor (⌘-click, like a URL), at the line if one is printed. */
function linkPaths(term: Terminal, cwd: string): void {
  if (!home) window.luna.fs.home().then((h) => (home = h))
  term.registerLinkProvider({
    provideLinks(y, cb) {
      const text = term.buffer.active.getLine(y - 1)?.translateToString(true) ?? ''
      const found = findPathLinks(text)
      if (!found.length) return cb(undefined)
      Promise.all(
        found.map(async (f) => {
          const abs = resolveLink(f.path, cwd, home)
          if (!(await exists(abs))) return null
          return {
            range: { start: { x: f.start + 1, y }, end: { x: f.end, y } },
            text: text.slice(f.start, f.end),
            activate: (ev: MouseEvent) =>
              (ev.metaKey || ev.ctrlKey) &&
              window.dispatchEvent(
                new CustomEvent('luna:open-path', {
                  detail: { path: abs, line: f.line, col: f.col }
                })
              )
          }
        })
      ).then((links) => cb(links.filter((l) => l !== null)))
    }
  })
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
        theme: termTheme(),
        allowTransparency: true,
        fontFamily: 'SF Mono, Menlo, monospace',
        fontSize: terminalFontSize(),
        lineHeight: 1.25,
        cursorBlink: true,
        scrollback: 5000
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      linkPaths(term, cwd)
      const host = document.createElement('div')
      host.className = 'term-inner'
      // xterm measures the character cell when it opens, so the host has to be in the document
      // already — opening detached leaves the terminal stuck at 80x24 and painting nothing.
      el.appendChild(host)
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
    const { host, fit, term: xterm } = rec
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
    // ponytail: moving the host to another pane leaves the DOM renderer showing nothing until it
    // is told to repaint, so re-attaching always ends with a fit and a full refresh.
    setTimeout(() => {
      doFit()
      xterm.refresh(0, xterm.rows - 1)
    }, 0)
    return () => {
      clearTimeout(timer)
      ro.disconnect()
      if (host.parentElement === el) host.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cwd])
  return <div ref={ref} className="term-view" data-id={id} hidden={!visible} />
}
