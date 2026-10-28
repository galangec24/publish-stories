import { Headphones, LoaderCircle, Pause, Play, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { api } from '../lib/api'
import { canSpeak, speakingSeconds, speakWords, unlockSpeech, voicesReady } from '../lib/deviceVoice'
import { useToast } from './ui'

const SPEEDS = [1, 1.25, 1.5, 0.75]
const BLOCKS = 'p,h1,h2,h3,h4,li,blockquote,pre,figure'
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const highlights = () => typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function'

/**
 * The chapter's words on screen, in order, each as a Range (a word split across bold/italic
 * pieces is still one word). Text in different paragraphs never runs together.
 */
function screenWords(root) {
  const words = []
  let current = null
  let lastBlock = null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = node.parentElement?.closest(BLOCKS)
    if (block !== lastBlock) current = null
    lastBlock = block
    const text = node.data
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) {
        current = null
        continue
      }
      if (!current) {
        current = { range: document.createRange(), text: '' }
        current.range.setStart(node, i)
        words.push(current)
      }
      current.range.setEnd(node, i + 1)
      current.text += text[i]
    }
  }
  return words
}

/** Which on-screen word each spoken word is (skipping anything the two don't share, like list numbers). */
function matchWords(spoken, onScreen) {
  const map = new Array(spoken.length).fill(-1)
  let j = 0
  for (let i = 0; i < spoken.length && j < onScreen.length; i++) {
    const want = norm(spoken[i])
    let found = -1
    for (let k = j; k < Math.min(j + 8, onScreen.length); k++) {
      if (norm(onScreen[k].text) === want) {
        found = k
        break
      }
    }
    map[i] = found >= 0 ? found : j
    j = (found >= 0 ? found : j) + 1
  }
  return map
}

const FOLLOW_PAUSE_MS = 4000 // after the reader scrolls by hand, wait this long before following again

/**
 * Lights up one on-screen word and keeps it in view: in scroll mode the page scrolls so the word
 * sits about a third of the way down; in book mode (`book` is the BookReader control) the book
 * turns to the word's page.
 */
function useWordMark(follow, book) {
  const userScrolledAt = useRef(0)
  const view = useRef({ follow, book })
  view.current = { follow, book } // the reader can switch between book and scroll while listening
  useEffect(() => {
    const mark = () => (userScrolledAt.current = Date.now())
    window.addEventListener('wheel', mark, { passive: true })
    window.addEventListener('touchmove', mark, { passive: true })
    return () => {
      window.removeEventListener('wheel', mark)
      window.removeEventListener('touchmove', mark)
      if (highlights()) CSS.highlights.delete('narration')
    }
  }, [])
  return {
    show(word) {
      if (!word) return
      if (highlights()) CSS.highlights.set('narration', new Highlight(word.range))
      const { follow, book } = view.current
      if (book?.current) return book.current.showRange(word.range)
      if (follow && Date.now() - userScrolledAt.current > FOLLOW_PAUSE_MS) {
        const r = word.range.getBoundingClientRect()
        const h = window.innerHeight
        if (r.height && (r.top < h * 0.15 || r.bottom > h * 0.65)) {
          window.scrollBy({ top: r.top - h * 0.33, behavior: 'smooth' })
        }
      }
    },
    clear() {
      if (highlights()) CSS.highlights.delete('narration')
    },
  }
}

/**
 * "Listen": the chapter is read aloud word for word and each word lights up as it is read.
 * Free by default (the reader's own device voice); a chapter with an AI reading made in the
 * Studio uses that natural voice instead. In scroll mode the page follows along.
 */
export function NarrationPlayer({ slug, chapter, textRef, follow, book }) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [chapter?.id])

  if (!chapter?.content) return null
  const premium = Boolean(chapter.narrated)
  if (!premium && !canSpeak()) return null
  if (!open) {
    return (
      <button
        className="btn-ghost mb-4 !py-2"
        onClick={() => {
          if (!premium) unlockSpeech()
          setOpen(true)
        }}
      >
        <Headphones className="h-4 w-4 text-brand" /> Listen to this chapter
      </button>
    )
  }
  const props = { slug, chapter, textRef, follow, book, onClose: () => setOpen(false) }
  return premium ? <RecordedPlayer key={chapter.id} {...props} /> : <DevicePlayer key={chapter.id} {...props} />
}

