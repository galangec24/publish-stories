import { Headphones, LoaderCircle, Pause, Play, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { api } from '../lib/api'
import { canSpeak, englishVoices, pageLanguage, speakingSeconds, speakWords, unlockSpeech, voicesFor, voicesReady } from '../lib/deviceVoice'
import { SeekBar } from './SeekBar'
import { useToast } from './ui'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const BLOCKS = 'p,h1,h2,h3,h4,li,blockquote,pre,figure'
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
/** Index of the last word of piece `si` that starts by `t` seconds (-1 if none). */
function lastWordBefore(words, si, t) {
  let found = -1
  words.forEach((w, k) => {
    if (w.si === si && w.start <= t) found = k
  })
  return found
}

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
        const below = 160 // the header and the pinned player above the text
        if (r.height && (r.top < Math.max(h * 0.15, below) || r.bottom > h * 0.7)) {
          window.scrollBy({ top: r.top - Math.max(h * 0.33, below + 40), behavior: 'smooth' })
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

const SETTINGS_KEY = 'listen-settings'

/** Speed, volume and voice, remembered on this device. */
function useListenSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      return { speed: 1, volume: 1, voiceURI: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
    } catch {
      return { speed: 1, volume: 1, voiceURI: '' }
    }
  })
  const update = (patch) =>
    setSettings((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {
        /* not remembered */
      }
      return next
    })
  return [settings, update]
}

