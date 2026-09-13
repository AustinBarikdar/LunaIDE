import { StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { diffLineMap } from './diff'

class DeletedLine extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-deleted'
    el.textContent = '− ' + (this.text || ' ')
    return el
  }
}

/** Green line backgrounds for added lines; red block widgets where lines were removed. */
export function diffOverlay(fileDiff: string): Extension {
  const { added, deleted } = diffLineMap(fileDiff)
  const field = StateField.define<DecorationSet>({
    create(state) {
      const marks: { from: number; deco: Decoration }[] = []
      const lines = state.doc.lines
      for (const n of added)
        if (n <= lines)
          marks.push({ from: state.doc.line(n).from, deco: Decoration.line({ class: 'cm-added' }) })
      for (const d of deleted) {
        const at = Math.min(d.line, lines)
        // ponytail: widget goes above the line the deletion preceded; positions drift if the file changed since the post
        marks.push({
          from: at <= lines && at > 0 ? state.doc.line(at).from : state.doc.length,
          deco: Decoration.widget({ widget: new DeletedLine(d.text), block: true, side: -1 })
        })
      }
      marks.sort((a, b) => a.from - b.from || (a.deco.spec.block ? -1 : 1))
      return Decoration.set(
        marks.map((m) => m.deco.range(m.from)),
        true
      )
    },
    update: (deco, tr) => deco.map(tr.changes),
    provide: (f) => EditorView.decorations.from(f)
  })
  return field // .cm-added is styled in styles.css
}
