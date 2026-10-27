import { BookOpen, ExternalLink, Eye, Heart, Star, UsersRound } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'

import { titleStack } from '../lib/fonts'
import { formatCount } from '../lib/readingMode'

const NEW_DAYS = 14

function isNew(story) {
  return story.published_at && Date.now() - new Date(story.published_at).getTime() < NEW_DAYS * 864e5
}

/** The cover art: the uploaded picture, or a designed cover in the story's colours and title font. */
function Cover({ story, color }) {
  if (story.cover_image) return <img src={story.cover_image} alt="" className="h-full w-full object-cover" loading="lazy" />
  return (
    <div className="book-cover-art relative flex h-full flex-col items-center justify-between px-3 py-4 text-center text-white">
      {/* gold frame */}
      <div className="pointer-events-none absolute inset-2 rounded-sm border border-amber-200/45" />
      <div className="pointer-events-none absolute inset-[11px] rounded-sm border border-amber-200/20" />
      <span className="relative text-[9px] font-semibold tracking-[0.3em] text-amber-100/90 uppercase">
        {story.column?.title || story.genres?.[0]?.name || 'Story'}
      </span>
      <span
        className="relative grid h-11 w-11 place-items-center rounded-full border border-amber-200/50 font-display text-xl text-amber-100 shadow-inner"
        style={{ background: `color-mix(in srgb, ${color} 55%, #000)` }}
      >
        {story.title.charAt(0)}
      </span>
      <div className="relative">
        <p className="line-clamp-4 text-[17px] leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" style={{ fontFamily: titleStack(story.title_font) }}>
          {story.title}
        </p>
        {story.author_name && <p className="mt-1.5 text-[10px] tracking-wide text-amber-100/80">{story.author_name}</p>}
      </div>
    </div>
  )
}

/** A story shown as a physical book: it lifts and turns toward the cursor, with light sweeping over the cover. */
export function Book3D({ story, size = 'md' }) {
  const ref = useRef(null)
  const color = story.genres?.[0]?.color || '#6a4ff0'
  const width = size === 'lg' ? 'w-48' : 'w-36 sm:w-40'
  const ribbon = story.is_free ? ['FREE', 'bg-emerald-500 text-white'] : isNew(story) ? ['NEW', 'bg-accent text-accent-ink'] : null

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    ref.current.style.transform = `translateY(-10px) rotateY(${-20 + x * 28}deg) rotateX(${-y * 14}deg) translateZ(14px)`
    ref.current.style.setProperty('--shine-x', `${(x + 0.5) * 100}%`)
    ref.current.style.setProperty('--shine-y', `${(y + 0.5) * 100}%`)
  }
  const onLeave = () => {
    ref.current.style.transform = ''
  }

  return (
    <Link to={`/stories/${story.slug}`} className={`group block ${width} shrink-0 [perspective:900px]`} aria-label={`${story.title}${story.author_name ? ` by ${story.author_name}` : ''}`}>
      <div className="relative">
        {/* shadow on the shelf, spreading as the book lifts */}
        <div className="absolute inset-x-3 -bottom-3 h-5 rounded-[50%] bg-black/45 blur-md transition-all duration-300 group-hover:inset-x-6 group-hover:-bottom-5 group-hover:bg-black/30" />
        <div
          ref={ref}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className="book-3d relative aspect-[2/3] [transform:rotateY(-18deg)] group-hover:[transform:translateY(-10px)_rotateY(-26deg)_translateZ(14px)]"
        >
          <div className="spine rounded-l-sm" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 60%, #000), ${color})` }}>
            <span className="spine-title" style={{ fontFamily: titleStack(story.title_font) }}>
              {story.title}
            </span>
          </div>
          <div className="pages" />
          <div
            className="absolute inset-0 overflow-hidden rounded-r-md rounded-l-sm shadow-[10px_14px_30px_-8px_rgba(0,0,0,0.55)]"
            style={{ background: `linear-gradient(150deg, ${color}, color-mix(in srgb, ${color} 40%, #0b0716))` }}
          >
            <Cover story={story} color={color} />
            {ribbon && (
              <span className={`absolute top-3 -right-8 w-28 rotate-45 py-0.5 text-center text-[9px] font-bold tracking-[0.2em] shadow-md ${ribbon[1]}`}>
                {ribbon[0]}
              </span>
            )}
            {story.rating_count > 0 && (
              <span className="absolute top-2 left-3 inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {Number(story.rating_avg).toFixed(1)}
              </span>
            )}
            {/* "Read now" strip */}
            <span className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1.5 bg-gradient-to-t from-black/85 to-black/30 py-2 text-xs font-semibold text-white transition duration-300 group-hover:translate-y-0">
              <BookOpen className="h-3.5 w-3.5" /> Read now
              {story.chapter_count ? <span className="font-normal opacity-75">· {story.chapter_count} ch</span> : null}
            </span>
            <div className="gloss pointer-events-none absolute inset-0" />
            <div className="shine pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute inset-y-0 left-2 w-px bg-black/20" />
          </div>
        </div>
      </div>
      {/* the shelf the book stands on */}
      <div className="mt-3 h-2 rounded-full bg-gradient-to-b from-line to-transparent opacity-80" />
      <div className="mt-2 pr-2">
        <p className="line-clamp-2 text-sm leading-snug font-semibold transition group-hover:text-accent">{story.title}</p>
        {story.author_name && <p className="truncate text-xs text-muted">{story.author_name}</p>}
        <p className="mt-1 flex items-center gap-1.5 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${story.is_free ? 'bg-emerald-500/15 text-emerald-400' : 'bg-accent/15 text-accent'}`}
          >
            {story.is_free ? 'Free' : `₱${Number(story.price).toFixed(0)}`}
          </span>
          {story.chapter_count ? <span className="text-muted">{story.chapter_count} chapters</span> : null}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted" title={`${story.view_count} views · ${story.reader_count} readers`}>
          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {formatCount(story.view_count)}</span>
          <span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" /> {formatCount(story.reader_count)}</span>
          {story.like_count > 0 && (
            <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {formatCount(story.like_count)}</span>
          )}
          {story.rating_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {Number(story.rating_avg).toFixed(1)}
              <span className="opacity-70">({story.rating_count})</span>
            </span>
          )}
        </p>
      </div>
    </Link>
  )
}

export function Shelf({ title, subtitle, stories, link, id }) {
  if (!stories?.length) return null
  return (
    <section id={id} className="mt-12 scroll-mt-40">
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
      {/* Each book draws its own shelf under it, so the ledge never crosses the text. */}
      <div className="flex gap-6 overflow-x-auto px-6 pt-4 pb-8 [scrollbar-width:thin]">
        {stories.map((s) => (
          <Book3D key={s.id} story={s} />
        ))}
      </div>
    </section>
  )
}
