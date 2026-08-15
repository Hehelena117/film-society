import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Keeps children mounted while they are not on screen.
 *
 * React unmounts anything you stop rendering, so a screen that is expensive to
 * rebuild — the Lobby, which costs a model call — must stay in the tree and be
 * hidden rather than removed. `hidden` takes it out of layout without taking it
 * out of the DOM.
 *
 * Hiding an element does not preserve the window's scroll position, though:
 * the page collapses to whatever is left, the browser clamps the scroll, and
 * coming back lands you at the top. So the offset is captured on the way out
 * and restored on the way in, in a layout effect so it happens before paint.
 */
export function KeepAlive({ active, children }: { active: boolean; children: ReactNode }) {
  const savedScroll = useRef(0)
  const wasActive = useRef(active)

  useLayoutEffect(() => {
    if (wasActive.current && !active) {
      savedScroll.current = window.scrollY
    } else if (!wasActive.current && active) {
      window.scrollTo(0, savedScroll.current)
    }
    wasActive.current = active
  }, [active])

  // `hidden` alone is only a UA stylesheet rule and loses to any CSS that sets
  // display on this element; the inline style cannot be overridden by accident.
  return (
    <div hidden={!active} style={active ? undefined : { display: 'none' }}>
      {children}
    </div>
  )
}
