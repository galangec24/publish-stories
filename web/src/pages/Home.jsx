import { ArrowUpRight, BookOpen, Coffee, HeartHandshake, MessagesSquare, Newspaper, Sparkles, Tags, X } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { AboutMe } from '../components/AboutMe'
import { AuthorBlog } from '../components/AuthorBlog'
import { Book3D, Shelf } from '../components/Book3D'
import { SearchBox } from '../components/SearchBox'
import { Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatCount } from '../lib/readingMode'
import { DEFAULT_ABOUT } from '../lib/aboutDefaults'
import { useAsync, useCachedAsync } from '../lib/useAsync'

const Hero3D = lazy(() => import('../components/Hero3D'))

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function Home() {
  const { user } = useAuth()
  const home = useCachedAsync(`cache:home:${user?.id || 'guest'}`, () => api.get('home/'), [user?.preferred_genres?.length])
  const about = useCachedAsync('cache:about', () => api.get('about/'), [], DEFAULT_ABOUT)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'columns' ? 'columns' : 'stories'
  const columns = useCachedAsync('cache:columns', () => (tab === 'columns' ? api.get('columns/') : Promise.resolve(undefined)), [tab])
  const [genreFilter, setGenreFilter] = useState(new Set())
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('') // the search shown as a full results grid

  const filtering = genreFilter.size > 0 || debounced !== ''
  const filtered = useAsync(
    () =>
      filtering
        ? api.get('stories/', { genre: [...genreFilter].join(','), q: debounced }).then((d) => d.results)
        : Promise.resolve(null),
    [filtering, debounced, [...genreFilter].join(',')],
  )

  const toggle = (slug) =>
    setGenreFilter((s) => {
      const next = new Set(s)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })

  const data = home.data
  const featured = useMemo(() => data?.latest?.slice(0, 3) || [], [data])

  return (
    <>
      <section className="relative grid items-center gap-6 pt-8 md:grid-cols-[1.05fr_1fr] md:pt-14">
        <div className="animate-float-up">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs tracking-wide text-muted uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Kwento ng Pilipino
          </p>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
            Stories that turn <span className="bg-gradient-to-r from-accent to-brand bg-clip-text text-transparent">the page</span> for you.
          </h1>
          <p className="mt-4 max-w-lg text-lg text-muted">
            Free columns every day. Previews of novels and short stories. Unlock the full story in seconds with GCash, Maya or your bank via QR Ph.
          </p>
          <ul className="mt-5 grid max-w-lg gap-3 text-sm sm:grid-cols-3">
            {[
              [Coffee, 'Ten minutes, a new world', 'Short chapters for the jeepney ride, the coffee break or right before sleep.'],
              [HeartHandshake, 'Stories close to home', 'Davao, family, faith and the teachers who shaped us, told by a journalist who lived them.'],
              [MessagesSquare, 'Read, then talk', 'Rate, like and comment. The author reads every one.'],
            ].map(([Icon, title, text]) => (
              <li key={title} className="rounded-2xl border border-line bg-surface/60 p-3">
                <Icon className="h-5 w-5 text-accent" />
                <p className="mt-1.5 font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-muted">{text}</p>
              </li>
            ))}
          </ul>
          {data?.stats && (
            <dl className="mt-6 flex flex-wrap gap-6">
              {[
                [data.stats.total_readers, 'readers'],
                [data.stats.total_views, 'story views'],
                [data.stats.published_stories, 'stories'],
              ].map(([n, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd className="font-display text-3xl">{formatCount(n)}</dd>
                  <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#browse" className="btn-primary">
              Start reading
            </a>
            {!user && (
              <Link to="/register" className="btn-ghost">
                Create free account
              </Link>
            )}
            <a href="#about" className="btn-ghost">
              Meet the author
            </a>
          </div>
        </div>
        <div className="relative h-[340px] sm:h-[420px]">
          {prefersReducedMotion() ? (
            <div className="flex h-full items-center justify-center gap-4">
              {featured.map((s) => (
                <Book3D key={s.id} story={s} />
              ))}
            </div>
          ) : (
            <Suspense fallback={null}>
              <Hero3D />
            </Suspense>
          )}
        </div>
      </section>

      <section id="browse" className="sticky top-16 z-30 -mx-4 mt-6 border-y border-line/60 bg-bg/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex shrink-0 gap-1 rounded-xl border border-line bg-surface/70 p-1" role="tablist">
            {[
              ['stories', 'Stories', BookOpen],
              ['columns', 'Columns', Newspaper],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setParams(id === 'stories' ? {} : { tab: id }, { replace: true })}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  tab === id ? 'bg-brand text-white shadow' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <SearchBox
            className="md:max-w-2xl md:flex-1"
            value={query}
            onChange={(text) => {
              setQuery(text)
              if (!text.trim()) setDebounced('')
            }}
            onSearch={(text) => setDebounced(text.trim())}
          />
        </div>
      </section>

      {tab === 'stories' && data?.genres?.length > 0 && (
        <GenrePicker genres={data.genres} selected={genreFilter} onToggle={toggle} onClear={() => setGenreFilter(new Set())} />
      )}

      {!data && home.loading ? (
        <div className="py-10 text-center text-sm text-muted">
          <Spinner className="!pb-4" />
          <p>Opening the library… the first visit after a quiet spell can take up to a minute.</p>
        </div>
      ) : !data ? (
        <p className="py-16 text-center text-muted">Couldn&apos;t reach the server. {home.error?.message}</p>
      ) : filtering ? (
        <Results stories={filtered.data} loading={filtered.loading} />
      ) : tab === 'columns' ? (
        <ColumnsTab columns={columns.data} loading={columns.loading} />
      ) : (
        <>
          {user && (
            <Shelf
              title="For you"
              subtitle={user.preferred_genres?.map((g) => g.name).join(' · ') || undefined}
              stories={data.for_you}
            />
          )}
          <Shelf title="Most read" subtitle="By views" stories={data.popular} />
          <Shelf title="New & updated" stories={data.latest} />
          <Shelf title="Free reads" stories={data.free} />
          {data.by_genre.map((row) => (
            <Shelf key={row.genre.id} title={row.genre.name} stories={row.stories} />
          ))}
          {!data.latest.length && (
            <p className="py-16 text-center text-muted">
              {data.has_columns ? 'Read her latest pieces in the Columns tab.' : 'No stories published yet. Check back soon.'}
            </p>
          )}
        </>
      )}

      <AuthorBlog stats={data?.stats} about={about.data} />
      <AboutMe about={about.data} />
    </>
  )
}

function Results({ stories, loading }) {
  if (loading || !stories) return <Spinner />
  if (!stories.length) return <p className="py-16 text-center text-muted">No stories match these filters yet.</p>
  return (
    <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {stories.map((s) => (
        <Book3D key={s.id} story={s} />
      ))}
    </div>
  )
}

function ColumnsTab({ columns, loading }) {
  if (!columns) return loading ? <Spinner /> : null
  if (!columns.length) return <p className="py-16 text-center text-muted">No columns published yet.</p>
  return (
    <div className="mt-6 space-y-6">
      {columns.map((c) => (
        <section key={c.id} className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <span className="tile-3d grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
              <Newspaper className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl leading-tight">{c.title}</h2>
              <p className="text-xs tracking-wide text-muted uppercase">
                {c.story_count} piece{c.story_count === 1 ? '' : 's'}
                {c.is_public && <span className="ml-2 text-emerald-400">Free to read</span>}
              </p>
              {c.description && <p className="mt-2 max-w-2xl text-sm text-muted">{c.description}</p>}
            </div>
            {c.url && (
              <a href={c.url} target="_blank" rel="noreferrer noopener" className="btn-ghost !py-1.5 text-sm">
                Visit column <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
          </div>
          {c.stories.length ? (
            <div className="-mx-2 mt-4 flex gap-6 overflow-x-auto px-4 pt-4 pb-6 [scrollbar-width:thin]">
              {c.stories.map((s) => (
                <Book3D key={s.id} story={s} />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              No pieces published here yet.{c.url ? ' Read the column on its site in the meantime.' : ' Check back soon.'}
            </p>
          )}
        </section>
      ))}
    </div>
  )
}

/** Browse by genre; signed-in readers can keep their picks as favorites for "Recommended" stories. */
function GenrePicker({ genres, selected, onToggle, onClear }) {
  const { user, refreshMe } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const favorites = new Set((user?.preferred_genres || []).map((g) => g.slug))
  const picked = genres.filter((g) => selected.has(g.slug))
  const sameAsFavorites = picked.length === favorites.size && picked.every((g) => favorites.has(g.slug))

  async function saveFavorites() {
    setSaving(true)
    try {
      await api.put('user/genres/', { genre_ids: picked.map((g) => g.id) })
      await refreshMe()
      toast('Saved. Stories in these genres now show a Recommended tag for you.')
    } catch (e) {
      toast(e, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card mt-6 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="tile-3d grid h-10 w-10 shrink-0 place-items-center rounded-xl">
          <Tags className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl">Find your genre</h2>
          <p className="text-sm text-muted">
            Tap the genres you love to see only those stories.{' '}
            {user ? (
              <>Save them as your favorites and we&apos;ll mark matching stories <span className="font-semibold text-brand">Recommended</span>.</>
            ) : (
              <>
                <Link to="/login" className="text-brand hover:underline">Sign in</Link> to save your favorites and get{' '}
                <span className="font-semibold text-brand">Recommended</span> picks.
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {genres.map((g) => {
          const on = selected.has(g.slug)
          return (
            <button
              key={g.id}
              onClick={() => onToggle(g.slug)}
              aria-pressed={on}
              className="chip"
              style={{
                borderColor: `color-mix(in srgb, ${g.color} 55%, transparent)`,
                background: on ? `color-mix(in srgb, ${g.color} 30%, transparent)` : 'transparent',
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
              {g.name}
              {favorites.has(g.slug) && <Sparkles className="h-3 w-3 text-brand" aria-label="favorite" />}
            </button>
          )
        })}
      </div>
      {(picked.length > 0 || (user && favorites.size > 0)) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {picked.length > 0 && (
            <button type="button" className="btn-ghost !py-1.5 text-sm" onClick={onClear}>
              <X className="h-4 w-4" /> Clear ({picked.length})
            </button>
          )}
          {user && picked.length > 0 && !sameAsFavorites && (
            <button type="button" className="btn-primary !py-1.5 text-sm" onClick={saveFavorites} disabled={saving}>
              <Sparkles className="h-4 w-4" /> {saving ? 'Saving…' : 'Save as my favorite genres'}
            </button>
          )}
          {user && favorites.size > 0 && picked.length === 0 && (
            <button
              type="button"
              className="btn-ghost !py-1.5 text-sm"
              onClick={() => genres.filter((g) => favorites.has(g.slug)).forEach((g) => onToggle(g.slug))}
            >
              <Sparkles className="h-4 w-4" /> Show my favorites
            </button>
          )}
        </div>
      )}
    </section>
  )
}
