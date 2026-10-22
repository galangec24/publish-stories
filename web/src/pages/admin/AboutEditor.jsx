import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Link2, Plus, RotateCcw, Save, Trash2, Type, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { IconInput } from '../../components/Modal'
import { Spinner, useToast } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { ABOUT_ICONS, photoSources } from '../../lib/aboutIcons'

const EDITABLE = ['name', 'tagline', 'intro', 'closing', 'photo_url', 'roles', 'links', 'blog_heading', 'blog_intro', 'blog_cards']
const pick = (obj) => Object.fromEntries(EDITABLE.map((k) => [k, structuredClone(obj[k])]))

/** Edit the home page's "About Me" and "From the Author's Desk" sections. */
export function AboutEditor() {
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [defaults, setDefaults] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    api
      .get('admin/about/')
      .then((data) => {
        setForm(pick(data))
        setSaved(pick(data))
        setDefaults(data.defaults)
      })
      .catch((e) => toast(e, 'error'))
  }, [toast])

  if (!form) return <Spinner />
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function save() {
    setBusy(true)
    try {
      const data = await api.put('admin/about/', form)
      setForm(pick(data))
      setSaved(pick(data))
      toast('About page saved. It is live on the home page now.')
    } catch (e) {
      toast(e instanceof ApiError ? describe(e.body) : e, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function uploadPhoto(file) {
    const data = new FormData()
    data.append('image', file)
    setUploading(true)
    try {
      const { url } = await api.upload('admin/images/', data)
      setForm((f) => ({ ...f, photo_url: url }))
      toast('Photo uploaded. Click Save to publish it.')
    } catch (e) {
      toast(e, 'error')
    } finally {
      setUploading(false)
    }
  }

  const photo = photoSources(form.photo_url)

  return (
    <div className="pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="font-display text-3xl">About me</h1>
          <p className="text-sm text-muted">Edit the &ldquo;From the Author&apos;s Desk&rdquo; and &ldquo;About Me&rdquo; sections on the home page.</p>
        </div>
        <Link to="/#about" target="_blank" className="btn-ghost">
          <ExternalLink className="h-4 w-4" /> View on site
        </Link>
      </div>

      {/* About Me */}
      <section className="card mt-6 grid gap-8 p-6 md:grid-cols-[220px_1fr]">
        <div>
          <p className="mb-2 text-sm font-medium">Photo</p>
          <div className="rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-black/5">
            <picture>
              {photo.webp && <source srcSet={photo.webp} type="image/webp" />}
              <img src={photo.fallback} alt="" className="aspect-[4/5] w-full rounded-xl bg-white object-contain" />
            </picture>
          </div>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadPhoto(f) }} />
          <button type="button" className="btn-ghost mt-3 w-full" disabled={uploading} onClick={() => fileInput.current?.click()}>
            <ImagePlus className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload new photo'}
          </button>
          {defaults && form.photo_url !== defaults.photo_url && (
            <button type="button" className="mt-2 w-full text-xs text-muted hover:text-ink" onClick={() => setForm({ ...form, photo_url: defaults.photo_url })}>
              Use the original photo
            </button>
          )}
          <p className="mt-2 text-[11px] text-muted">Tip: a portrait on a plain white background looks best.</p>
        </div>

        <div className="space-y-4">
          <IconInput icon={UserRound} label="Name" required maxLength={120} value={form.name} onChange={set('name')} />
          <IconInput icon={Type} label="Tagline" maxLength={200} placeholder="e.g. Davao City · Journalist · Columnist" value={form.tagline} onChange={set('tagline')} />
          <IconInput label="Introduction" multiline rows={4} value={form.intro} onChange={set('intro')} />
          <CardList
            label="Highlights"
            hint="Roles, achievements or anything readers should know. Up to 8."
            max={8}
            items={form.roles}
            onChange={(roles) => setForm({ ...form, roles })}
          />
          <IconInput label="Closing paragraph" multiline rows={3} value={form.closing} onChange={set('closing')} />
          <LinkList items={form.links} onChange={(links) => setForm({ ...form, links })} />
        </div>
      </section>

      {/* Author's desk */}
      <section className="card mt-6 space-y-4 p-6">
        <div>
          <h2 className="font-display text-2xl">From the Author&apos;s Desk</h2>
          <p className="text-sm text-muted">The welcome section above About Me. The reader counters there update automatically.</p>
        </div>
        <IconInput icon={Type} label="Heading" maxLength={200} value={form.blog_heading} onChange={set('blog_heading')} />
        <IconInput label="Welcome note" multiline rows={4} value={form.blog_intro} onChange={set('blog_intro')} />
        <CardList
          label="What I write"
          hint="Shown as cards under the reader counters. Up to 6."
          max={6}
          items={form.blog_cards}
          onChange={(blog_cards) => setForm({ ...form, blog_cards })}
        />
      </section>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <span className={`text-sm ${dirty ? 'text-amber-500' : 'text-muted'}`}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          {defaults && (
            <button
              type="button"
              className="btn-ghost ml-auto !py-2"
              onClick={() => window.confirm('Replace everything with the original text? (Not saved until you click Save.)') && setForm(pick(defaults))}
            >
              <RotateCcw className="h-4 w-4" /> Original text
            </button>
          )}
          <button type="button" className={`btn-primary !py-2 ${defaults ? '' : 'ml-auto'}`} disabled={busy || !dirty || !form.name.trim()} onClick={save}>
            <Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Turn DRF's nested validation errors into one readable line. */
function describe(body) {
  if (!body || typeof body !== 'object') return 'Could not save.'
  const parts = []
  const walk = (value, path) => {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) parts.push(`${path}: ${value[0]}`)
    else if (Array.isArray(value)) value.forEach((v, i) => v && Object.keys(v).length && walk(v, `${path} #${i + 1}`))
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, path ? `${path} ${k}` : k))
  }
  walk(body, '')
  return parts.slice(0, 3).join(' · ') || 'Could not save.'
}

