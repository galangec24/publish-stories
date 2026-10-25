import { Star } from 'lucide-react'
import { useState } from 'react'

import { api } from '../lib/api'
import { useToast } from './ui'

/** Read-only stars, e.g. "★ 4.6 (12)" on covers and in search. */
export function RatingBadge({ average, count, className = '' }) {
  if (!count) return null
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} title={`${Number(average).toFixed(1)} out of 5 from ${count} rating${count === 1 ? '' : 's'}`}>
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {Number(average).toFixed(1)}
      <span className="opacity-70">({count})</span>
    </span>
  )
}

function Stars({ value, onPick, size = 'h-6 w-6' }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="flex" onMouseLeave={() => setHover(0)} role={onPick ? 'radiogroup' : 'img'} aria-label={onPick ? 'Your rating' : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = shown >= n - 0.25
        const icon = <Star className={`${size} ${filled ? 'fill-amber-400 text-amber-400' : 'text-line'}`} />
        return onPick ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onPick(n)}
            className="p-0.5 transition hover:scale-110"
          >
            {icon}
          </button>
        ) : (
          <span key={n} className="p-0.5">
            {icon}
          </span>
        )
      })}
    </div>
  )
}

/** Story sidebar: the average, and the reader's own stars (or why they can't rate yet). */
export function StoryRating({ slug, state, onChange }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!state) return null

  async function rate(stars) {
    setBusy(true)
    try {
      onChange(await api.post(`stories/${slug}/rating/`, { stars }))
      toast(state.mine ? 'Rating updated. Thank you!' : 'Thanks for rating this story!')
    } catch (e) {
      toast(e, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <Stars value={state.average} size="h-4 w-4" />
        <span className="text-sm font-semibold">{state.count ? state.average.toFixed(1) : 'No ratings yet'}</span>
        {state.count > 0 && <span className="text-xs text-muted">({state.count})</span>}
      </div>
      {state.can_rate ? (
        <div className={`mt-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          <p className="text-xs text-muted">{state.mine ? 'Your rating (tap to change)' : 'Rate this story'}</p>
          <Stars value={state.mine || 0} onPick={rate} />
        </div>
      ) : (
        state.reason && (
          <p className="mt-2 text-xs text-muted">
            {state.reason}
            {state.chapters_total > 0 && !state.reason.startsWith('Authors') && (
              <span className="mt-1 block">
                <span className="block h-1.5 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(state.chapters_read / state.chapters_total) * 100}%` }} />
                </span>
                {state.chapters_read} of {state.chapters_total} chapters read
              </span>
            )}
          </p>
        )
      )}
    </div>
  )
}
