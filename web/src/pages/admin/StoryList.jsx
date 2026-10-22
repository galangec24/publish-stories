import { Eye, Library, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Spinner, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { formatCount } from '../../lib/readingMode'
import { useAsync } from '../../lib/useAsync'

export function StoryList() {
  const toast = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [genre, setGenre] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [ordering, setOrdering] = useState('')
  const stats = useAsync(() => api.get('stats/'), [])
  const genres = useAsync(() => api.get('admin/genres/'), [])
  const stories = useAsync(
    () => api.get('admin/stories/', { status, genre, q: search, ordering }),
    [status, genre, search, ordering],
  )

  async function create() {
    const title = window.prompt('Title of the new story')
    if (!title?.trim()) return
    try {
      const story = await api.post('admin/stories/', { title: title.trim() })
      navigate(`/admin/stories/${story.id}`)
    } catch (e) {
      toast(e, 'error')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-display text-3xl">Stories</h1>
        <Link to="/admin/import" className="btn-ghost">
          Bulk import
        </Link>
        <button className="btn-primary" onClick={create}>
          + New story
        </button>
      </div>

      {stats.data && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            [UsersRound, stats.data.total_readers, 'Total readers'],
            [Eye, stats.data.total_views, 'Total views'],
            [Library, stats.data.published_stories, 'Published'],
          ].map(([Icon, n, label]) => (
            <div key={label} className="card p-4">
              <p className="flex items-center gap-2 font-display text-3xl">
                <Icon className="h-6 w-6 text-brand" />
                {formatCount(n)}
              </p>
              <p className="mt-1 text-xs tracking-wide text-muted uppercase">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(q.trim())
          }}
        >
          <input className="input !w-56 !py-2" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        {[
          ['', 'All'],
          ['draft', 'Drafts'],
          ['published', 'Published'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={`chip ${status === value ? 'border-brand bg-brand/15' : 'border-line'}`}
          >
            {label}
          </button>
        ))}
        <select className="input !w-auto !py-2" value={ordering} onChange={(e) => setOrdering(e.target.value)}>
          <option value="">Recently edited</option>
          <option value="popular">Most views</option>
          <option value="readers">Most readers</option>
        </select>
        <select className="input !w-auto !py-2" value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">Any genre</option>
          {(genres.data || []).map((g) => (
            <option key={g.id} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {stories.loading ? (
        <Spinner />
      ) : !stories.data?.results.length ? (
        <p className="py-16 text-center text-muted">No stories yet. Create one or bulk-import manuscripts.</p>
      ) : (
        <div className="card mt-5 divide-y divide-line overflow-hidden">
          {stories.data.results.map((s) => (
            <Link key={s.id} to={`/admin/stories/${s.id}`} className="flex items-center gap-4 p-4 hover:bg-surface-2">
              <div
                className="h-14 w-10 shrink-0 rounded-sm shadow-md"
                style={{ background: s.genres[0]?.color || 'var(--brand)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.title}</p>
                <p className="truncate text-sm text-muted">
                  {s.chapter_count} chapters · {s.word_count.toLocaleString()} words ·{' '}
                  {s.is_free ? 'Free' : `₱${Number(s.price).toFixed(2)}`}
                  {s.genres.length ? ` · ${s.genres.map((g) => g.name).join(', ')}` : ''}
                </p>
              </div>
              <div className="hidden text-right text-xs text-muted sm:block">
                <p>
                  <span className="font-semibold text-ink">{formatCount(s.view_count)}</span> views
                </p>
                <p>
                  <span className="font-semibold text-ink">{formatCount(s.reader_count)}</span> readers
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  s.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-2 text-muted'
                }`}
              >
                {s.status === 'published' ? 'Published' : 'Draft'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
