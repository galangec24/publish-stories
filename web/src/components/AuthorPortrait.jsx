import { ArrowDown, Hand } from 'lucide-react'
import { useState } from 'react'

import { photoSources } from '../lib/aboutIcons'

/** Home-page banner portrait: just her photo; tapping it turns the card over to her description. */
export function AuthorPortrait({ about }) {
  const [turned, setTurned] = useState(false)
  if (!about?.photo_url) return null
  const photo = photoSources(about.photo_url)

  return (
    <div className="flex h-full items-center justify-center [perspective:1200px]">
      <button
        type="button"
        onClick={() => setTurned((t) => !t)}
        aria-expanded={turned}
        aria-label={turned ? `Show ${about.name}'s photo` : `About ${about.name}`}
        className="group relative aspect-[798/1024] h-full max-h-full cursor-pointer text-left"
      >
        <div
          className={`relative h-full w-full transition-transform duration-700 ease-out [transform-style:preserve-3d] ${
            turned ? '[transform:rotateY(180deg)]' : 'group-hover:[transform:rotateY(-6deg)_rotateX(3deg)]'
          }`}
        >
          {/* front: the photo on a white mat */}
          <div className="absolute inset-0 rounded-3xl bg-white p-2 shadow-2xl shadow-black/40 ring-1 ring-black/5 [backface-visibility:hidden]">
            <picture>
              {photo.webp && <source srcSet={photo.webp} type="image/webp" />}
              <img
                src={photo.fallback}
                alt={about.name}
                decoding="async"
                width="798"
                height="1024"
                className="block h-full w-full rounded-2xl bg-white object-contain"
              />
            </picture>
            <span className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs whitespace-nowrap text-white backdrop-blur">
              <Hand className="h-3.5 w-3.5" /> Tap to meet the author
            </span>
          </div>

          {/* back: her description */}
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-2xl shadow-black/40 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-6">
            <p className="text-[11px] font-semibold tracking-[0.25em] text-accent uppercase">About Me</p>
            <h2 className="mt-1.5 font-display text-2xl leading-tight">
              <span className="notranslate" translate="no">{about.name}</span>
            </h2>
            {about.tagline && <p className="mt-1 text-xs text-muted">{about.tagline}</p>}
            {about.intro && <p className="mt-3 min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed whitespace-pre-line">{about.intro}</p>}
            <a
              href="#about"
              onClick={(e) => e.stopPropagation()}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
            >
              More about me <ArrowDown className="h-4 w-4" />
            </a>
          </div>
        </div>
      </button>
    </div>
  )
}
