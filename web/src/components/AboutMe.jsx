import { ArrowUpRight } from 'lucide-react'
import { useRef } from 'react'

import { aboutIcon, photoSources } from '../lib/aboutIcons'

/** Home-page "About Me" section: photo on a tilting 3D frame plus her background. */
export function AboutMe({ about }) {
  const frame = useRef(null)

  const onMove = (e) => {
    const r = frame.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    frame.current.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 10}deg)`
  }

  if (!about) return null
  const photo = photoSources(about.photo_url)

  return (
    <section id="about" className="mt-20 scroll-mt-24">
      <div className="card relative overflow-hidden p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative grid items-center gap-10 md:grid-cols-[minmax(0,320px)_1fr]">
          <div className="mx-auto w-64 [perspective:1000px] sm:w-72 md:w-full" onMouseMove={onMove} onMouseLeave={() => (frame.current.style.transform = '')}>
            <div ref={frame} className="relative transition-transform duration-300 ease-out [transform-style:preserve-3d]">
              <div className="absolute inset-0 translate-x-4 translate-y-4 rounded-3xl bg-gradient-to-br from-accent/60 to-brand/60 [transform:translateZ(-30px)]" />
              {/* White mat so the white-background portrait reads as a photo print in every theme */}
              <div className="relative rounded-3xl bg-white p-2 shadow-2xl shadow-black/40 ring-1 ring-black/5">
                <picture>
                  {photo.webp && <source srcSet={photo.webp} type="image/webp" />}
                  <img
                    src={photo.fallback}
                    alt={about.name}
                    loading="lazy"
                    decoding="async"
                    width="798"
                    height="1024"
                    className="block aspect-[798/1024] w-full rounded-2xl bg-white object-contain"
                  />
                </picture>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-accent uppercase">About Me</p>
            <h2 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
              <span className="notranslate" translate="no">{about.name}</span>
            </h2>
            {about.tagline && <p className="mt-1 text-sm text-muted">{about.tagline}</p>}
            {about.intro && <p className="mt-5 text-lg leading-relaxed whitespace-pre-line">{about.intro}</p>}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {about.roles.map((r, i) => {
                const Icon = aboutIcon(r.icon)
                return (
                <div key={i} className="group rounded-2xl border border-line bg-surface-2/50 p-4 transition hover:-translate-y-0.5 hover:border-brand/50">
                  <p className="flex items-center gap-3 font-semibold">
                    <span className="tile-3d grid h-10 w-10 shrink-0 place-items-center rounded-xl">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    {r.title}
                  </p>
                  <p className="mt-1.5 text-sm text-muted">{r.text}</p>
                </div>
                )
              })}
            </div>

            {about.closing && <p className="mt-6 text-muted whitespace-pre-line">{about.closing}</p>}

            {about.links.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {about.links.map((l, i) => (
                  <a key={i} className="btn-ghost" href={l.url} target="_blank" rel="noreferrer noopener">
                    {l.label} <ArrowUpRight className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
