import { BookOpen, BookPlus, ExternalLink, Eye, FileUp, FolderPlus, Library, Newspaper, Pencil, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Spinner, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { formatCount } from '../../lib/readingMode'
import { useAsync } from '../../lib/useAsync'
import { ColumnModal, NewStoryModal } from './CreateModals'

export function StoryList() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'columns' ? 'columns' : 'stories'
  const [status, setStatus] = useState('')
  const [genre, setGenre] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [ordering, setOrdering] = useState('')
  const stats = useAsync(() => api.get('stats/'), [])
  const genres = useAsync(() => api.get('admin/genres/'), [])
  const stories = useAsync(
    () => api.get('admin/stories/', { status, genre, q: search, ordering, column: tab === 'columns' ? 'any' : 'none' }),
    [status, genre, search, ordering, tab],
  )
  const columns = useAsync(() => (tab === 'columns' ? api.get('admin/columns/') : Promise.resolve(null)), [tab])

  const [storyModal, setStoryModal] = useState(false)
  const [columnModal, setColumnModal] = useState(false)
  const [editColumn, setEditColumn] = useState(null)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-display text-3xl">Stories</h1>
        <Link to="/admin/import" className="btn-ghost">
          <FileUp className="h-4 w-4" /> Bulk import
        </Link>
        <button className="btn-ghost" onClick={() => setColumnModal(true)}>
          <FolderPlus className="h-4 w-4" /> New column
        </button>
        <button className="btn-primary" onClick={() => setStoryModal(true)}>
          <BookPlus className="h-4 w-4" /> New story
        </button>
      </div>
      <NewStoryModal open={storyModal} onClose={() => setStoryModal(false)} />
      <ColumnModal
        open={columnModal}
        onClose={() => setColumnModal(false)}
        onSaved={() => {
          toast('You can now pick this column when creating a story.')
          columns.reload()
        }}
      />
      <ColumnModal
        open={!!editColumn}
        initial={editColumn}
        onClose={() => setEditColumn(null)}
        onSaved={() => {
          toast('Column saved.')
          columns.reload()
        }}
      />

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

      <div className="mt-6 flex gap-1 border-b border-line" role="tablist">
        {[
          ['stories', 'Stories', BookOpen],
          ['columns', 'Columns', Newspaper],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setParams(id === 'stories' ? {} : { tab: id }, { replace: true })}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
      ) : tab === 'columns' ? (
        <ColumnGroups columns={columns.data} stories={stories.data?.results || []} onEdit={setEditColumn} onNew={() => setColumnModal(true)} />
      ) : !stories.data?.results.length ? (
        <p className="py-16 text-center text-muted">No stories yet. Create one or bulk-import manuscripts.</p>
      ) : (
        <StoryRows stories={stories.data.results} />
      )}
    </div>
  )
}

/** Columns tab: each column with its pieces (drafts included). */
function ColumnGroups({ columns, stories, onEdit, onNew }) {
  if (!columns) return <Spinner />
  if (!columns.length) {
    return (
      <div className="py-16 text-center text-muted">
        <p>No columns yet.</p>
        <button className="btn-ghost mt-3" onClick={onNew}><FolderPlus className="h-4 w-4" /> New column</button>
      </div>
    )
  }
  return (
    <div className="mt-5 space-y-5">
      {columns.map((c) => {
        const pieces = stories.filter((s) => s.column?.id === c.id)
        return (
          <section key={c.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
              <Newspaper className="h-4 w-4 text-brand" />
              <h2 className="font-display text-xl">{c.title}</h2>
              <span className="text-xs text-muted">
                {c.story_count} piece{c.story_count === 1 ? '' : 's'}{c.is_public ? ' · public, free' : ''}
              </span>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer noopener" className="text-muted hover:text-brand" title={c.url}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => onEdit(c)} title="Edit column">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            {pieces.length ? (
              <StoryRows stories={pieces} />
            ) : (
              <p className="card p-4 text-sm text-muted">No pieces match. Create a story and pick this column.</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

function StoryRows({ stories }) {
  return (
    <div className="card mt-5 divide-y divide-line overflow-hidden">
      {stories.map((s) => (
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
  )
}