function move(list, i, delta) {
  const next = [...list]
  const j = i + delta
  if (j < 0 || j >= next.length) return list
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function CardList({ label, hint, items, onChange, max }) {
  const update = (i, patch) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <div className="space-y-3">
        {items.map((card, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface-2/40 p-3">
            <div className="flex flex-wrap items-center gap-1">
              {Object.entries(ABOUT_ICONS).map(([name, Icon]) => (
                <button
                  type="button"
                  key={name}
                  title={name}
                  onClick={() => update(i, { icon: name })}
                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${card.icon === name ? 'tile-3d' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
              <span className="ml-auto flex gap-1">
                <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface-2" onClick={() => onChange(move(items, i, -1))} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface-2" onClick={() => onChange(move(items, i, 1))} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-rose-400" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </span>
            </div>
            <input className="input mt-2 !py-2 font-semibold" maxLength={80} placeholder="Title" value={card.title} onChange={(e) => update(i, { title: e.target.value })} />
            <textarea className="input mt-2 min-h-16 !py-2 text-sm" maxLength={400} placeholder="Short description" value={card.text} onChange={(e) => update(i, { text: e.target.value })} />
          </div>
        ))}
      </div>
      {items.length < max && (
        <button type="button" className="btn-ghost mt-3 !py-2" onClick={() => onChange([...items, { icon: 'star', title: '', text: '' }])}>
          <Plus className="h-4 w-4" /> Add card
        </button>
      )}
    </div>
  )
}

function LinkList({ items, onChange }) {
  const update = (i, patch) => onChange(items.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  return (
    <div>
      <p className="text-sm font-medium">Link buttons</p>
      <p className="mb-2 text-xs text-muted">E.g. her SunStar columns. Up to 6.</p>
      <div className="space-y-2">
        {items.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input className="input !py-2" maxLength={80} placeholder="Button text" value={l.label} onChange={(e) => update(i, { label: e.target.value })} />
            <div className="relative">
              <Link2 className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input !py-2 !pl-9" type="url" placeholder="https://…" value={l.url} onChange={(e) => update(i, { url: e.target.value })} />
            </div>
            <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-rose-400" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove link">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {items.length < 6 && (
        <button type="button" className="btn-ghost mt-3 !py-2" onClick={() => onChange([...items, { label: '', url: 'https://' }])}>
          <Plus className="h-4 w-4" /> Add link
        </button>
      )}
    </div>
  )
}
