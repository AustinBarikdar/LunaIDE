import type { EditorStatus } from './commands'

/**
 * Cursor position and language of the focused editor, kept outside React state.
 *
 * ponytail: this changes on every keystroke and cursor move. Holding it in App state re-rendered
 * the whole window each time; only the status bar reads it, so only the status bar subscribes.
 */
let current: EditorStatus | null = null
const subs = new Set<() => void>()
const same = (a: EditorStatus | null, b: EditorStatus | null): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    a.path === b.path &&
    a.line === b.line &&
    a.column === b.column &&
    a.language === b.language)

export const editorStatus = {
  get: (): EditorStatus | null => current,
  set: (s: EditorStatus | null): void => {
    if (same(current, s)) return
    current = s
    subs.forEach((f) => f())
  },
  subscribe: (f: () => void): (() => void) => {
    subs.add(f)
    return () => subs.delete(f)
  }
}
