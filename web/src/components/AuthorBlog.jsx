import { Eye, Library, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { aboutIcon } from '../lib/aboutIcons'

/** Counts up from 0 the first time the number scrolls into view. */
function CountUp({ value, duration = 1600 }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el || !value) {
      setShown(value || 0)
      return
    }
    let frame
    const run = () => {
      const start = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration)
        setShown(Math.round(value * (1 - Math.pow(1 - t, 3)))) // ease-out
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run()
          io.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value, duration])

  return (
    <span ref={ref} className="tabular-nums">
      {shown.toLocaleString()}
    </span>
  )
}

/**
 * Blog-style introduction shown before "About Me": a welcome note, a live
 * counter of everyone who has read here, and the kinds of writing she publishes.
 */
export function AuthorBlog({ stats, about }) {
  if (!about) return null
  return (
    <section id="blog" className="mt-20 scroll-mt-24">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.25em] text-accent uppercase">From the Author&apos;s Desk</p>
        <h2 className="mx-auto mt-3 max-w-3xl font-display text-3xl leading-tight sm:text-5xl">{about.blog_heading}</h2>
        {about.blog_intro && <p className="mx-auto mt-4 max-w-2xl text-lg whitespace-pre-line text-muted">{about.blog_intro}</p>}
      </div>

      {/* Live reader counter */}
      <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
        {[
          { label: 'Readers so far', value: stats?.total_readers, icon: UsersRound, big: true },
          { label: 'Story views', value: stats?.total_views, icon: Eye },
          { label: 'Stories published', value: stats?.published_stories, icon: Library },
        ].map((s) => (
          <div
            key={s.label}
            className={`card relative overflow-hidden p-6 text-center transition hover:-translate-y-1 ${
              s.big ? 'ring-2 ring-accent/40' : ''
            }`}
          >
            {s.big && <div className="pointer-events-none absolute -top-10 left-1/2 h-24 w-40 -translate-x-1/2 rounded-full bg-accent/25 blur-2xl" />}
            <span className="tile-3d relative mx-auto grid h-14 w-14 place-items-center rounded-2xl">
              <s.icon className="h-7 w-7" aria-hidden />
            </span>
            <p className={`relative mt-2 font-display ${s.big ? 'text-5xl text-accent' : 'text-4xl'}`}>
              <CountUp value={s.value || 0} />
            </p>
            <p className="relative mt-1 text-xs tracking-widest text-muted uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-6 grid max-w-4xl gap-4 sm:grid-cols-3">
        {about.blog_cards.map((w, i) => {
          const Icon = aboutIcon(w.icon)
          return (
          <article key={i} className="group rounded-2xl border border-line bg-surface/60 p-5 transition hover:-translate-y-1">
            <span className="tile-3d grid h-12 w-12 place-items-center rounded-xl">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-2 font-semibold">{w.title}</h3>
            <p className="mt-1 text-sm text-muted">{w.text}</p>
          </article>
          )
        })}
      </div>
    </section>
  )
}