/** Free: the device voice reads the words straight from the page. */
function DevicePlayer({ chapter, textRef, follow, book, onClose }) {
  const mark = useWordMark(follow, book)
  const [settings, setSettings] = useListenSettings()
  const [voices, setVoices] = useState([])
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const words = useRef([])
  const stop = useRef(null)

  const play = async (from = at, options = settings) => {
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
        rate: options.speed,
        volume: options.volume,
        voiceURI: options.voiceURI,
        onWord: (i) => {
          setAt(i)
          const word = words.current[i]
          if (textRef.current && (!textRef.current.contains(word?.range.startContainer) || word.range.toString() !== word.text)) {
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

  const language = pageLanguage()
  useEffect(() => {
    voicesReady().then(() => setVoices(voicesFor(language).length ? voicesFor(language) : englishVoices()))
    play(0)
    return () => stop.current?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const total = words.current.length || chapter.word_count || 1
  const indexAt = (fraction) => {
    let i = Math.min(total - 1, Math.max(0, Math.floor(fraction * total)))
    // start at the beginning of that sentence, so the reading makes sense
    for (let k = 0; k < 40 && i > 0 && !/[.!?…]["'”’)]*$/.test(words.current[i - 1]?.text || ''); k++) i--
    return i
  }
  const seek = (fraction) => {
    if (!words.current.length && textRef.current) words.current = screenWords(textRef.current)
    const i = indexAt(fraction)
    setAt(i)
    mark.show(words.current[i])
    if (playing) play(i)
  }
  const describe = (fraction) => {
    const i = Math.min(total - 1, Math.max(0, Math.floor(fraction * total)))
    return {
      time: clock(speakingSeconds(i, settings.speed)),
      text: words.current.slice(i, i + 6).map((w) => w.text).join(' '),
    }
  }

  // A new speed, volume or voice applies from the current word (once the slider settles).
  const restart = useRef(null)
  const change = (patch) => {
    setSettings(patch)
    if (!playing) return
    clearTimeout(restart.current)
    restart.current = setTimeout(() => play(at, { ...settings, ...patch }), 300)
  }

  const noVoice = language !== 'en' && voices.length > 0 && !voicesFor(language).length
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
      onSeek={seek}
      describe={describe}
      note={noVoice ? 'This device has no voice for this language, so an English voice reads it.' : ''}
      time={`${clock(speakingSeconds(at, settings.speed))} / ${clock(speakingSeconds(total, settings.speed))}`}
      settings={settings}
      onChange={change}
      voices={voices}
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
  const [settings, setSettings] = useListenSettings()
  const audio = useRef(null)
  const [data, setData] = useState(null) // { segments, words, starts, total }
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const seg = useRef(0)
  const match = useRef(null) // { onScreen, map } for the chapter as currently drawn
  const lastWord = useRef(-1)

  const apply = (a, s) => {
    a.playbackRate = s.speed
    a.volume = s.volume
  }

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
        apply(audio.current, settings)
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

  const seekTime = (t) => {
    if (!data) return
    let si = 0
    while (si + 1 < data.starts.length && data.starts[si + 1] <= t) si++
    const offset = t - data.starts[si]
    const a = audio.current
    const resume = !a.paused
    lastWord.current = -1
    if (si !== seg.current) {
      seg.current = si
      a.src = data.segments[si].url
      apply(a, settings)
      a.addEventListener('loadedmetadata', () => (a.currentTime = offset), { once: true })
    } else a.currentTime = offset
    setTime(t)
    // show where it lands even while paused
    const k = lastWordBefore(data.words, si, offset)
    if (k >= 0 && textRef.current) {
      const onScreen = screenWords(textRef.current)
      mark.show(onScreen[matchWords(data.words.map((w) => w.text), onScreen)[k]])
    }
    if (resume) a.play().catch(() => {})
  }
  const wordAtTime = (t) => {
    let si = 0
    while (data && si + 1 < data.starts.length && data.starts[si + 1] <= t) si++
    const k = data ? lastWordBefore(data.words, si, t - data.starts[si]) : -1
    return data && k >= 0 ? data.words.slice(k, k + 6).map((w) => w.text).join(' ') : ''
  }

  function onEnded() {
    const next = seg.current + 1
    if (data && next < data.segments.length) {
      seg.current = next
      audio.current.src = data.segments[next].url
      apply(audio.current, settings)
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
        onSeek={(fraction) => seekTime(fraction * (data?.total || 0))}
        describe={(fraction) => ({ time: clock(fraction * (data?.total || 0)), text: wordAtTime(fraction * (data?.total || 0)) })}
        time={`${clock(time)} / ${clock(data?.total || 0)}`}
        settings={settings}
        onChange={(patch) => {
          setSettings(patch)
          apply(audio.current, { ...settings, ...patch })
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

/**
 * The player, inside the page above the chapter (pinned under the header while scrolling), so it
 * never covers the text or the page controls. Settings: speed, volume and, for the device voice,
 * which voice reads.
 */
function Bar({ title, loading, playing, onToggle, progress, onSeek, describe, note, time, settings, onChange, voices, onClose }) {
  const [open, setOpen] = useState(false)
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !panel.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const muted = settings.volume === 0
  return (
    <div ref={panel} className="sticky top-[4.5rem] z-30 mb-4">
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2 pr-2.5 shadow-xl shadow-black/15 backdrop-blur-xl">
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
          <SeekBar progress={progress} onSeek={onSeek} describe={describe} />
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {time} · {settings.speed}× · {muted ? 'muted' : `volume ${Math.round(settings.volume * 100)}%`}
          </p>
          {note && <p className="truncate text-[11px] text-amber-500">{note}</p>}
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-xl border border-line px-2.5 py-2 text-sm font-medium text-muted hover:text-ink"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <SlidersHorizontal className="h-4 w-4" /> <span className="hidden sm:inline">Settings</span>
        </button>
        <button className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" onClick={onClose} aria-label="Stop listening">
          <X className="h-5 w-5" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-2 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-2xl shadow-black/25">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Speed</p>
          <div className="grid grid-cols-4 gap-1.5">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                onClick={() => onChange({ speed })}
                className={`rounded-lg px-2 py-1.5 text-sm font-medium ${settings.speed === speed ? 'bg-brand text-white' : 'bg-surface-2 hover:bg-line'}`}
              >
                {speed}×
              </button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Volume</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChange({ volume: muted ? 1 : 0 })}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(settings.volume * 100)}
              onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
              className="flex-1 accent-[var(--brand)]"
              aria-label="Volume"
            />
            <span className="w-10 text-right text-xs text-muted tabular-nums">{Math.round(settings.volume * 100)}%</span>
          </div>

          {voices?.length > 1 && (
            <>
              <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Voice</p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {voices.map((v, i) => {
                  const chosen = settings.voiceURI ? settings.voiceURI === v.voiceURI : i === 0
                  return (
                    <button
                      key={v.voiceURI}
                      onClick={() => onChange({ voiceURI: v.voiceURI })}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${chosen ? 'bg-brand/15 font-semibold text-brand' : 'hover:bg-surface-2'}`}
                    >
                      <span className="truncate">{v.name.replace(/^Microsoft |^Google /, '').replace(/ Online \(Natural\).*$/, ' (Natural)')}</span>
                      <span className="shrink-0 text-[10px] text-muted">{v.lang}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
