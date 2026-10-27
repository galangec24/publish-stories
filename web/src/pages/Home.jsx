import { ArrowUpRight, BookOpen, Coffee, HeartHandshake, MessagesSquare, Newspaper, Sparkles, Tags, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import { AboutMe } from '../components/AboutMe'
import { AuthorBlog } from '../components/AuthorBlog'
import { AuthorPortrait } from '../components/AuthorPortrait'
import { Book3D, Shelf } from '../components/Book3D'
import { SearchBox } from '../components/SearchBox'
import { Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatCount } from '../lib/readingMode'
import { DEFAULT_ABOUT } from '../lib/aboutDefaults'
import { useAsync, useCachedAsync } from '../lib/useAsync'

const Hero3D = lazy(() => import('../components/Hero3D'))
const IDLE_MS = 5 * 60 * 1000 // after this long with no activity, the home page returns to "Most read"

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function Home() {
  const { user } = useAuth()
  const home = useCachedAsync(`cache:home:${user?.id || 'guest'}`, () => api.get('home/'), [user?.preferred_genres?.length])
  const aboutRaw = useCachedAsync('cache:about', () => api.get('about/'), [], DEFAULT_ABOUT)
  const about = { ...aboutRaw, data: { ...DEFAULT_ABOUT, ...aboutRaw.data } }
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const openAtMostRead = !location.hash && !params.get('tab')
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
  const meetAuthor = <AuthorPortrait about={about.data} /> // ends every shelf, introducing the author

  // Every time the home page opens (first visit or from another page) it shows "Most read",
  // placed before the page is drawn; it stays there while pictures above it load, until the
  // reader scrolls or taps.
  const hasPopular = Boolean(data?.popular?.length)
  useLayoutEffect(() => {
    if (!openAtMostRead || !hasPopular) return
    const shelf = document.getElementById('most-read')
    if (!shelf) return
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const place = () => {
      const offset = parseFloat(getComputedStyle(shelf).scrollMarginTop) || 0
      window.scrollTo(0, shelf.getBoundingClientRect().top + window.scrollY - offset)
    }
    place()
    const settle = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
    settle?.observe(document.body)
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown']
    const stop = () => {
      settle?.disconnect()
      events.forEach((e) => window.removeEventListener(e, stop))
    }
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }))
    const done = setTimeout(stop, 3000)
    return () => {
      clearTimeout(done)
      stop()
    }
  }, [openAtMostRead, hasPopular, location.key])

  // Left alone for a while (no scroll, tap, mouse or key), or back to the tab after a while
  // away: return to "Most read".
  useEffect(() => {
    if (!hasPopular || tab !== 'stories') return
    let last = Date.now()
    let timer
    const goToMostRead = () => {
      const shelf = document.getElementById('most-read')
      const typing = document.activeElement?.matches?.('input, textarea, [contenteditable="true"]')
      if (!shelf || typing) return
      const offset = parseFloat(getComputedStyle(shelf).scrollMarginTop) || 0
      window.scrollTo({ top: shelf.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' })
    }
    const restart = () => {
      last = Date.now()
      clearTimeout(timer)
      timer = setTimeout(goToMostRead, IDLE_MS)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last >= IDLE_MS) goToMostRead()
      restart()
    }
    const events = ['scroll', 'wheel', 'touchstart', 'mousemove', 'mousedown', 'keydown']
    events.forEach((e) => window.addEventListener(e, restart, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    restart()
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, restart))
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [hasPopular, tab])
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
            <a href="#most-read" className="btn-primary">
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
        <ColumnsTab columns={columns.data} loading={columns.loading} author={about.data} />
      ) : (
        <>
          <Shelf id="most-read" title="Most read" subtitle="By views" stories={data.popular} trailing={meetAuthor} />
          {user && (
            <Shelf
              title="For you"
              subtitle={user.preferred_genres?.map((g) => g.name).join(' · ') || undefined}
              stories={data.for_you}
              trailing={meetAuthor}
            />
          )}
          <Shelf title="New & updated" stories={data.latest} trailing={meetAuthor} />
          <Shelf title="Free reads" stories={data.free} trailing={meetAuthor} />
          {(data.by_genre || []).map((row) => (
            <Shelf key={row.genre.id} title={row.genre.name} stories={row.stories} trailing={meetAuthor} />
          ))}
          {!data.latest?.length && (
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

/** "SunStar" for sunstar.com.ph, otherwise the site's name. */
function siteName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('sunstar')) return 'SunStar'
    return host
  } catch {
    return 'the site'
  }
}

/** A newspaper column: an article-style card that opens the column on its site (SunStar). */
function ColumnCard({ column, author }) {
  if (!column.url) return null
  return (
    <a
      href={column.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group card flex min-w-0 flex-col gap-3 p-5 transition hover:-translate-y-1 hover:border-brand/50 hover:shadow-2xl"
    >
      <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-accent uppercase">
        <Newspaper className="h-4 w-4" /> Column · {siteName(column.url)}
      </span>
      <h3 className="font-display text-xl leading-snug group-hover:text-brand">{column.title}</h3>
      {column.description && <p className="line-clamp-3 text-sm text-muted">{column.description}</p>}
      {author?.name && (
        <span className="flex items-center gap-2.5">
          {author.photo_url ? (
            <img src={author.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover object-top ring-2 ring-line" loading="lazy" />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{author.name}</span>
            <span className="block text-[11px] text-muted">Columnist</span>
          </span>
        </span>
      )}
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand">
        Read on {siteName(column.url)} <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </a>
  )
}

function ColumnsTab({ columns, loading, author }) {
  if (!columns) return loading ? <Spinner /> : null
  const linked = columns.filter((c) => c.url)
  const withPieces = columns.filter((c) => c.stories?.length)
  if (!linked.length && !withPieces.length) return <p className="py-16 text-center text-muted">No columns yet.</p>
  return (
    <div className="mt-6 space-y-8">
      {linked.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {linked.map((c) => (
            <ColumnCard key={c.id} column={c} author={author} />
          ))}
        </div>
      )}
      {withPieces.map((c) => (
        <Shelf key={c.id} title={c.title} subtitle="Stories in this column" stories={c.stories} trailing={<AuthorPortrait about={author} />} />
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
