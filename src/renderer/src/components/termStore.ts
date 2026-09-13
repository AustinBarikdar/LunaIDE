import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

export type Live = { host: HTMLDivElement; term: Terminal; fit: FitAddon; off: () => void }

/**
 * One xterm per pty id, kept alive for the life of the terminal.
 *
 * ponytail: the xterm used to be rebuilt on every mount and fed the pty's raw replay buffer.
 * A prompt that repaints itself (a clock, a git status) writes those repaints as raw bytes, so
 * replaying them into a fresh screen stacked one prompt per repaint — the "terminal glitch" when
 * switching views. Keeping the instance (detached while unmounted, still receiving output) means
 * the buffer is replayed once, when the terminal is first shown.
 */
export const live = new Map<string, Live>()

/** Drop the xterm behind a pty; call it when the pty is killed, not when the view unmounts. */
export function disposeTerm(id: string): void {
  const rec = live.get(id)
  if (!rec) return
  rec.off()
  rec.term.dispose()
  rec.host.remove()
  live.delete(id)
}
