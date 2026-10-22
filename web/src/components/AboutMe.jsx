import { ArrowUpRight, BookMarked, GraduationCap, Newspaper, School } from 'lucide-react'
import { useRef } from 'react'

const ROLES = [
  {
    icon: School,
    title: 'DepEd Davao Region',
    text: 'Served as regional information and communications officer and headed the Public Affairs Unit (PAU), supporting public information, media relations, and education communications.',
  },
  {
    icon: Newspaper,
    title: 'Journalism & writing',
    text: 'Writes for SunStar Davao, including opinion columns on education, leadership, personal reflections, and social issues.',
  },
  {
    icon: GraduationCap,
    title: 'Teaching',
    text: 'Taught Mass Communication at Ateneo de Davao University, with an emphasis on learning through real-world exposure and storytelling.',
  },
  {
    icon: BookMarked,
    title: 'Publications',
    text: "Contributed to DepEd Davao Dispatch, DepEd Davao Region's official publication, including articles about education leaders and regional initiatives.",
  },
]

/** Home-page "About Me" section: photo on a tilting 3D frame plus her background. */
export function AboutMe() {
  const frame = useRef(null)

  const onMove = (e) => {
    const r = frame.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    frame.current.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 10}deg)`
  }

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
                  <source srcSet="/about/maria-gemima-valderrama.webp" type="image/webp" />
                  <img
                    src="/about/maria-gemima-valderrama.jpg"
                    alt="Maria Gemima Valderrama"
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
              <span className="notranslate" translate="no">Maria Gemima Valderrama</span>
            </h2>
            <p className="mt-1 text-sm text-muted">Davao City · Education communicator · Journalist · Columnist</p>
            <p className="mt-5 text-lg leading-relaxed">
              A Davao-based education communications professional, journalist, columnist, and former university
              educator. Her work has focused on education, public service, journalism, and community storytelling.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {ROLES.map((r) => (
                <div key={r.title} className="rounded-2xl border border-line bg-surface-2/50 p-4 transition hover:-translate-y-0.5 hover:border-brand/50">
                  <p className="flex items-center gap-2 font-semibold">
                    <r.icon className="h-5 w-5 text-brand" aria-hidden />
                    {r.title}
                  </p>
                  <p className="mt-1.5 text-sm text-muted">{r.text}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 text-muted">
              Her public work reflects a combination of education communication, journalism, mentoring, and
              storytelling, particularly in highlighting the people and communities behind public education in Davao
              Region.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a className="btn-ghost" href="https://www.sunstar.com.ph" target="_blank" rel="noreferrer noopener">
                Read her columns on SunStar Davao <ArrowUpRight className="h-4 w-4" />
              </a>
              <a className="btn-ghost" href="https://www.deped.gov.ph" target="_blank" rel="noreferrer noopener">
                Education stories on DepEd <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
