import { StateField, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet
} from '@codemirror/view'
import { diffLineMap, placeNotes, type Note, type PlacedNote } from './diff'

/** The bubble itself: a step number and the agent's plain-language reason. */
const bubble = (n: PlacedNote): HTMLElement => {
  const el = document.createElement('div')
  el.className = 'cm-note' + (n.removed ? ' removed' : '')
  const num = document.createElement('span')
  num.className = 'cm-note-step'
  num.textContent = String(n.step)
  const why = document.createElement('span')
  why.className = 'cm-note-why'
  why.textContent = n.why
  el.append(num, why)
  return el
}

class DeletedLine extends WidgetType {
  constructor(
    readonly text: string,
    readonly notes: PlacedNote[]
  ) {
    super()
  }
  eq(other: DeletedLine): boolean {
    return other.text === this.text && other.notes.length === this.notes.length
  }
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-deleted'
    el.textContent = '− ' + (this.text || ' ')
    // a note about a removal hangs off the red line it explains
    for (const n of this.notes) el.appendChild(bubble(n))
    return el
  }
}

class NoteWidget extends WidgetType {
  constructor(readonly note: PlacedNote) {
    super()
  }
  eq(other: NoteWidget): boolean {
    return other.note.step === this.note.step && other.note.why === this.note.why
  }
  toDOM(): HTMLElement {
    return bubble(this.note)
  }
}

/**
 * Green line backgrounds for added lines; red block widgets where lines were removed; and the
 * summary's notes as numbered bubbles under the lines they anchor to. `focus` scrolls to a step.
 */
export function diffOverlay(fileDiff: string, notes: Note[] = [], file = '', focus = 0): Extension {
  const { added, deleted } = diffLineMap(fileDiff)
  let focusPos = -1
  const field = StateField.define<DecorationSet>({
    create(state) {
      const marks: { from: number; deco: Decoration }[] = []
      const lines = state.doc.lines
      const placed = placeNotes(state.doc.toString(), { added, deleted }, notes, file)
      for (const n of added)
        if (n <= lines)
          marks.push({ from: state.doc.line(n).from, deco: Decoration.line({ class: 'cm-added' }) })
      for (const d of deleted) {
        const at = Math.min(d.line, lines)
        const mine = placed.filter((n) => n.removed && n.line === d.line)
        // ponytail: widget goes above the line the deletion preceded; positions drift if the file changed since the post
        marks.push({
          from: at <= lines && at > 0 ? state.doc.line(at).from : state.doc.length,
          deco: Decoration.widget({ widget: new DeletedLine(d.text, mine), block: true, side: -1 })
        })
      }
      for (const n of placed) {
        if (n.removed || n.line > lines) continue
        marks.push({
          from: state.doc.line(n.line).to,
          deco: Decoration.widget({ widget: new NoteWidget(n), block: true, side: 1 })
        })
      }
      const target = placed.find((n) => n.step === focus)
      if (target && target.line <= lines) focusPos = state.doc.line(target.line).from
      marks.sort((a, b) => a.from - b.from || (a.deco.spec.block ? -1 : 1))
      return Decoration.set(
        marks.map((m) => m.deco.range(m.from)),
        true
      )
    },
    update: (deco, tr) => deco.map(tr.changes),
    provide: (f) => EditorView.decorations.from(f)
  })
  // scroll the focused step into view once the editor exists
  const scroll = ViewPlugin.define((view) => {
    if (focusPos >= 0)
      setTimeout(
        () => view.dispatch({ effects: EditorView.scrollIntoView(focusPos, { y: 'center' }) }),
        0
      )
    return {}
  })
  return [field, scroll] // .cm-added / .cm-note are styled in styles.css
}
