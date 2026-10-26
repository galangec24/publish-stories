import { BookOpen, Check, ChevronLeft, ChevronRight, ExternalLink, Eye, History, Lock, MessageCircle, ScrollText, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { BookReader } from '../components/BookReader'
import { ProtectedContent } from '../components/ProtectedContent'
import { QrPaywall } from '../components/QrPaywall'
import { StoryRating } from '../components/StoryRating'
import { ThemePicker } from '../components/ThemePicker'
import { LikeButton, StoryComments } from '../components/StoryCommunity'
import { GenreTags, Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { chapterHeadings, DeltaView } from '../lib/delta'
import { fontStack, titleStack } from '../lib/fonts'
import { formatCount, READING_MODES, useReadingMode } from '../lib/readingMode'
import { useCachedAsync } from '../lib/useAsync'

export function StoryPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const toast = useToast()
  const story = useCachedAsync(`cache:story:${slug}:${user?.id || 'guest'}`, () => api.get(`stories/${slug}/`), [])
  const [mode, setMode] = useReadingMode()
  const [index, setIndex] = useState(0)
  const [fromEnd, setFromEnd] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [counts, setCounts] = useState(null)
  const [social, setSocial] = useState({ liked: false }) // likes + comments, kept fresh by StoryComments
  const [rating, setRating] = useState(null)
  const updateSocial = (patch) => setSocial((x) => ({ ...x, ...patch }))
  const top = useRef()

  // Count this visit (once per reader per day, server-side) and show live totals.
  useEffect(() => {
    api.post(`stories/${slug}/view/`).then(setCounts).catch(() => {})
  }, [slug])

  useEffect(() => {
    setRating(null)
    api.get(`stories/${slug}/rating/`).then(setRating).catch(() => {})
  }, [slug, user?.id])

  // Note each chapter the reader opens (only readable ones count); finishing them all lets guests rate.
  const openChapterId = story.data?.chapters[Math.min(index, story.data.chapters.length - 1)]?.id
  const openChapterReadable = Boolean(story.data?.chapters.find((c) => c.id === openChapterId)?.content)
  useEffect(() => {
    if (!openChapterId || !openChapterReadable) return
    api
      .post(`stories/${slug}/progress/`, { chapter: openChapterId })
      .then(() => api.get(`stories/${slug}/rating/`))
      .then(setRating)
      .catch(() => {})
  }, [slug, openChapterId, openChapterReadable])

  // --- Reading progress: ✓ on chapters already read, and "continue where you left off". ---
  const posKey = `reading-pos:${slug}`
  const [readIds, setReadIds] = useState(() => new Set())
  const [resumed, setResumed] = useState(false)
  const [jump, setJump] = useState(null) // section to show in book mode
  const pendingSection = useRef(null) // section in another chapter, shown once that chapter is open
  const resumeAt = useRef(null) // { chapterId, page, scroll } waiting to be applied
  const resumedFor = useRef(null)

  useEffect(() => {
    setReadIds(new Set())
    setResumed(false)
  }, [slug])
  useEffect(() => {
    if (story.data?.read_chapters) setReadIds((ids) => new Set([...ids, ...story.data.read_chapters]))
  }, [story.data?.read_chapters])
  useEffect(() => {
    if (openChapterId && openChapterReadable) setReadIds((ids) => (ids.has(openChapterId) ? ids : new Set([...ids, openChapterId])))
  }, [openChapterId, openChapterReadable])

  // On opening a story, jump to the chapter (and page or spot) the reader left off at.
  useEffect(() => {
    const data = story.data
    if (!data || resumedFor.current === slug) return
    resumedFor.current = slug
    let saved = null
    try {
      saved = JSON.parse(localStorage.getItem(posKey) || 'null')
    } catch {
      /* no saved spot */
    }
    const target = data.last_chapter ?? saved?.chapterId
    const at = data.chapters.findIndex((c) => c.id === target)
    if (at < 0) return
    const sameChapter = saved?.chapterId === target
    const page = sameChapter ? saved.page || 0 : 0
    const scroll = sameChapter ? saved.scroll || 0 : 0
    if (at === 0 && !page && !scroll) return
    resumeAt.current = { chapterId: target, page, scroll }
    setIndex(at)
    setResumed(true)
    toast(`Continuing where you left off: ${data.chapters[at].title}`)
  }, [story.data, slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll mode: go back to the saved spot once the chapter is on screen.
  useEffect(() => {
    const spot = resumeAt.current
    if (mode !== 'scroll' || !spot?.scroll || spot.chapterId !== openChapterId) return
    const t = setTimeout(() => window.scrollTo({ top: spot.scroll, behavior: 'smooth' }), 400)
    resumeAt.current = null
    return () => clearTimeout(t)
  }, [mode, openChapterId])

  // Remember the spot as the reader goes (scroll mode).
  useEffect(() => {
    if (mode !== 'scroll' || !openChapterId) return
    let timer
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(posKey, JSON.stringify({ chapterId: openChapterId, scroll: Math.round(window.scrollY) }))
        } catch {
          /* storage full: just don't remember */
        }
      }, 400)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [mode, openChapterId, posKey])

  useEffect(() => {
    const id = pendingSection.current
    if (!id) return
    pendingSection.current = null
    const t = setTimeout(() => {
      if (mode === 'book') setJump({ id, at: Date.now() })
      else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 250)
    return () => clearTimeout(t)
  }, [openChapterId]) // eslint-disable-line react-hooks/exhaustive-deps

  function rememberPage(page) {
    if (!openChapterId) return
    try {
      localStorage.setItem(posKey, JSON.stringify({ chapterId: openChapterId, page }))
    } catch {
      /* storage full: just don't remember */
    }
  }

  // Back from PayMongo: ?payment=success. The webhook may land a few seconds later, so check a few times.
  useEffect(() => {
    if (params.get('payment') === 'success') {
      setParams({}, { replace: true })
      toast('Payment received. Unlocking your story…')
      let tries = 0
      const check = async () => {
        const data = await story.reload()
        if (data?.has_access) {
          let code = null
          try {
            code = localStorage.getItem(`access-code:${slug}`)
          } catch {
            /* ignore */
          }
          toast(code ? `Unlocked! Your access code for other devices: ${code}` : 'Unlocked! Enjoy the full story.')
        } else if (++tries < 8) {
          setTimeout(check, 4000)
        } else {
          toast('Still waiting for the payment to confirm. This page will unlock when you reload in a minute.')
        }
      }
      check()
    } else if (params.get('payment') === 'cancelled') {
      setParams({}, { replace: true })
    }
    // From the "Unlocked" email: ?code=ABCD-EFGH opens the story on this device.
    const code = params.get('code')
    if (code) {
      setParams({}, { replace: true })
      api
        .post('access/claim/', { code })
        .then(() => {
          toast('Unlocked on this device!')
          story.reload()
        })
        .catch((e) => toast(e, 'error'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (story.loading && !story.data) return <Spinner />
  if (story.error && !story.data) return <p className="py-16 text-center text-muted">{story.error.message}</p>
  const s = story.data
  const chapter = s.chapters[Math.min(index, s.chapters.length - 1)]
  const showPaywall = chapter && (chapter.locked || chapter.content === null)
  const views = counts?.view_count ?? s.view_count
  const readers = counts?.reader_count ?? s.reader_count

  const sections = chapter?.content ? chapterHeadings(chapter.content) : []
  const sectionsOf = (c) => (c.content ? chapterHeadings(c.content) : [])

  // A section heading inside the current chapter: scroll to it, or turn to its page in book mode.
  const showSection = (id) => {
    setTocOpen(false)
    if (mode === 'book') setJump({ id, at: Date.now() })
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openSection = (i, id) => {
    if (i === index) return showSection(id)
    pendingSection.current = id
    go(i)
  }

  const go = (i, { atEnd = false } = {}) => {
    resumeAt.current = null
    setResumed(false)
    setIndex(i)
    setFromEnd(atEnd)
    setTocOpen(false)
    if (mode === 'scroll') top.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const chapterBody = (
    <>
      <p className="text-xs tracking-[0.25em] text-muted uppercase">
        Chapter {index + 1} of {s.chapters.length}
      </p>
      <h2 className="mt-2 mb-8 text-3xl text-page-ink" style={{ fontFamily: titleStack(s.title_font) }}>{chapter?.title}</h2>
      {chapter?.content && <DeltaView ops={chapter.content} fontFamily={fontStack(s.font_family)} fontSize={s.font_size} />}
      {showPaywall && (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Lock className="h-4 w-4" /> This chapter is locked. Scan the QR below the page to keep reading.
        </p>
      )}
    </>
  )

  return (
    <div ref={top} className="grid gap-8 pt-8 lg:grid-cols-[280px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <p className="flex items-center gap-1.5 text-xs tracking-widest text-muted uppercase">
            {s.column?.title || 'Story'}
            {s.column?.url && (
              <a href={s.column.url} target="_blank" rel="noreferrer noopener" className="text-brand hover:text-accent" title="Visit this column">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </p>
          <h1 className="mt-1 text-2xl leading-tight" style={{ fontFamily: titleStack(s.title_font) }}>{s.title}</h1>
          {s.author_name && <p className="mt-1 text-sm text-muted">by {s.author_name}</p>}
          <div className="mt-3">
            <GenreTags genres={s.genres} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <Stat value={formatCount(views)} label={views === 1 ? 'view' : 'views'} icon={Eye} />
            <Stat value={formatCount(readers)} label={readers === 1 ? 'reader' : 'readers'} icon={UsersRound} />
          </div>
          <div className="mt-3 flex gap-2">
            <LikeButton
              slug={s.slug}
              liked={social.liked}
              count={social.like_count ?? s.like_count}
              onChange={updateSocial}
              className="flex-1 !px-2 !py-2"
            />
            <a href="#comments" className="btn-ghost !px-3 !py-2" title="Comments">
              <MessageCircle className="h-4 w-4" /> {formatCount(social.comment_count ?? s.comment_count)}
            </a>
          </div>
          <StoryRating slug={s.slug} state={rating} onChange={setRating} />
          {s.synopsis && <p className="mt-4 text-sm text-muted">{s.synopsis}</p>}
          <p className="mt-3 text-xs text-muted">
            {s.word_count.toLocaleString()} words · {s.chapters.length} chapters ·{' '}
            {s.is_free ? 'Free' : s.has_access ? 'Unlocked' : `₱${Number(s.price).toFixed(2)}`}
          </p>
          {!s.has_access && s.free_chapters > 0 && (
            <p className="mt-1 text-xs text-emerald-400">
              {s.free_chapters >= s.chapters.length ? 'All chapters free' : `First ${s.free_chapters === 1 ? 'chapter' : `${s.free_chapters} chapters`} free`}
            </p>
          )}

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

          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-muted">Theme</p>
            <ThemePicker />
          </div>

          <button className="btn-ghost mt-4 w-full lg:hidden" onClick={() => setTocOpen((o) => !o)}>
            {tocOpen ? 'Hide chapters' : 'Chapters'}
          </button>
          {resumed && index > 0 && (
            <button type="button" className="mt-4 flex w-full items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-2 text-left text-xs text-brand hover:bg-brand/15" onClick={() => go(0)}>
              <History className="h-3.5 w-3.5" /> Picked up where you left off. Start from Chapter 1
            </button>
          )}
          <nav className={`mt-4 space-y-1 ${tocOpen ? '' : 'hidden lg:block'}`}>
            {readIds.size > 0 && (
              <p className="px-3 pb-1 text-[11px] text-muted">
                {s.chapters.filter((c) => readIds.has(c.id)).length} of {s.chapters.length} chapters read
              </p>
            )}
            {s.chapters.map((c, i) => (
              <div key={c.id}>
              <button
                onClick={() => go(i)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  i === index ? 'bg-brand/15 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <span className="truncate">{c.title}</span>
                {c.content === null ? (
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-label="locked" />
                ) : readIds.has(c.id) ? (
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-400" title="Read">
                    <Check className="h-3 w-3" aria-label="read" />
                  </span>
                ) : null}
              </button>
              {(i === index ? sections : sectionsOf(c)).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => openSection(i, h.id)}
                    className="block w-full truncate py-1 pr-2 text-left text-xs text-muted hover:text-ink"
                    style={{ paddingLeft: 20 + (h.level - 1) * 12 }}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <article className="min-w-0">
        <label className="mb-3 flex items-center gap-2 text-sm">
          <span className="shrink-0 text-muted">Jump to</span>
          <select
            className="input !py-2"
            value={`c:${index}`}
            onChange={(e) => {
              const [kind, at, id] = e.target.value.split(':')
              if (kind === 'c') go(Number(at))
              else openSection(Number(at), id)
            }}
          >
            {s.chapters.map((c, i) => [
              <option key={c.id} value={`c:${i}`}>
                {c.content === null ? '🔒 ' : readIds.has(c.id) ? '✓ ' : ''}
                {c.title}
              </option>,
              ...sectionsOf(c).map((h) => (
                <option key={`${c.id}-${h.id}`} value={`s:${i}:${h.id}`}>
                  {'\u00a0\u00a0\u00a0'.repeat(h.level)}
                  {h.text}
                </option>
              )),
            ])}
          </select>
        </label>
        <ProtectedContent>
          {mode === 'book' ? (
            <div className="rounded-3xl border border-line bg-page px-6 py-8 shadow-2xl shadow-black/20 sm:px-12 sm:py-10">
              <BookReader
                contentKey={`${chapter?.id}-${s.has_access}`}
                startAtEnd={fromEnd}
                initialPage={resumeAt.current?.chapterId === chapter?.id ? resumeAt.current.page : null}
                onPageChange={rememberPage}
                jumpTo={jump}
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
        {/* Outside the book pages and the screenshot cover, so the QR is never split across pages or hidden. */}
        {showPaywall && <QrPaywall story={s} signedIn={!!user} onUnlocked={story.reload} />}
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
        <StoryComments slug={s.slug} onCounts={updateSocial} />
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
