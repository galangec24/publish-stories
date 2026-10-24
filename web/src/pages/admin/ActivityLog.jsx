import { History, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/time'

const FIELD_NAMES = {
  price: 'price',
  free_chapters: 'free chapters',
  status: 'status',
  title: 'title',
  title_font: 'title font',
  font_family: 'font',
  font_size: 'font size',
  column_id: 'column',
  genre_ids: 'genres',
  is_public: 'public',
  is_active: 'shown to readers',
  note: 'note',
  name: 'name',
  url: 'link',
  account_name: 'account name',
  account_number: 'account number',
  author_name: 'author',
}

function describe(changes) {
  const parts = Object.entries(changes || {})
    .filter(([key]) => key !== '_also' && key !== 'qr_payload' && key !== 'qr_url')
    .map(([key, value]) => {
      const name = FIELD_NAMES[key] || key.replace(/_/g, ' ')
      const shown = Array.isArray(value) ? value.join(', ') || 'none' : value === '' || value === null ? 'empty' : String(value)
      return `${name}: ${key === 'price' ? `₱${shown}` : shown}`
    })
  const also = (changes?._also || []).map((key) => FIELD_NAMES[key] || key.replace(/_/g, ' '))
  if (also.length) parts.push(`also changed ${also.join(', ')}`)
  return parts.join(' · ')
}

/** Everything admins changed: who, what and when. */
export function ActivityLog() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    let live = true
    api
      .get('admin/activity/', { q: search, page })
      .then((data) => {
        if (!live) return
        setRows((list) => (page === 1 ? data.results : [...(list || []), ...data.results]))
        setHasMore(Boolean(data.next))
      })
      .catch(() => live && setRows((list) => list || []))
    return () => {
      live = false
    }
  }, [search, page])

  return (
    <div>
      <h1 className="flex items-center gap-2 font-display text-3xl">
        <History className="h-7 w-7 text-brand" /> Activity log
      </h1>
      <p className="mt-1 text-sm text-muted">Every change made in the admin area: who made it, what changed and when.</p>

      <form
        className="relative mt-4 max-w-sm"
        onSubmit={(e) => {
          e.preventDefault()
          setRows(null)
          setPage(1)
          setSearch(q.trim())
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input !pl-9" placeholder="Search story, action or admin email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {rows === null ? (
        <Spinner />
      ) : !rows.length ? (
        <p className="py-16 text-center text-muted">{search ? 'Nothing matches that search.' : 'No changes recorded yet.'}</p>
      ) : (
        <div className="card mt-5 divide-y divide-line overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-semibold">{r.action}</span>
                  {r.target_label && <span className="text-ink"> · {r.target_label}</span>}
                  {r.count > 1 && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{r.count} saves</span>}
                </p>
                {describe(r.changes) && <p className="mt-0.5 text-xs text-muted">{describe(r.changes)}</p>}
              </div>
              <div className="text-right text-xs text-muted">
                <p>{r.actor_email}</p>
                <p title={new Date(r.updated_at).toLocaleString()}>{timeAgo(r.updated_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {hasMore && (
        <button className="btn-ghost mt-4 w-full" onClick={() => setPage((p) => p + 1)}>
          Load older changes
        </button>
      )}
    </div>
  )
}
