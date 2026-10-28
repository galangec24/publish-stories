import { Headphones, LoaderCircle, Pause, Play, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { api } from '../lib/api'
import { useToast } from './ui'

const SPEEDS = [1, 1.25, 1.5, 0.75]
const BLOCKS = 'p,h1,h2,h3,h4,li,blockquote,pre,figure'
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

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

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * "Listen": the AI voice reads the open chapter word for word and each word lights up as it
 * is read. In scroll mode the page follows along (until the reader scrolls themselves).
 */
export function NarrationPlayer({ slug, chapter, textRef, follow }) {
  const toast = useToast()
  const audio = useRef(null)
  const [data, setData] = useState(null) // { segments, words, starts, total }
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [time, setTime] = useState(0)
  const seg = useRef(0)
  const match = useRef(null) // { onScreen, map } for the chapter as currently drawn
  const lastWord = useRef(-1)
  const userScrolledAt = useRef(0)

  const highlights = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function'

  const clearMark = () => {
    if (highlights) CSS.highlights.delete('narration')
    lastWord.current = -1
  }

  // A different chapter: stop and forget the old reading.
  useEffect(() => {
    audio.current?.pause()
    setOpen(false)
    setPlaying(false)
    setData(null)
    setTime(0)
    seg.current = 0
    match.current = null
    clearMark()
  }, [chapter?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearMark(), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reading by hand pauses the follow-along for a few seconds.
  useEffect(() => {
    if (!open) return
    const mark = () => (userScrolledAt.current = Date.now())
    window.addEventListener('wheel', mark, { passive: true })
    window.addEventListener('touchmove', mark, { passive: true })
    return () => {
      window.removeEventListener('wheel', mark)
      window.removeEventListener('touchmove', mark)
    }
  }, [open])

  async function start() {
    setOpen(true)
    if (data) return audio.current.play()
    setLoading(true)
    try {
      const { segments } = await api.get(`stories/${slug}/chapters/${chapter.id}/narration/`)
      const words = []
      const starts = []
      let offset = 0
      segments.forEach((s, si) => {
        starts.push(offset)
        s.words.forEach((w) => words.push({ si, text: w[0], start: w[1], end: w[2] }))
        offset += s.duration
      })
      setData({ segments, words, starts, total: offset })
      seg.current = 0
      audio.current.src = segments[0].url
      audio.current.playbackRate = speed
      await audio.current.play()
    } catch (e) {
      toast(e, 'error')
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  function stop() {
    audio.current?.pause()
    setOpen(false)
    clearMark()
  }

  function toggleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (audio.current) audio.current.playbackRate = next
  }

  // Light up the word being read (and keep it in view).
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
      // the last word of this piece that has started
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
        const word = match.current.onScreen[match.current.map[found]]
        if (word && highlights) CSS.highlights.set('narration', new Highlight(word.range))
        if (word && follow && Date.now() - userScrolledAt.current > 5000) {
          const r = word.range.getBoundingClientRect()
          if (r.height && (r.top < 90 || r.bottom > window.innerHeight - 140)) {
            window.scrollBy({ top: r.top - window.innerHeight * 0.35, behavior: 'smooth' })
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, data, follow]) // eslint-disable-line react-hooks/exhaustive-deps

  function onEnded() {
    const next = seg.current + 1
    if (data && next < data.segments.length) {
      seg.current = next
      audio.current.src = data.segments[next].url
      audio.current.playbackRate = speed
      audio.current.play().catch(() => {})
    } else {
      setPlaying(false)
      clearMark()
      seg.current = 0
      if (data) audio.current.src = data.segments[0].url
      setTime(0)
    }
  }

  if (!chapter?.narrated || !chapter.content) return null

  return (
    <>
      <audio ref={audio} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} />
      {!open ? (
        <button className="btn-ghost mb-4 !py-2" onClick={start}>
          <Headphones className="h-4 w-4 text-brand" /> Listen to this chapter
        </button>
      ) : (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2 pr-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <button
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-lg"
            onClick={() => (playing ? audio.current.pause() : audio.current.play())}
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={loading}
          >
            {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{chapter.title || 'This chapter'}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${data?.total ? (time / data.total) * 100 : 0}%` }} />
            </div>
            <p className="mt-0.5 text-[11px] text-muted">
              {clock(time)} / {clock(data?.total || 0)}
              {!follow && ' · Scroll mode follows along'}
            </p>
          </div>
          <button className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:text-ink" onClick={toggleSpeed} title="Reading speed">
            {speed}×
          </button>
          <button className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" onClick={stop} aria-label="Stop listening">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  )
}
