import { BookOpen, ChevronLeft, ChevronRight, Eye, Lock, QrCode, ScrollText, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { BookReader } from '../components/BookReader'
import { ProtectedContent } from '../components/ProtectedContent'
import { GenreTags, Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { DeltaView } from '../lib/delta'
import { formatCount, READING_MODES, useReadingMode } from '../lib/readingMode'
import { useAsync } from '../lib/useAsync'

export function StoryPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const story = useAsync(() => api.get(`stories/${slug}/`), [slug, user?.id])
  const [mode, setMode] = useReadingMode()
  const [index, setIndex] = useState(0)
  const [fromEnd, setFromEnd] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [counts, setCounts] = useState(null)
  const poll = useRef()
  const top = useRef()

  useEffect(() => () => clearInterval(poll.current), [])

  // Count this visit (once per reader per day, server-side) and show live totals.
  useEffect(() => {
    api.post(`stories/${slug}/view/`).then(setCounts).catch(() => {})
  }, [slug])

  // Back from PayMongo: ?payment=success. Re-fetch; the webhook may already be in.
  useEffect(() => {
    if (params.get('payment') === 'success') {
      toast('Payment received. Unlocking your story…')
      story.reload()
      setParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (story.loading && !story.data) return <Spinner />
  if (story.error) return <p className="py-16 text-center text-muted">{story.error.message}</p>
  const s = story.data
  const chapter = s.chapters[Math.min(index, s.chapters.length - 1)]
  const showPaywall = chapter && (chapter.locked || chapter.content === null)
  const views = counts?.view_count ?? s.view_count
  const readers = counts?.reader_count ?? s.reader_count

  const go = (i, { atEnd = false } = {}) => {
    setIndex(i)
    setFromEnd(atEnd)
    setTocOpen(false)
    if (mode === 'scroll') top.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function unlock() {
    if (!user) {
      navigate('/login', { state: { from: `/stories/${slug}` } })
      return
    }
    setPaying(true)
    try {
      const { checkout_url, subscription } = await api.post(`subscribe/${s.id}/`)
      window.open(checkout_url, '_blank', 'noopener')
      let ticks = 0
      clearInterval(poll.current)
      poll.current = setInterval(async () => {
        if (++ticks > 150) {
          clearInterval(poll.current)
          setPaying(false)
          return
        }
        try {
          const sub = await api.get(`subscriptions/${subscription.id}/`)
          if (sub.status === 'paid') {
            clearInterval(poll.current)
            await story.reload()
            setPaying(false)
            toast('Unlocked! Enjoy the full story.')
          } else if (sub.status === 'failed') {
            clearInterval(poll.current)
            setPaying(false)
          }
        } catch {
          /* keep polling */
        }
      }, 4000)
    } catch (e) {
      setPaying(false)
      toast(e, 'error')
    }
  }

  const chapterBody = (
    <>
      <p className="text-xs tracking-[0.25em] text-muted uppercase">
        Chapter {index + 1} of {s.chapters.length}
      </p>
      <h2 className="mt-2 mb-8 font-display text-3xl text-page-ink">{chapter?.title}</h2>
      {chapter?.content && <DeltaView ops={chapter.content} />}
      {showPaywall && (
        <Paywall story={s} paying={paying} onUnlock={unlock} onRefresh={story.reload} signedIn={!!user} />
      )}
    </>
  )

  return (
    <div ref={top} className="grid gap-8 pt-8 lg:grid-cols-[280px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <p className="text-xs tracking-widest text-muted uppercase">{s.column?.title || 'Story'}</p>
          <h1 className="mt-1 font-display text-2xl leading-tight">{s.title}</h1>
          {s.author_name && <p className="mt-1 text-sm text-muted">by {s.author_name}</p>}
          <div className="mt-3">
            <GenreTags genres={s.genres} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <Stat value={formatCount(views)} label={views === 1 ? 'view' : 'views'} icon={Eye} />
            <Stat value={formatCount(readers)} label={readers === 1 ? 'reader' : 'readers'} icon={UsersRound} />
          </div>
          {s.synopsis && <p className="mt-4 text-sm text-muted">{s.synopsis}</p>}
          <p className="mt-3 text-xs text-muted">
            {s.word_count.toLocaleString()} words · {s.chapters.length} chapters ·{' '}
            {s.is_free ? 'Free' : s.has_access ? 'Unlocked' : `₱${Number(s.price).toFixed(2)}`}
          </p>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-muted">Page style</p>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-line p-1">
              {READING_MODES.map((m) => (
                <button
                  key={m.id}
                  title={m.hint}
                  onClick={() => setMode(m.id).catch((e) => toast(e, 'error'))}
                  className={`rounded-lg px-2 py-1.5 text-sm transition ${
                    mode === m.id ? 'bg-brand text-white shadow' : 'text-muted hover:text-ink'
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    {m.id === 'book' ? <BookOpen className="h-4 w-4" /> : <ScrollText className="h-4 w-4" />}
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button className="btn-ghost mt-4 w-full lg:hidden" onClick={() => setTocOpen((o) => !o)}>
            {tocOpen ? 'Hide chapters' : 'Chapters'}
          </button>
          <nav className={`mt-4 space-y-1 ${tocOpen ? '' : 'hidden lg:block'}`}>
            {s.chapters.map((c, i) => (
              <button
                key={c.id}
                onClick={() => go(i)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  i === index ? 'bg-brand/15 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <span className="truncate">{c.title}</span>
                {c.content === null && <Lock className="h-3.5 w-3.5 shrink-0" aria-label="locked" />}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <article className="min-w-0">
        <ProtectedContent watermark={user?.email}>
          {mode === 'book' ? (
            <div className="rounded-3xl border border-line bg-page px-6 py-8 shadow-2xl shadow-black/20 sm:px-12 sm:py-10">
              <BookReader
                contentKey={`${chapter?.id}-${s.has_access}`}
                startAtEnd={fromEnd}
                hasPrev={index > 0}
                hasNext={index < s.chapters.length - 1}
                onPrevChapter={() => go(index - 1, { atEnd: true })}
                onNextChapter={() => go(index + 1)}
              >
                <div className="book-flow">{chapterBody}</div>
              </BookReader>
            </div>
          ) : (
            <div className="rounded-3xl border border-line bg-page px-6 py-10 shadow-2xl shadow-black/20 sm:px-14 sm:py-14">
              {chapterBody}
            </div>
          )}
        </ProtectedContent>
        {mode === 'scroll' && (
          <div className="mt-6 flex items-center justify-between">
            <button className="btn-ghost" disabled={index === 0} onClick={() => go(index - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <Link to="/" className="text-sm text-muted hover:text-ink">
              All stories
            </Link>
            <button className="btn-ghost" disabled={index >= s.chapters.length - 1} onClick={() => go(index + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </article>
    </div>
  )
}

function Stat({ value, label, icon: Icon }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-2 py-2">
      <p className="flex items-center justify-center gap-1.5 font-display text-xl leading-none">
        <Icon className="h-4 w-4 text-brand" aria-hidden />
        {value}
      </p>
      <p className="mt-1 text-[11px] tracking-wide text-muted uppercase">{label}</p>
    </div>
  )
}

function Paywall({ story, paying, onUnlock, onRefresh, signedIn }) {
  return (
    <div className="relative mt-6 break-inside-avoid">
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Lock className="h-6 w-6" /></div>
        <h3 className="font-display text-xl">Keep reading for ₱{Number(story.price).toFixed(2)}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          One-time unlock. Pay with GCash, Maya or your bank app by scanning a QR Ph code.
        </p>
        {paying ? (
          <div className="mt-5 space-y-3">
            <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
            <p className="text-sm text-muted">Waiting for payment confirmation…</p>
            <button className="text-sm text-brand underline" onClick={onRefresh}>
              I already paid, refresh
            </button>
          </div>
        ) : (
          <button className="btn-primary mt-5" onClick={onUnlock}>
            {signedIn ? 'Unlock with QR Ph' : 'Sign in to unlock'}
          </button>
        )}
      </div>
    </div>
  )
}
