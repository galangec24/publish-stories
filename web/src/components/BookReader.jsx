import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const GAP = 64

/**
 * Paginated "book" reading mode.
 *
 * The chapter is laid out with CSS multi-column inside a fixed-height frame, so
 * the browser does the pagination; we slide the columns horizontally one page
 * (or a two-page spread on wide screens) at a time. Turn pages by swiping,
 * clicking the left/right edge, the arrow keys, or the buttons.
 *
 * `startAtEnd` opens on the last page (used when going back a chapter).
 */
export function BookReader({ children, onPrevChapter, onNextChapter, hasPrev, hasNext, startAtEnd, contentKey, initialPage = null, onPageChange, jumpTo = null, controlRef }) {
  const frame = useRef(null)
  const flow = useRef(null)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [spread, setSpread] = useState(false)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const pointer = useRef(null)

  // Measure the frame; two-page spreads from 1024px wide.
  useLayoutEffect(() => {
    const el = frame.current
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setSize({ w, h })
      setSpread(w >= 900)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Count pages whenever the content or the frame size changes.
  useLayoutEffect(() => {
    if (!size.w) return
    const step = size.w + GAP
    const total = Math.max(1, Math.round((flow.current.scrollWidth + GAP) / step))
    setPages(total)
    setPage((p) => (startAtEnd && p === -1 ? total - 1 : Math.min(p, total - 1)))
  }, [size, spread, contentKey, startAtEnd, children])

  // New chapter: start at the first page, the last when coming backwards, or where the reader left off.
  useEffect(() => {
    setPage(startAtEnd ? -1 : (initialPage ?? 0))
  }, [contentKey, startAtEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback(
    (direction) => {
      if (direction > 0) {
        if (page < pages - 1) {
          setPage(page + 1)
        } else if (hasNext) onNextChapter()
      } else if (page > 0) {
        setPage(page - 1)
      } else if (hasPrev) onPrevChapter()
    },
    [page, pages, hasNext, hasPrev, onNextChapter, onPrevChapter],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])


  const onPointerDown = (e) => {
    // React passes events from portals (e.g. the unlock dialog) up to here; only the page itself turns pages.
    if (!frame.current.contains(e.target) || e.target.closest('button, a, input, textarea, select, label')) return
    pointer.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }
  const onPointerUp = (e) => {
    const start = pointer.current
    pointer.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1) // swipe left = next page, like a real book
    } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && Date.now() - start.t < 400) {
      // Tap on the outer fifths turns the page.
      const r = frame.current.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      if (x > 0.8) go(1)
      else if (x < 0.2) go(-1)
    }
  }

  const shown = Math.max(page, 0)

  // Go to the page holding an element (a section heading picked from the menu).
  useEffect(() => {
    if (!jumpTo?.id || !size.w) return
    const el = flow.current?.querySelector(`#${CSS.escape(jumpTo.id)}`)
    if (el) setPage(Math.max(0, Math.floor(el.offsetLeft / (size.w + GAP))))
  }, [jumpTo, size.w]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (page >= 0) onPageChange?.(page)
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lets "Listen" turn to the page holding the word being read.
  useEffect(() => {
    if (!controlRef) return
    controlRef.current = {
      showRange(range) {
        if (!size.w || !flow.current) return
        const r = range.getBoundingClientRect()
        if (!r.width && !r.height) return
        const x = r.left + r.width / 2 - flow.current.getBoundingClientRect().left
        const target = Math.min(pages - 1, Math.max(0, Math.floor(x / (size.w + GAP))))
        setPage((p) => (p === target ? p : target))
      },
    }
    return () => {
      controlRef.current = null
    }
  }, [controlRef, size.w, pages])
  const columnWidth = spread ? (size.w - GAP) / 2 : size.w

  return (
    <div>
      <div
        ref={frame}
        className="relative h-[max(420px,calc(100dvh-300px))] touch-pan-y overflow-hidden select-none [perspective:2000px]"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {/* Centre fold of a two-page spread */}
        {spread && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/10 to-transparent" />
        )}
        <div
          ref={flow}
          className="h-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            columnWidth: `${columnWidth}px`,
            columnGap: `${GAP}px`,
            columnFill: 'auto',
            transform: `translateX(${-shown * (size.w + GAP)}px)`,
          }}
        >
          {children}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button className="btn-ghost !px-3" onClick={() => go(-1)} disabled={shown === 0 && !hasPrev} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="range"
          min="0"
          max={pages - 1}
          value={shown}
          onChange={(e) => setPage(Number(e.target.value))}
          className="flex-1 accent-[var(--accent)]"
          aria-label="Page"
        />
        <span className="w-24 text-center text-xs text-muted tabular-nums">
          {spread ? 'Spread' : 'Page'} {shown + 1} / {pages}
        </span>
        <button className="btn-ghost !px-3" onClick={() => go(1)} disabled={shown >= pages - 1 && !hasNext} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
