// CodeMirror glue for Luna's LSP client: diagnostics from main → lint markers; completions, hover
// text and go-to-definition on demand.
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { linter, lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { EditorView, ViewPlugin, hoverTooltip, keymap, type ViewUpdate } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import type { Text } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import type { LspDiagnostic } from '../../../preload/index.d'

const KIND: Record<number, string> = {
  1: 'text',
  2: 'method',
  3: 'function',
  4: 'constructor',
  5: 'field',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  13: 'enum',
  14: 'keyword',
  21: 'constant',
  22: 'struct'
}

/** Latest diagnostics per file, per source. The linter() source below reads from here. */
const store = new Map<string, Map<string, LspDiagnostic[]>>()
const listeners = new Set<(s: typeof store) => void>()
const emit = (): void => listeners.forEach((l) => l(new Map(store)))
/** Subscribe to the whole diagnostics picture (Problems view). Returns an unsubscribe. */
export function subscribeProblems(
  cb: (s: Map<string, Map<string, LspDiagnostic[]>>) => void
): () => void {
  listeners.add(cb)
  cb(new Map(store))
  return () => listeners.delete(cb)
}

export function clearDiagnostics(): void {
  store.clear()
  pending.clear()
  emit()
}

/** Mounted editor views by path, plus a reveal that waits for the view if the file is still opening. */
const views = new Map<string, EditorView>()
const pending = new Map<string, { line: number; ch: number }>()
export function registerView(path: string, view: EditorView): void {
  views.set(path, view)
  const p = pending.get(path)
  if (p) {
    pending.delete(path)
    setTimeout(() => revealIn(view, p.line, p.ch), 30)
  }
}
export const unregisterView = (path: string): void => {
  views.delete(path)
}
export const viewFor = (path: string): EditorView | undefined => views.get(path)
function revealIn(view: EditorView, line: number, ch: number): void {
  const l = view.state.doc.line(Math.min(view.state.doc.lines, line + 1))
  const pos = Math.min(l.to, l.from + ch)
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    scrollIntoView: true
  })
  view.focus()
}
/** Move the cursor to line/ch in a file's editor now, or as soon as that editor mounts. */
export function reveal(path: string, line: number, ch: number): void {
  const v = views.get(path)
  if (v) revealIn(v, line, ch)
  else pending.set(path, { line, ch })
}

function toCm(doc: Text, bySource: Map<string, LspDiagnostic[]> | undefined): Diagnostic[] {
  if (!bySource) return []
  const pos = (l: number, c: number): number => {
    const line = doc.line(Math.min(doc.lines, l + 1))
    return Math.min(line.to, line.from + c)
  }
  const all: Diagnostic[] = []
  for (const list of bySource.values())
    for (const d of list) {
      const from = pos(d.from.line, d.from.ch)
      const to = Math.max(from, pos(d.to.line, d.to.ch))
      all.push({
        from,
        to: to === from ? Math.min(doc.length, from + 1) : to,
        severity: d.severity,
        message: d.message,
        source: d.source
      })
    }
  return all
}

/** Record new diagnostics for a file and, if its editor is mounted, redraw them now. */
export function updateDiagnostics(
  path: string,
  source: string,
  list: LspDiagnostic[],
  view?: EditorView
): number {
  const m = store.get(path) ?? new Map<string, LspDiagnostic[]>()
  m.set(source, list)
  store.set(path, m)
  // forceLinting only flushes a queued run; push the new set directly (the linter() field is already installed)
  if (view) view.dispatch(setDiagnostics(view.state, toCm(view.state.doc, m)))
  emit()
  return [...m.values()].flat().length
}
export const forgetDiagnostics = (path: string): void => {
  store.delete(path)
  emit()
}

/** Extensions for one open file: gutter, change notifications (debounced), LSP-backed completion. */
export type Goto = (path: string, line: number, ch: number) => void

/** Line/ch (0-based) of a document position. */
const at = (view: EditorView, pos: number): { line: number; ch: number } => {
  const line = view.state.doc.lineAt(pos)
  return { line: line.number - 1, ch: pos - line.from }
}
/** The word around pos, or null when pos sits on whitespace or punctuation. */
const wordAt = (view: EditorView, pos: number): { from: number; to: number } | null => {
  const w = view.state.wordAt(pos)
  return w && w.from < w.to ? { from: w.from, to: w.to } : null
}

/** Jump to the definition of the symbol at pos; the first location the server names wins. */
async function gotoDefinition(
  view: EditorView,
  path: string,
  pos: number,
  go: Goto
): Promise<void> {
  const { line, ch } = at(view, pos)
  const [loc] = await window.luna.lsp.definition(path, line, ch)
  if (loc) go(loc.path, loc.line, loc.ch)
}

export function lspExtensions(path: string, goto?: Goto): Extension {
  let t: ReturnType<typeof setTimeout>
  const sync = ViewPlugin.fromClass(
    class {
      update(u: ViewUpdate): void {
        if (!u.docChanged) return
        clearTimeout(t)
        const text = u.state.doc.toString()
        t = setTimeout(() => window.luna.lsp.change(path, text), 250)
      }
      destroy(): void {
        clearTimeout(t)
      }
    }
  )
  const source = async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const word = ctx.matchBefore(/[\w.$]*/)
    if (!ctx.explicit && (!word || word.from === word.to)) return null
    const line = ctx.state.doc.lineAt(ctx.pos)
    const items = await window.luna.lsp.complete(path, line.number - 1, ctx.pos - line.from)
    if (!items.length) return null
    const from = word && !word.text.endsWith('.') ? word.from : ctx.pos
    return {
      from,
      options: items.map((i) => ({
        label: i.label,
        detail: i.detail,
        type: KIND[i.kind ?? 1] ?? 'text',
        apply: i.insert
      })),
      validFor: /^[\w$]*$/
    }
  }
  // linter() owns the lint state field, so it survives the react wrapper's reconfigure calls
  const lint = linter((view) => toCm(view.state.doc, store.get(path)), { delay: 60 })
  // what the server knows about the word under the pointer, as plain text
  const hover = hoverTooltip(
    async (view, pos) => {
      const word = wordAt(view, pos)
      if (!word) return null
      const { line, ch } = at(view, pos)
      const text = await window.luna.lsp.hover(path, line, ch)
      if (!text) return null
      return {
        pos: word.from,
        end: word.to,
        above: true,
        create: () => {
          const dom = document.createElement('div')
          dom.className = 'cm-hover-doc'
          dom.textContent = text
          return { dom }
        }
      }
    },
    { hoverTime: 350 }
  )
  const jump: Extension = goto
    ? [
        keymap.of([
          {
            key: 'F12',
            run: (view) => {
              void gotoDefinition(view, path, view.state.selection.main.head, goto)
              return true
            }
          }
        ]),
        // ⌘-click (Ctrl-click elsewhere) on a word jumps to where it is defined
        EditorView.domEventHandlers({
          mousedown: (e, view) => {
            if (!(e.metaKey || e.ctrlKey) || e.button !== 0) return false
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
            if (pos === null || !wordAt(view, pos)) return false
            e.preventDefault()
            void gotoDefinition(view, path, pos, goto)
            return true
          }
        })
      ]
    : []
  return [
    lintGutter(),
    lint,
    sync,
    autocompletion({ override: [source], activateOnTyping: true }),
    hover,
    jump
  ]
}
