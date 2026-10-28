import { BookOpen, Captions, Clapperboard, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Spinner } from '../components/ui'
import { VoiceReel } from '../components/VoiceReel'
import { DEFAULT_ABOUT } from '../lib/aboutDefaults'
import { api } from '../lib/api'
import { unlockSpeech } from '../lib/deviceVoice'
import { plainText } from '../lib/delta'
import { useAsync, useCachedAsync } from '../lib/useAsync'

/** Reels: one short reel per chapter, swiped through one at a time. */
export function Reels() {
  const [params] = useSearchParams()
  const story = params.get('story')
  const reels = useAsync(() => api.get('reels/', story ? { story } : undefined), [story])
  const about = useCachedAsync('cache:about', () => api.get('about/'), [], DEFAULT_ABOUT)
  const author = { ...DEFAULT_ABOUT, ...about.data }
  const [muted, setMuted] = useState(true) // browsers only start silently; one tap turns sound on for every reel
  const [captions, setCaptions] = useState(false)

  const setSound = (on) => {
    if (on) unlockSpeech() // inside the tap, so iPhones allow the voice
    setMuted(!on)
  }

  if (reels.loading && !reels.data) return <Spinner className="min-h-[60vh] items-center" />
  const list = reels.data || []

  return (
    <div className="-mx-4">
      {story && list[0] && (
        <p className="flex items-center justify-between gap-2 px-4 pt-3 text-sm">
          <span className="truncate text-muted">
            Reels from <b className="text-ink">{list[0].story.title}</b>
          </span>
          <Link to="/reels" className="shrink-0 font-semibold text-brand">All reels</Link>
        </p>
      )}
      {!list.length ? (
        <div className="grid min-h-[60vh] place-items-center px-6 text-center">
          <div>
            <Clapperboard className="mx-auto h-10 w-10 text-muted" />
            <p className="mt-3 font-display text-2xl">No reels yet</p>
            <p className="mt-1 text-muted">Short reels introducing each chapter will appear here.</p>
            <Link to="/" className="btn-primary mt-5">Browse stories</Link>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100dvh-4rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {list.map((reel) => (
            <Reel key={reel.id} reel={reel} author={author} muted={muted} onSound={setSound} captions={captions} onCaptions={setCaptions} />
          ))}
        </div>
      )}
    </div>
  )
}

// Story details per slug, fetched once: the same paywalled data the reader gets, so a reel only
// reads a whole chapter the viewer may open.
const stories = new Map()
function chapterText(slug, chapterId) {
  if (!stories.has(slug)) stories.set(slug, api.get(`stories/${slug}/`).catch((e) => (stories.delete(slug), Promise.reject(e))))
  return stories.get(slug).then((story) => {
    const chapter = story.chapters.find((c) => c.id === chapterId)
    return chapter?.content ? plainText(chapter.content) : null
  })
}

function Reel({ reel, author, muted, onSound, captions, onCaptions }) {
  const box = useRef(null)
  const [active, setActive] = useState(false)

  // Plays while it fills most of the screen; stops when swiped away.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.65 })
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [])

  const { story, chapter } = reel
  const voice = reel.kind === 'voice'
  return (
    <section ref={box} className="flex h-full snap-start snap-always items-center justify-center px-2 py-3">
      <div className="relative aspect-[9/16] h-full max-w-full overflow-hidden rounded-3xl bg-black shadow-2xl shadow-black/50">
        {voice ? (
          <VoiceReel
            script={reel.script}
            color={story.color}
            author={author}
            title={story.title}
            chapterLabel={`Chapter ${chapter.number}`}
            loadChapter={() => chapterText(story.slug, chapter.id)}
            active={active}
            muted={muted}
          />
        ) : (
          <VideoReel reel={reel} active={active} muted={muted} />
        )}

        {/* side buttons */}
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <button
            onClick={() => onSound(muted)}
            className="grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur"
            aria-label={muted ? 'Turn sound on' : 'Mute'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          {!voice && (
            <button
              onClick={() => onCaptions(!captions)}
              className={`grid h-10 w-10 place-items-center rounded-full backdrop-blur ${captions ? 'bg-white text-black' : 'bg-black/45 text-white'}`}
              aria-label="Show what is said"
            >
              <Captions className="h-5 w-5" />
            </button>
          )}
        </div>
        {muted && (
          <button
            onClick={() => onSound(true)}
            className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
          >
            Tap for sound
          </button>
        )}

        {/* story + chapter */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-4 pt-16 text-white">
          {!voice && captions && reel.script && (
            <p className="pointer-events-auto mb-3 max-h-40 overflow-y-auto rounded-xl bg-black/50 p-3 text-sm leading-relaxed">{reel.script}</p>
          )}
          <Link to={`/stories/${story.slug}`} className="pointer-events-auto font-display text-xl leading-tight drop-shadow hover:underline">
            {story.title}
          </Link>
          <p className="mt-0.5 text-sm text-white/80">
            Chapter {chapter.number}
            {chapter.title ? ` · ${chapter.title}` : ''}
            {story.author_name ? ` · ${story.author_name}` : ''}
          </p>
          <div className="pointer-events-auto mt-3 flex items-center gap-2">
            <Link to={`/stories/${story.slug}?chapter=${chapter.id}`} className="btn-primary !py-2 text-sm">
              <BookOpen className="h-4 w-4" /> Read chapter {chapter.number}
            </Link>
            {story.free && <span className="rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold">Free to read</span>}
          </div>
        </div>
      </div>
    </section>
  )
}

/** A presenter video (made with HeyGen in the Studio). */
function VideoReel({ reel, active, muted }) {
  const video = useRef(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const v = video.current
    if (active) {
      v.play().catch(() => setPaused(true))
      setPaused(false)
    } else {
      v.pause()
      v.currentTime = 0
    }
  }, [active])

  const togglePlay = () => {
    const v = video.current
    if (v.paused) {
      v.play().catch(() => {})
      setPaused(false)
    } else {
      v.pause()
      setPaused(true)
    }
  }

  return (
    <>
      <video
        ref={video}
        src={reel.video_url}
        poster={reel.thumbnail_url || undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onClick={togglePlay}
        className="h-full w-full object-cover"
      />
      {paused && (
        <button onClick={togglePlay} className="absolute inset-0 grid place-items-center bg-black/20" aria-label="Play">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/50 text-white backdrop-blur">
            <Play className="h-7 w-7 fill-white" />
          </span>
        </button>
      )}
    </>
  )
}
