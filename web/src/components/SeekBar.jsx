import { useRef, useState } from 'react'

/**
 * A progress bar you can click or drag to jump to a spot. Hovering shows where you'd land:
 * `describe(fraction)` → { time, text } (the words at that point). `dark` is for the reels.
 */
export function SeekBar({ progress, onSeek, describe, dark = false, className = '' }) {
  const bar = useRef(null)
  const [hover, setHover] = useState(null) // { x: 0..1, time, text }
  const dragging = useRef(false)

  const fractionAt = (e) => {
    const r = bar.current.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  }
  const preview = (e) => {
    if (!describe) return
    const x = fractionAt(e)
    setHover({ x, ...describe(x) })
  }

  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      className={`group relative cursor-pointer py-1.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation()
        dragging.current = true
        bar.current.setPointerCapture?.(e.pointerId)
        preview(e)
      }}
      onPointerMove={(e) => {
        preview(e)
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return
        dragging.current = false
        onSeek?.(fractionAt(e))
        if (e.pointerType !== 'mouse') setHover(null)
      }}
      onPointerLeave={() => !dragging.current && setHover(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek?.(Math.min(1, progress + 0.02))
        if (e.key === 'ArrowLeft') onSeek?.(Math.max(0, progress - 0.02))
      }}
    >
      <div className={`relative h-1.5 rounded-full transition-[height] group-hover:h-2.5 ${dark ? 'bg-white/25' : 'bg-line'}`}>
        <div className={`h-full rounded-full ${dark ? 'bg-white' : 'bg-brand'}`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
        <span
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow transition-opacity group-hover:opacity-100 ${dark ? 'bg-white' : 'bg-brand'}`}
          style={{ left: `${Math.min(100, progress * 100)}%` }}
        />
        {hover && <span className={`absolute inset-y-0 w-0.5 ${dark ? 'bg-white/70' : 'bg-ink/40'}`} style={{ left: `${hover.x * 100}%` }} />}
      </div>
      {hover && (
        <span
          className="pointer-events-none absolute bottom-full z-10 mb-1.5 max-w-[16rem] -translate-x-1/2 rounded-lg bg-black/85 px-2 py-1 text-[11px] leading-tight whitespace-nowrap text-white shadow-lg"
          style={{ left: `clamp(4rem, ${hover.x * 100}%, calc(100% - 4rem))` }}
        >
          <b>{hover.time}</b>
          {hover.text && <span className="block max-w-[15rem] truncate opacity-80">{hover.text}…</span>}
        </span>
      )}
    </div>
  )
}
