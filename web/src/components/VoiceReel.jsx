import { Lock, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { photoSources } from '../lib/aboutIcons'
import { canSpeak, speakingSeconds, speakWords } from '../lib/deviceVoice'
import { translateTexts } from '../i18n/liveTranslator'
import { SeekBar } from './SeekBar'

const LINE_WORDS = 4
const SILENT_PACE_MS = 60000 / 165 // captions move at speaking pace while the sound is off
const split = (text) => text.trim().split(/\s+/).filter(Boolean)
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const SENTENCE_END = /[.!?…]["'”’)]*$/

/** The text in the page's language (the translator's choice), paragraph by paragraph. */
async function inPageLanguage(text) {
  const paragraphs = text.split('\n')
  const translated = await translateTexts(paragraphs).catch(() => paragraphs)
  return translated.join('\n')
}

/**
 * The free reel: the author's photo over the story's colours, with big captions that light up
 * word by word. With sound on, the viewer's device voice reads it. After the short intro it keeps
 * going and reads the whole chapter (`loadChapter` resolves to its text, or null when the viewer
 * can't open that chapter yet). Everything is sized from the frame, so it looks the same in the
 * small Studio preview and full screen. `active` is true while the reel fills the screen.
 */
export function VoiceReel({ script, color, author, title, chapterLabel, loadChapter, active, muted }) {
  const [intro, setIntro] = useState(() => split(script))
  const [chapterWords, setChapterWords] = useState(null)
  const from = useRef(0) // where the next reading starts (a seek)

  // Read in the page's language: the script is translated when the page is.
  useEffect(() => {
    let current = true
    setIntro(split(script))
    inPageLanguage(script).then((text) => current && setIntro(split(text)))
    return () => {
      current = false
    }
  }, [script])
  const [phase, setPhase] = useState('intro') // intro → chapter → done | locked
  const [at, setAt] = useState(0)
  const [paused, setPaused] = useState(false)
  const [run, setRun] = useState(0) // bumps to play the intro again (looping preview)
  const runs = useRef(0)

  const words = phase === 'chapter' ? chapterWords || [] : intro

  // Swiped away: start over next time.
  useEffect(() => {
    if (active) return
    setPhase('intro')
    from.current = 0
    setAt(0)
    setPaused(false)
  }, [active])

  useEffect(() => {
    if (!active || paused || !words.length || phase === 'done' || phase === 'locked') return
    let stop
    let timer
    let cancelled = false
    const finished = async () => {
      if (cancelled) return
      if (phase === 'chapter') return setPhase('done')
      if (!loadChapter) {
        timer = setTimeout(() => setRun(++runs.current), 1800) // no chapter to continue with: loop the intro
        return
      }
      let text = chapterWords ? chapterWords.join(' ') : await loadChapter().catch(() => null)
      if (text?.trim() && !chapterWords) text = await inPageLanguage(text)
      if (cancelled) return
      if (!text?.trim()) return setPhase('locked')
      setChapterWords(split(text))
      from.current = 0
      setAt(0)
      setPhase('chapter')
    }
    const start = Math.min(from.current, words.length - 1)
    from.current = 0
    if (!muted && canSpeak()) {
      stop = speakWords(words, { from: start, onWord: setAt, onEnd: finished })
    } else {
      let i = start
      setAt(start)
      timer = setInterval(() => {
        if (++i >= words.length) {
          clearInterval(timer)
          finished()
        } else setAt(i)
      }, SILENT_PACE_MS)
    }
    return () => {
      cancelled = true
      stop?.()
      clearInterval(timer)
      clearTimeout(timer)
    }
  }, [active, paused, muted, phase, words, run]) // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to a spot (start of that sentence) and read on from there.
  const indexAt = (fraction) => Math.min(words.length - 1, Math.max(0, Math.floor(fraction * words.length)))
  const seek = (fraction) => {
    let i = indexAt(fraction)
    for (let k = 0; k < 40 && i > 0 && !SENTENCE_END.test(words[i - 1]); k++) i--
    from.current = i
    setAt(i)
    setPaused(false)
    setRun(++runs.current)
  }
  const describe = (fraction) => {
    const i = indexAt(fraction)
    return { time: clock(speakingSeconds(i)), text: words.slice(i, i + 6).join(' ') }
  }

  const photo = photoSources(author?.photo_url)
  const line = Math.floor(at / LINE_WORDS) * LINE_WORDS
  const cq = (n) => `${n}cqw` // font sizes follow the frame's width

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none [container-type:size]"
      style={{ background: `radial-gradient(120% 80% at 50% 22%, color-mix(in srgb, ${color} 80%, #fff 8%), color-mix(in srgb, ${color} 30%, #0b0716) 72%)` }}
      onClick={() => setPaused((p) => !p)}
    >
      <div className="pointer-events-none absolute -top-[10%] -left-[15%] h-[35%] w-[70%] rounded-full bg-white/15 blur-3xl" />

      <p
        className="absolute inset-x-[7%] top-[8%] line-clamp-2 text-center font-display leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        style={{ fontSize: cq(7.5) }}
      >
        {title}
      </p>

      {photo.fallback && (
        <div className="absolute top-[21%] left-1/2 h-[32%] -translate-x-1/2">
          <div className="h-full rounded-[12cqw] bg-white p-[1.2cqw] shadow-2xl shadow-black/50 ring-[1.5cqw] ring-white/20">
            <div className="h-full overflow-hidden rounded-[10.5cqw] bg-white">
              <picture>
                {photo.webp && <source srcSet={photo.webp} type="image/webp" />}
                <img
                  src={photo.fallback}
                  alt={author?.name || ''}
                  className={`block aspect-[798/1024] h-full object-contain ${active && !paused ? 'animate-[reel-drift_14s_ease-in-out_infinite_alternate]' : ''}`}
                />
              </picture>
            </div>
          </div>
          {author?.name && (
            <span
              className="absolute -bottom-[1.2em] left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-[0.9em] py-[0.3em] whitespace-nowrap text-white backdrop-blur"
              style={{ fontSize: cq(3.6) }}
            >
              {author.name}
            </span>
          )}
        </div>
      )}

      {/* what is being read */}
      <div className="absolute inset-x-[5%] top-[57%] text-center">
        <p className="mb-[1.5cqw] font-semibold tracking-wider text-white/70 uppercase" style={{ fontSize: cq(3.2) }}>
          {phase === 'chapter' ? `${chapterLabel} · reading` : phase === 'intro' ? 'Intro' : chapterLabel}
        </p>
        {(phase === 'intro' || phase === 'chapter') && words.length > 0 && (
          <SeekBar dark className="mx-auto mb-[1cqw] w-[78%]" progress={at / Math.max(1, words.length)} onSeek={seek} describe={describe} />
        )}
        {(phase === 'intro' || phase === 'chapter') &&
          [line, line + LINE_WORDS]
            .filter((start) => start < words.length)
            .map((start) => (
              <p key={start} translate="no" className="notranslate leading-snug font-semibold text-white/55 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" style={{ fontSize: cq(5.6) }}>
                {words.slice(start, start + LINE_WORDS).map((w, k) => {
                  const i = start + k
                  return (
                    <span key={i} className={i === at ? 'rounded bg-accent px-[0.15em] text-accent-ink' : i < at ? 'text-white' : ''}>
                      {w}{' '}
                    </span>
                  )
                })}
              </p>
            ))}
        {phase === 'locked' && (
          <p className="flex items-center justify-center gap-[0.4em] font-semibold text-white" style={{ fontSize: cq(5) }}>
            <Lock style={{ width: '1em', height: '1em' }} /> Unlock {chapterLabel} to keep listening
          </p>
        )}
        {phase === 'done' && (
          <p className="font-semibold text-white" style={{ fontSize: cq(5) }}>
            End of {chapterLabel}. Swipe up for the next one.
          </p>
        )}
      </div>

      {paused && (
        <span className="absolute inset-0 grid place-items-center bg-black/20">
          <span className="grid h-[18cqw] w-[18cqw] place-items-center rounded-full bg-black/50 text-white backdrop-blur">
            <Play className="h-1/2 w-1/2 fill-white" />
          </span>
        </span>
      )}
    </div>
  )
}
