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
export function BookReader({ children, onPrevChapter, onNextChapter, hasPrev, hasNext, startAtEnd, contentKey }) {
  const frame = useRef(null)
  const flow = useRef(null)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [spread, setSpread] = useState(false)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [turn, setTurn] = useState(null) // 'next' | 'prev' for the flip animation
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

  // New chapter: start at the first page, or the last when coming backwards.
  useEffect(() => {
    setPage(startAtEnd ? -1 : 0)
  }, [contentKey, startAtEnd])

  const go = useCallback(
    (direction) => {
      if (direction > 0) {
        if (page < pages - 1) {
          setTurn('next')
          setPage(page + 1)
        } else if (hasNext) onNextChapter()
      } else if (page > 0) {
        setTurn('prev')
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

  useEffect(() => {
    if (!turn) return
    const t = setTimeout(() => setTurn(null), 550)
    return () => clearTimeout(t)
  }, [turn, page])

  const onPointerDown = (e) => {
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
        {/* Page-turn sheen sweeping across, for a paper feel */}
        {turn && (
          <div
            key={`${turn}${page}`}
            className={`pointer-events-none absolute inset-y-0 z-20 w-1/2 ${turn === 'next' ? 'right-0 origin-left animate-[page-turn-next_0.55s_ease-out]' : 'left-0 origin-right animate-[page-turn-prev_0.55s_ease-out]'}`}
            style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.12), rgba(255,255,255,0.08) 40%, transparent)' }}
          />
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button className="btn-ghost !px-3" onClick={() => go(-1)} disabled={shown === 0 && !hasPrev} aria-label="Previous page">
          ←
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
          →
        </button>
      </div>
    </div>
  )
}