/** Free: the device voice reads the words straight from the page. */
function DevicePlayer({ chapter, textRef, follow, book, onClose }) {
  const mark = useWordMark(follow, book)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [at, setAt] = useState(0)
  const words = useRef([])
  const stop = useRef(null)

  const play = async (from = at, rate = speed) => {
    if (!textRef.current) return
    words.current = screenWords(textRef.current)
    if (!words.current.length) return
    await voicesReady()
    stop.current?.()
    setPlaying(true)
    stop.current = speakWords(
      words.current.map((w) => w.text),
      {
        from: from >= words.current.length ? 0 : from,
        rate,
        onWord: (i) => {
          setAt(i)
          if (textRef.current && !textRef.current.contains(words.current[i]?.range.startContainer)) {
            words.current = screenWords(textRef.current)
          }
          mark.show(words.current[i])
        },
        onEnd: () => {
          setPlaying(false)
          setAt(0)
          mark.clear()
        },
      },
    )
  }
  const pause = () => {
    stop.current?.()
    setPlaying(false)
  }

  useEffect(() => {
    play(0)
    return () => stop.current?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const total = words.current.length || chapter.word_count || 1
  return (
    <Bar
      title={chapter.title}
      playing={playing}
      onToggle={() => {
        if (playing) return pause()
        unlockSpeech()
        play()
      }}
      progress={at / total}
      time={`${clock(speakingSeconds(at, speed))} / ${clock(speakingSeconds(total, speed))}`}
      hint="Your device voice"
      speed={speed}
      onSpeed={() => {
        const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
        setSpeed(next)
        if (playing) play(at, next)
      }}
      onClose={() => {
        pause()
        mark.clear()
        onClose()
      }}
    />
  )
}

/** The natural AI voice made in the Studio (ElevenLabs), with the time of every word. */
function RecordedPlayer({ slug, chapter, textRef, follow, book, onClose }) {
  const toast = useToast()
  const mark = useWordMark(follow, book)
  const audio = useRef(null)
  const [data, setData] = useState(null) // { segments, words, starts, total }
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [time, setTime] = useState(0)
  const seg = useRef(0)
  const match = useRef(null) // { onScreen, map } for the chapter as currently drawn
  const lastWord = useRef(-1)

  useEffect(() => {
    api
      .get(`stories/${slug}/chapters/${chapter.id}/narration/`)
      .then(({ segments }) => {
        const words = []
        const starts = []
        let offset = 0
        segments.forEach((s, si) => {
          starts.push(offset)
          s.words.forEach((w) => words.push({ si, text: w[0], start: w[1], end: w[2] }))
          offset += s.duration
        })
        setData({ segments, words, starts, total: offset })
        audio.current.src = segments[0].url
        return audio.current.play()
      })
      .catch((e) => {
        toast(e, 'error')
        onClose()
      })
    return () => audio.current?.pause()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Light up the word being read.
  useEffect(() => {
    if (!playing || !data) return
    let frame
    // Each piece's words are one run in data.words: [first, end).
    const first = data.segments.map((_, si) => data.words.findIndex((w) => w.si === si))
    const end = first.map((f, si) => (si + 1 < first.length ? first[si + 1] : data.words.length))
    const tick = () => {
      const si = seg.current
      const t = audio.current.currentTime
      setTime(data.starts[si] + t)
      let lo = first[si]
      let hi = end[si] - 1
      let found = -1
      while (lo >= 0 && lo <= hi) {
        const mid = (lo + hi) >> 1
        if (data.words[mid].start <= t) {
          found = mid
          lo = mid + 1
        } else hi = mid - 1
      }
      if (found >= 0 && found !== lastWord.current && textRef.current) {
        lastWord.current = found
        if (!match.current || !textRef.current.contains(match.current.onScreen[0]?.range.startContainer)) {
          const onScreen = screenWords(textRef.current)
          match.current = { onScreen, map: matchWords(data.words.map((w) => w.text), onScreen) }
        }
        mark.show(match.current.onScreen[match.current.map[found]])
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, data]) // eslint-disable-line react-hooks/exhaustive-deps

  function onEnded() {
    const next = seg.current + 1
    if (data && next < data.segments.length) {
      seg.current = next
      audio.current.src = data.segments[next].url
      audio.current.playbackRate = speed
      audio.current.play().catch(() => {})
    } else {
      setPlaying(false)
      mark.clear()
      lastWord.current = -1
      seg.current = 0
      if (data) audio.current.src = data.segments[0].url
      setTime(0)
    }
  }

  return (
    <>
      <audio ref={audio} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} />
      <Bar
        title={chapter.title}
        loading={!data}
        playing={playing}
        onToggle={() => (playing ? audio.current.pause() : audio.current.play())}
        progress={data?.total ? time / data.total : 0}
        time={`${clock(time)} / ${clock(data?.total || 0)}`}
        speed={speed}
        onSpeed={() => {
          const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
          setSpeed(next)
          audio.current.playbackRate = next
        }}
        onClose={() => {
          audio.current?.pause()
          mark.clear()
          onClose()
        }}
      />
    </>
  )
}

function Bar({ title, loading, playing, onToggle, progress, time, hint, speed, onSpeed, onClose }) {
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2 pr-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <button
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-lg"
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        disabled={loading}
      >
        {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title || 'This chapter'}</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {time}
          {hint && ` · ${hint}`}
        </p>
      </div>
      <button className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:text-ink" onClick={onSpeed} title="Reading speed">
        {speed}×
      </button>
      <button className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" onClick={onClose} aria-label="Stop listening">
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}
