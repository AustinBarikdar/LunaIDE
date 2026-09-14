/**
 * Drag tabs side to side inside one bar.
 *
 * ponytail: pointer events, not HTML5 drag and drop. A native drag only reorders if you release
 * exactly on another tab; this follows the cursor, shows a caret where the tab will land, and
 * drops wherever you let go — including past both ends.
 */
export function sortableProps(
  index: number,
  onReorder: (from: number, to: number) => void,
  /** Items share this class inside the bar (default: tabs). */
  itemClass = 'tab'
): { onPointerDown: (e: React.PointerEvent) => void } {
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      const item = e.currentTarget as HTMLElement
      const bar = item.parentElement
      if (!bar) return
      const items = [...bar.children].filter((el): el is HTMLElement =>
        el.classList.contains(itemClass)
      )
      if (items.length < 2) return
      const startX = e.clientX
      const caret = document.createElement('div')
      caret.className = 'tab-caret'
      let moved = false
      let target = index

      const place = (x: number): void => {
        const found = items.findIndex((el) => {
          const r = el.getBoundingClientRect()
          return x < r.left + r.width / 2
        })
        target = found === -1 ? items.length - 1 : found > index ? found - 1 : found
        const ref = items[target]
        const r = ref.getBoundingClientRect()
        const br = bar.getBoundingClientRect()
        caret.style.left = `${(target > index ? r.right : r.left) - br.left + bar.scrollLeft}px`
      }
      const move = (ev: PointerEvent): void => {
        const dx = ev.clientX - startX
        if (!moved) {
          if (Math.abs(dx) < 5) return
          moved = true
          item.classList.add('tab-dragging')
          bar.appendChild(caret)
        }
        item.style.transform = `translateX(${dx}px)`
        place(ev.clientX)
      }
      const up = (): void => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.removeEventListener('pointercancel', up)
        window.removeEventListener('blur', up)
        caret.remove()
        item.style.transform = ''
        item.classList.remove('tab-dragging')
        if (!moved) return
        // a drag must not also count as a click on the tab
        item.addEventListener(
          'click',
          (ev) => {
            ev.stopPropagation()
            ev.preventDefault()
          },
          { capture: true, once: true }
        )
        if (target !== index) onReorder(index, target)
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
      // a lost pointer (window blur, gesture cancelled) must not leave the tab stuck mid-drag
      document.addEventListener('pointercancel', up)
      window.addEventListener('blur', up)
    }
  }
}
