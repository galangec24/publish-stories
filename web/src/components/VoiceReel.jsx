import { Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { photoSources } from '../lib/aboutIcons'
import { canSpeak, speakWords } from '../lib/deviceVoice'

const LINE_WORDS = 7
const SILENT_PACE_MS = 60000 / 165 // captions move at speaking pace while the sound is off

/**
 * The free reel: the author's photo drifting slowly over the story's colours, with the script as
 * big captions that light up word by word. With sound on, the viewer's device voice reads it.
 * `active` is true while the reel fills the screen.
 */
export function VoiceReel({ script, color, author, title, active, muted }) {
  const words = useMemo(() => script.trim().split(/\s+/).filter(Boolean), [script])
  const lines = useMemo(() => {
    const out = []
    for (let i = 0; i < words.length; i += LINE_WORDS) out.push(i)
    return out
  }, [words])
  const [at, setAt] = useState(0)
  const [paused, setPaused] = useState(false)
  const rerun = useRef(0)
  const [run, setRun] = useState(0) // bumps to start again (loop)

  useEffect(() => {
    if (!active || paused || !words.length) return
    let stop
    let timer
    const again = () => {
      timer = setTimeout(() => setRun(++rerun.current), 1800) // short breath, then loop
    }
    if (!muted && canSpeak()) {
      stop = speakWords(words, { onWord: setAt, onEnd: again })
    } else {
      let i = 0
      setAt(0)
      timer = setInterval(() => {
        if (++i >= words.length) {
          clearInterval(timer)
          again()
        } else setAt(i)
      }, SILENT_PACE_MS)
    }
    return () => {
      stop?.()
      clearInterval(timer)
      clearTimeout(timer)
    }
  }, [active, paused, muted, words, run])

  useEffect(() => {
    if (!active) {
      setAt(0)
      setPaused(false)
    }
  }, [active])

  const photo = photoSources(author?.photo_url)
  const line = Math.floor(at / LINE_WORDS)
  const shown = [lines[line], lines[line + 1]].filter((x) => x !== undefined)

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: `radial-gradient(120% 80% at 50% 25%, color-mix(in srgb, ${color} 75%, #fff 10%), color-mix(in srgb, ${color} 35%, #0b0716) 70%)` }}
      onClick={() => setPaused((p) => !p)}
    >
      <div className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-40 h-64 w-64 rounded-full bg-black/25 blur-3xl" />

      <p className="absolute inset-x-6 top-16 text-center font-display text-2xl leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">{title}</p>

      {photo.fallback && (
        <div className="absolute inset-x-0 top-[22%] flex justify-center">
          <div className="relative w-[58%] max-w-[240px] rounded-[2rem] bg-white p-1.5 shadow-2xl shadow-black/50 ring-4 ring-white/20">
            <div className="overflow-hidden rounded-[1.6rem] bg-white">
              <picture>
                {photo.webp && <source srcSet={photo.webp} type="image/webp" />}
                <img
                  src={photo.fallback}
                  alt={author?.name || ''}
                  className={`block aspect-[798/1024] w-full object-contain ${active && !paused ? 'animate-[reel-drift_14s_ease-in-out_infinite_alternate]' : ''}`}
                />
              </picture>
            </div>
            {author?.name && (
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs whitespace-nowrap text-white backdrop-blur">
                {author.name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* captions */}
      <div className="absolute inset-x-4 bottom-44 space-y-1 text-center">
        {shown.map((start) => (
          <p key={start} className="text-xl leading-snug font-semibold text-white/55 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
            {words.slice(start, start + LINE_WORDS).map((w, k) => {
              const i = start + k
              return (
                <span key={i} className={`transition-colors duration-150 ${i === at ? 'rounded bg-accent px-1 text-accent-ink' : i < at ? 'text-white' : ''}`}>
                  {w}{' '}
                </span>
              )
            })}
          </p>
        ))}
      </div>

      {paused && (
        <span className="absolute inset-0 grid place-items-center bg-black/20">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/50 text-white backdrop-blur">
            <Play className="h-7 w-7 fill-white" />
          </span>
        </span>
      )}
    </div>
  )
}
