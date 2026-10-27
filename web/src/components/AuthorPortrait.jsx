import { ArrowDown, Hand } from 'lucide-react'
import { useState } from 'react'

import { photoSources } from '../lib/aboutIcons'

/** Her photo at the end of a shelf, book-sized; tapping it turns the card over to her description. */
export function AuthorPortrait({ about }) {
  const [turned, setTurned] = useState(false)
  if (!about?.photo_url) return null
  const photo = photoSources(about.photo_url)

  return (
    <div className="w-44 shrink-0 [perspective:1200px] sm:w-48">
      <button
        type="button"
        onClick={() => setTurned((t) => !t)}
        aria-expanded={turned}
        aria-label={turned ? `Show ${about.name}'s photo` : `About ${about.name}`}
        className="group relative block aspect-[798/1024] w-full cursor-pointer text-left"
      >
        <div
          className={`relative h-full w-full transition-transform duration-700 ease-out [transform-style:preserve-3d] ${
            turned ? '[transform:rotateY(180deg)]' : 'group-hover:[transform:rotateY(-8deg)_translateY(-6px)]'
          }`}
        >
          {/* front: the photo on a white mat */}
          <div className="absolute inset-0 rounded-2xl bg-white p-1.5 shadow-xl shadow-black/40 ring-1 ring-black/5 [backface-visibility:hidden]">
            <picture>
              {photo.webp && <source srcSet={photo.webp} type="image/webp" />}
              <img
                src={photo.fallback}
                alt={about.name}
                loading="lazy"
                decoding="async"
                width="798"
                height="1024"
                className="block h-full w-full rounded-xl bg-white object-contain"
              />
            </picture>
            <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] whitespace-nowrap text-white backdrop-blur">
              <Hand className="h-3 w-3" /> Tap to meet her
            </span>
          </div>

          {/* back: her description */}
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface p-3.5 shadow-xl shadow-black/40 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="text-[10px] font-semibold tracking-[0.25em] text-accent uppercase">About Me</p>
            {about.intro && <p className="mt-1.5 min-h-0 flex-1 overflow-y-auto text-xs leading-relaxed whitespace-pre-line">{about.intro}</p>}
            <a
              href="#about"
              onClick={(e) => e.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              More about me <ArrowDown className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </button>
      <div className="mt-3 pr-2">
        <p className="line-clamp-2 text-sm leading-snug font-semibold">
          <span className="notranslate" translate="no">{about.name}</span>
        </p>
        <p className="text-xs text-muted">The author</p>
      </div>
    </div>
  )
}
