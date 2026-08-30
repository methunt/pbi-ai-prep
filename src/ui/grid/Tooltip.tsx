// A pure-CSS `position:absolute` tooltip cannot know the trigger's actual
// screen position or the viewport edge — for the far-right DAX column it
// silently overflows off-screen and gets clipped by the grid's scroll
// container (`overflow-x-hidden` / `overflow-y-auto`), and for rows near the
// sticky header it can render behind/through it regardless of z-index. Both
// were reported live: tooltips cut off at the screen edge and "randomly
// placed" text. This portals the tooltip into `document.body` as
// `position: fixed`, measures the trigger's real `getBoundingClientRect()` on
// hover/focus, and clamps the tooltip's own box inside the viewport with a
// margin — so it can never be cut off or collide with the header.
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface TooltipProps {
  /** The hover/focus target — rendered inline, unchanged. */
  children: ReactNode
  /** Tooltip body content. */
  content: ReactNode
  /** Extra className for the tooltip panel (e.g. monospace DAX styling). */
  contentClassName?: string
  /** Wrapper element className (defaults to inline-flex like the old `.tip`). */
  className?: string
}

const VIEWPORT_MARGIN = 8
const GAP = 8

export default function Tooltip({ children, content, contentClassName = '', className = '' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null)

  // Measure AFTER the tooltip has mounted (so bodyRef has real dimensions),
  // then clamp against the viewport — never off the top/bottom/left/right.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const body = bodyRef.current
    if (trigger === null || body === null) return

    const triggerRect = trigger.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Prefer opening BELOW the trigger (matches the grid's sticky header
    // living above every row); flip above only if there truly isn't room.
    let top = triggerRect.bottom + GAP
    if (top + bodyRect.height > vh - VIEWPORT_MARGIN) {
      const above = triggerRect.top - GAP - bodyRect.height
      if (above >= VIEWPORT_MARGIN) top = above
      else top = Math.max(VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - bodyRect.height)
    }

    // Center on the trigger horizontally, then clamp fully inside the
    // viewport — this is what actually fixes "cut off at the screen edge".
    let left = triggerRect.left + triggerRect.width / 2 - bodyRect.width / 2
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), vw - bodyRect.width - VIEWPORT_MARGIN)

    setStyle({ top, left })
  }, [open, content])

  return (
    <span
      ref={triggerRef}
      className={`inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={bodyRef}
            role="tooltip"
            className={`fixed z-[100] rounded-lg border-2 border-foreground/85 bg-card text-foreground shadow-lg ${contentClassName}`}
            style={{
              top: style?.top ?? -9999,
              left: style?.left ?? -9999,
              // Invisible until measured (prevents a flash at 0,0 before the
              // layout effect clamps it into place).
              visibility: style === null ? 'hidden' : 'visible',
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  )
}
