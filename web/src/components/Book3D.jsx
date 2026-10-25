import { useRef } from 'react'
import { ExternalLink, Eye, Heart, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'

import { titleStack } from '../lib/fonts'
import { formatCount } from '../lib/readingMode'
import { RatingBadge } from './StoryRating'

/** A story shown as a physical book that tilts toward the cursor. */
export function Book3D({ story, size = 'md' }) {
  const ref = useRef(null)
  const color = story.genres?.[0]?.color || '#6a4ff0'
  const width = size === 'lg' ? 'w-48' : 'w-36 sm:w-40'

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    ref.current.style.transform = `rotateY(${-22 + x * 26}deg) rotateX(${-y * 14}deg) translateZ(10px)`
  }
  const onLeave = () => {
    ref.current.style.transform = ''
  }

  return (
    <Link to={`/stories/${story.slug}`} className={`group block ${width} shrink-0 [perspective:900px]`}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="book-3d relative aspect-[2/3] [transform:rotateY(-18deg)] group-hover:[transform:rotateY(-26deg)_translateZ(10px)]"
      >
        <div className="spine rounded-l-sm" style={{ background: color }} />
        <div className="pages" />
        <div
          className="absolute inset-0 overflow-hidden rounded-r-md rounded-l-sm shadow-[10px_14px_30px_-8px_rgba(0,0,0,0.55)]"
          style={{ background: `linear-gradient(150deg, ${color}, color-mix(in srgb, ${color} 45%, #0b0716))` }}
        >
          {story.cover_image ? (
            <img src={story.cover_image} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full flex-col justify-between p-3.5 text-white">
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase opacity-80">
                {story.genres?.[0]?.name || 'Story'}
              </span>
              <div>
                <p className="text-lg leading-tight drop-shadow" style={{ fontFamily: titleStack(story.title_font) }}>{story.title}</p>
                {story.author_name && <p className="mt-1 text-xs opacity-80">{story.author_name}</p>}
              </div>
            </div>
          )}
          <div className="gloss pointer-events-none absolute inset-0" />
          <div className="absolute inset-y-0 left-2 w-px bg-black/25" />
        </div>
      </div>
      <div className="mt-3 pr-2">
        <p className="truncate text-sm font-semibold group-hover:text-accent">{story.title}</p>
        <p className="text-xs text-muted">
          {story.is_free ? 'Free' : `₱${Number(story.price).toFixed(2)}`}
          {story.chapter_count ? ` · ${story.chapter_count} ch` : ''}
        </p>
        <p className="flex items-center gap-2.5 text-xs text-muted" title={`${story.view_count} views · ${story.reader_count} readers`}>
          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {formatCount(story.view_count)}</span>
          <span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" /> {formatCount(story.reader_count)}</span>
          {story.like_count > 0 && (
            <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {formatCount(story.like_count)}</span>
          )}
          <RatingBadge average={story.rating_avg} count={story.rating_count} />
        </p>
      </div>
    </Link>
  )
}

export function Shelf({ title, subtitle, stories, link }) {
  if (!stories?.length) return null
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between px-1">
        <div>
          <h2 className="font-display text-2xl">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {link && (
          <a href={link} target="_blank" rel="noreferrer noopener" className="btn-ghost !py-1.5 text-sm">
            Visit <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {/* Wooden-shelf ledge under the books */}
      <div className="relative">
        <div className="flex gap-6 overflow-x-auto px-6 pt-4 pb-8 [scrollbar-width:thin]">
          {stories.map((s) => (
            <Book3D key={s.id} story={s} />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-14 h-3 rounded-full bg-gradient-to-b from-line to-transparent opacity-70" />
      </div>
    </section>
  )
}
