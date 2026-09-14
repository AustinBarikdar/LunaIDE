import * as pty from 'node-pty'
import type { WebContents } from 'electron'

const ptys = new Map<string, pty.IPty>()
/** last ~200KB of output per pty, replayed when a view re-attaches (mode/workspace switches) */
const buffers = new Map<string, string[]>()
const MAX_BUF = 200_000
let onTerminalsChanged: () => void = () => {}
/** Called after any pty is spawned, exits, or is killed (the Agents view shows who has a terminal). */
export const setPtyListener = (cb: () => void): void => {
  onTerminalsChanged = cb
}
/** agent name -> terminal id, for terminals launched via the Claude/Codex buttons */
const agentTerms = new Map<string, string>()

/**
 * First identity nobody is using: claude, then claude-2, claude-3…
 *
 * ponytail: the renderer numbers terminals from its own list, which it loses on a reload while
 * the ptys live on. Two terminals answering to one identity means one shared inbox — messages
 * meant for one agent get read by the other — so main has the last word on who is who.
 */
export function freeIdentity(wanted: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(wanted)) return wanted
  const base = wanted.replace(/-\d+$/, '')
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

export function spawnPty(id: string, cwd: string, wc: WebContents, agent?: string): void {
  killPty(id)
  const identity = agent ? freeIdentity(agent, agentsWithTerminal()) : undefined
  if (identity) {
    agentTerms.set(identity, id)
    // tell the renderer when it asked for a name that was taken
    if (identity !== agent) wc.send('pty-agent', id, identity)
  }
  const shell = process.env.SHELL ?? '/bin/zsh'
  // ponytail: login shell so ~/.local/bin (claude) and nvm (codex) are on PATH
  const p = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    // LUNA_AGENT is the terminal's hub identity (claude, claude-2, codex…); the CLIs pass it as a header
    env: {
      ...process.env,
      TERM_PROGRAM: 'luna',
      ...(identity ? { LUNA_AGENT: identity } : {})
    } as Record<string, string>
  })
  buffers.set(id, [])
  // ponytail: running byte count; summing every chunk on every chunk was O(n²) for chatty output
  let total = 0
  p.onData((data) => {
    const b = buffers.get(id)!
    b.push(data)
    total += data.length
    while (total > MAX_BUF && b.length > 1) total -= b.shift()!.length
    wc.send('pty-data', id, data)
  })
  p.onExit(({ exitCode }) => {
    if (ptys.get(id) !== p) return // already replaced by a newer pty under this id
    ptys.delete(id)
    for (const [a, tid] of agentTerms) if (tid === id) agentTerms.delete(a)
    if (!wc.isDestroyed()) wc.send('pty-exit', id, exitCode)
    onTerminalsChanged()
  })
  ptys.set(id, p)
  onTerminalsChanged()
}

/** Buffered output for a live pty, or null when no pty exists under this id. */
export const attachPty = (id: string): string | null =>
  ptys.has(id) ? (buffers.get(id) ?? []).join('') : null

export const writePty = (id: string, data: string): void => ptys.get(id)?.write(data)
export const resizePty = (id: string, cols: number, rows: number): void =>
  ptys.get(id)?.resize(Math.max(2, cols), Math.max(1, rows))
export const agentsWithTerminal = (): string[] =>
  [...agentTerms.keys()].filter((a) => ptys.has(agentTerms.get(a)!))

/** Type a (possibly multi-line) prompt into an agent's terminal as a bracketed paste, then submit. */
export function sendToAgent(agent: string, text: string): boolean {
  const id = agentTerms.get(agent)
  const p = id && ptys.get(id)
  if (!p) return false
  p.write(`\x1b[200~${text}\x1b[201~`)
  // ponytail: a short pause lets the TUI finish the paste before Enter submits it
  setTimeout(() => p.write('\r'), 200)
  return true
}

export function killPty(id: string): void {
  ptys.get(id)?.kill()
  ptys.delete(id)
  buffers.delete(id)
  for (const [a, tid] of agentTerms) if (tid === id) agentTerms.delete(a)
  onTerminalsChanged()
}
export const killAll = (): void => ptys.forEach((_, id) => killPty(id))
