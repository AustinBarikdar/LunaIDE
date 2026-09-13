// Effects ported from animata.design (MIT) to plain CSS/React: blurry blobs, magnifying dock,
// sliding tab indicator, typing text. Styles live in styles.css under "/* fx */".
import { useLayoutEffect, useRef, useState } from 'react'

/** Three slow-drifting colour blobs behind the glass (animata background/blurry-blob). */
export function Blobs(): React.JSX.Element {
  return (
    <div className="blobs" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  )
}

/** Pill that slides under the sibling matching `activeSelector` (animata tabs/fluid-tabs). Measures its own parent. */
export function SlidingIndicator({
  activeSelector,
  deps,
  className = 'indicator'
}: {
  activeSelector: string
  deps: unknown[]
  className?: string
}): React.JSX.Element {
  const me = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<{
    left: number
    width: number
    top: number
    height: number
  } | null>(null)
  useLayoutEffect(() => {
    const a = me.current?.parentElement?.querySelector<HTMLElement>(activeSelector)
    setBox(
      a
        ? { left: a.offsetLeft, width: a.offsetWidth, top: a.offsetTop, height: a.offsetHeight }
        : null
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return <span ref={me} className={className} style={box ?? { opacity: 0 }} />
}
