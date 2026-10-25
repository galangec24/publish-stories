import { Clock, Eye, Flame, Search, Sparkles, TrendingUp, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../lib/api'
import { formatCount } from '../lib/readingMode'
import { RatingBadge } from './StoryRating'

const HISTORY_KEY = 'search-history'
const HISTORY_MAX = 8

function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)))
  } catch {
    /* private mode: no history */
  }
}

const sameEntry = (a, b) => (a.slug ? a.slug === b.slug : !b.slug && a.q?.toLowerCase() === b.q?.toLowerCase())

function Thumb({ story }) {
  return story.cover_image ? (
    <img src={story.cover_image} alt="" className="h-12 w-9 shrink-0 rounded object-cover shadow" loading="lazy" />
  ) : (
    <span
      className="grid h-12 w-9 shrink-0 place-items-center rounded font-display text-lg text-white shadow"
      style={{ background: story.genre?.color || 'var(--brand)' }}
    >
      {story.title.charAt(0)}
    </span>
  )
}

function Tags({ story }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      {story.hot && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-px font-semibold text-orange-400">
          <Flame className="h-3 w-3" /> Hot read
        </span>
      )}
      {story.recommended && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-px font-semibold text-brand">
          <Sparkles className="h-3 w-3" /> Recommended
        </span>
      )}
      <span className="inline-flex items-center gap-0.5">
        <Eye className="h-3 w-3" /> {formatCount(story.view_count)} views
      </span>
      <RatingBadge average={story.rating_avg} count={story.rating_count} />
      {story.genre && <span>· {story.genre.name}</span>}
      {story.is_free && <span className="text-emerald-400">· Free</span>}
    </span>
  )
}

/**
 * Search field with a Facebook-style dropdown: recent searches and what's hot before you
 * type, then matching stories with covers and Hot read / Recommended tags.
 * `onSearch(text)` shows the full results grid (Enter or "See all results").
 */
export function SearchBox({ value, onChange, onSearch, className = '' }) {
  const navigate = useNavigate()
  const listId = useId()
  const box = useRef(null)
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState(loadHistory)
  const [results, setResults] = useState(null)
  const [active, setActive] = useState(-1)
  const q = value.trim()

  // Suggestions follow the text with a short pause; empty text shows what's hot.
  useEffect(() => {
    if (!open) return
    let live = true
    const t = setTimeout(
      () =>
        api
          .get('search/suggest/', { q })
          .then((d) => live && setResults(d))
          .catch(() => live && setResults({ query: q, results: [] })),
      q ? 200 : 0,
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q, open])

  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => setActive(-1), [q])

  function remember(entry) {
    const next = [entry, ...history.filter((h) => !sameEntry(h, entry))]
    setHistory(next)
    saveHistory(next)
  }

  function forget(entry) {
    const next = history.filter((h) => !sameEntry(h, entry))
    setHistory(next)
    saveHistory(next)
  }

  function openStory(story) {
    remember({ slug: story.slug, title: story.title, cover_image: story.cover_image, genre: story.genre })
    setOpen(false)
    navigate(`/stories/${story.slug}`)
  }

  function searchAll(text) {
    const t = text.trim()
    if (!t) return
    remember({ q: t })
    onChange(t)
    onSearch(t)
    setOpen(false)
  }

  const stories = results?.query === q ? results.results : null
  // Rows reachable with the arrow keys, in display order.
  const rows = q
    ? [...(stories || []).map((s) => ({ kind: 'story', story: s })), { kind: 'all' }]
    : [...history.map((h) => ({ kind: 'history', entry: h })), ...(stories || []).map((s) => ({ kind: 'story', story: s }))]

  function choose(row) {
    if (row.kind === 'story') openStory(row.story)
    else if (row.kind === 'all') searchAll(q)
    else if (row.entry.slug) openStory(row.entry)
    else searchAll(row.entry.q)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && rows[active]) choose(rows[active])
      else searchAll(value)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const rowClass = (i) => `flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${i === active ? 'bg-surface-2' : 'hover:bg-surface-2'}`
  let index = -1

  return (
    <div ref={box} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        className="input !pl-9"
        placeholder="Search titles, authors, genres…"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {value && (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-surface-2 hover:text-ink"
          onClick={() => {
            onChange('')
            onSearch('')
          }}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div id={listId} role="listbox" className="card absolute top-full left-0 z-50 mt-2 max-h-[70vh] w-[min(92vw,420px)] overflow-y-auto p-2 shadow-2xl">
          {!q && history.length > 0 && (
            <>
              <div className="flex items-center justify-between px-2 pt-1 pb-1">
                <p className="text-sm font-semibold">Recent</p>
                <button
                  type="button"
                  className="text-xs text-brand hover:underline"
                  onClick={() => {
                    setHistory([])
                    saveHistory([])
                  }}
                >
                  Clear all
                </button>
              </div>
              {history.map((h) => {
                index += 1
                const i = index
                return (
                  <div key={h.slug || h.q} className="group flex items-center">
                    <button type="button" role="option" aria-selected={i === active} className={rowClass(i)} onClick={() => choose({ kind: 'history', entry: h })}>
                      {h.slug ? (
                        <Thumb story={h} />
                      ) : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2">
                          <Clock className="h-4 w-4 text-muted" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{h.slug ? h.title : h.q}</span>
                    </button>
                    <button type="button" className="rounded-full p-1.5 text-muted opacity-60 hover:bg-surface-2 hover:opacity-100" onClick={() => forget(h)} aria-label="Remove from history">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </>
          )}

          <p className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-sm font-semibold">
            {q ? (
              'Stories'
            ) : (
              <>
                <TrendingUp className="h-4 w-4 text-orange-400" /> Trending now
              </>
            )}
          </p>
          {!stories && Array.from({ length: 3 }, (_, i) => <div key={i} className="m-2 h-12 animate-pulse rounded-xl bg-surface-2" />)}
          {stories?.length === 0 && <p className="px-2 py-3 text-sm text-muted">{q ? `No stories match “${q}”.` : 'Nothing trending yet.'}</p>}
          {stories?.map((s) => {
            index += 1
            const i = index
            return (
              <button key={s.id} type="button" role="option" aria-selected={i === active} className={rowClass(i)} onClick={() => openStory(s)}>
                <Thumb story={s} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.title}</span>
                  {s.author_name && <span className="block truncate text-xs text-muted">by {s.author_name}</span>}
                  <Tags story={s} />
                </span>
              </button>
            )
          })}
          {q && (
            <button
              type="button"
              role="option"
              aria-selected={index + 1 === active}
              className={`${rowClass(index + 1)} mt-1 border-t border-line/60 pt-2`}
              onClick={() => searchAll(q)}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
                <Search className="h-4 w-4" />
              </span>
              <span className="text-sm">
                See all results for <b>“{q}”</b>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
