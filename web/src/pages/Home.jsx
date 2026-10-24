import { ArrowUpRight, BookOpen, Newspaper } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { AboutMe } from '../components/AboutMe'
import { AuthorBlog } from '../components/AuthorBlog'
import { Book3D, Shelf } from '../components/Book3D'
import { Spinner } from '../components/ui'
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
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(t)
  }, [query])

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
          <input
            className="input md:max-w-xs"
            placeholder="Search titles, authors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {(data?.genres || []).map((g) => {
              const on = genreFilter.has(g.slug)
              return (
                <button
                  key={g.id}
                  onClick={() => toggle(g.slug)}
                  className="chip shrink-0"
                  style={{
                    borderColor: `color-mix(in srgb, ${g.color} 55%, transparent)`,
                    background: on ? `color-mix(in srgb, ${g.color} 30%, transparent)` : 'transparent',
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                  {g.name}
                </button>
              )
            })}
          </div>
        </div>
      </section>

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
