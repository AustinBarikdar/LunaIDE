/** Move one item of a list to another item's place. */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

/** Move the item matching `id` to where the item matching `overId` sits (by any key). */
export function moveById<T>(list: T[], id: string, overId: string, key: (t: T) => string): T[] {
  return move(
    list,
    list.findIndex((t) => key(t) === id),
    list.findIndex((t) => key(t) === overId)
  )
}

/** What is being dragged right now, so drop targets can say what would land on them. */
let active: { kind: string; label: string } | null = null

type Props = {
  draggable: true
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
}

/** Drop-target half of the pair, for an element that accepts a drag but is not itself dragged. */
export function dropProps(
  id: string,
  kind: string,
  onDrop: (from: string, to: string) => void
): Omit<Props, 'draggable' | 'onDragStart' | 'onDragEnd'> {
  const full = dragProps(id, kind, onDrop)
  return {
    onDragOver: full.onDragOver,
    onDragEnter: full.onDragEnter,
    onDragLeave: full.onDragLeave,
    onDrop: full.onDrop
  }
}

/**
 * The drag ended with nothing taking it and the pointer past the window's edge: the user pulled
 * the thing out of the window. A drop on plain chrome inside the window is not that.
 */
export function droppedOutside(
  e: Pick<DragEvent, 'dataTransfer' | 'screenX' | 'screenY'>
): boolean {
  if (e.dataTransfer?.dropEffect !== 'none') return false
  const { screenX: x, screenY: y, outerWidth: w, outerHeight: h } = window
  return e.screenX < x || e.screenY < y || e.screenX > x + w || e.screenY > y + h
}

/** Drag-source half, for a handle whose drop is handled by something else (a slot, say). */
export function dragSource(
  id: string,
  kind: string,
  label = '',
  /** Called when the drag ends outside the window: tear the thing off into its own window. */
  onDragOut?: () => void
): Pick<Props, 'draggable' | 'onDragStart' | 'onDragEnd'> {
  const full = dragProps(id, kind, () => {}, label, onDragOut)
  return { draggable: true, onDragStart: full.onDragStart, onDragEnd: full.onDragEnd }
}

/**
 * Make one element of a list draggable onto its siblings.
 *
 * ponytail: plain HTML5 drag and drop, no library. `kind` keeps each list's drags to itself
 * (dataTransfer types are lowercased by the browser, so keep it lowercase).
 */
export function dragProps(
  id: string,
  kind: string,
  onDrop: (from: string, to: string) => void,
  /** Shown inside the drop target while it is hovered, e.g. "terminals goes here". */
  label = '',
  onDragOut?: () => void
): Props {
  const mine = (e: React.DragEvent): boolean => e.dataTransfer.types.includes(kind)
  return {
    draggable: true,
    onDragStart: (e) => {
      // the innermost draggable wins: a tab drag must not also start its pane's drag
      e.stopPropagation()
      e.dataTransfer.setData(kind, id)
      e.dataTransfer.effectAllowed = 'move'
      e.currentTarget.classList.add('dragging')
      // dataTransfer data cannot be read until the drop, so remember it here for the preview
      active = { kind, label }
    },
    onDragEnd: (e) => {
      active = null
      e.currentTarget.classList.remove('dragging')
      document.querySelectorAll('.drag-over').forEach((el) => {
        el.classList.remove('drag-over')
        el.removeAttribute('data-drop-label')
      })
      if (onDragOut && droppedOutside(e)) onDragOut()
    },
    onDragOver: (e) => {
      if (!mine(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDragEnter: (e) => {
      if (!mine(e)) return
      e.currentTarget.classList.add('drag-over')
      if (active?.label) e.currentTarget.setAttribute('data-drop-label', active.label)
    },
    onDragLeave: (e) => {
      e.currentTarget.classList.remove('drag-over')
      e.currentTarget.removeAttribute('data-drop-label')
    },
    onDrop: (e) => {
      e.currentTarget.classList.remove('drag-over')
      e.currentTarget.removeAttribute('data-drop-label')
      if (!mine(e)) return
      e.preventDefault()
      e.stopPropagation()
      const from = e.dataTransfer.getData(kind)
      if (from && from !== id) onDrop(from, id)
    }
  }
}
