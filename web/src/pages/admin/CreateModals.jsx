import {
  AlignLeft,
  BookPlus,
  Coins,
  FolderPlus,
  Gift,
  Globe2,
  ImagePlus,
  Layers,
  Lock,
  PenLine,
  Plus,
  Type,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { IconInput, Modal } from '../../components/Modal'
import { GenreChips, useToast } from '../../components/ui'
import { api } from '../../lib/api'

const PRICE_PRESETS = [29, 49, 99, 149]

/** Create or edit a column (a free/public or paywalled section of stories). */
export function ColumnModal({ open, onClose, initial, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ title: '', description: '', is_public: false })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setForm({ title: '', description: '', is_public: false, ...initial })
  }, [open, initial])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { title: form.title.trim(), description: form.description.trim(), is_public: form.is_public }
      const saved = form.id ? await api.patch(`admin/columns/${form.id}/`, body) : await api.post('admin/columns/', body)
      toast(form.id ? 'Column updated.' : `Column “${saved.title}” created.`)
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={FolderPlus}
      title={form.id ? 'Edit column' : 'New column'}
      subtitle="Columns group stories together, like a section of a newspaper."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button form="column-form" className="btn-primary" disabled={busy || !form.title.trim()}>
            {busy ? 'Saving…' : form.id ? 'Save column' : 'Create column'}
          </button>
        </>
      }
    >
      <form id="column-form" onSubmit={save} className="space-y-4">
        <IconInput icon={Type} label="Column name" required maxLength={200} placeholder="e.g. Sunday Reflections" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <IconInput icon={AlignLeft} label="Description" multiline maxLength={600} placeholder="What readers will find here (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div>
          <p className="mb-2 text-sm font-medium">Who can read it?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              [true, Globe2, 'Public', 'Every story in it is free for everyone'],
              [false, Lock, 'Paywalled', 'Each story uses its own price'],
            ].map(([value, Icon, label, hint]) => (
              <button
                type="button"
                key={label}
                onClick={() => setForm({ ...form, is_public: value })}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${form.is_public === value ? 'border-brand bg-brand/10 ring-2 ring-brand/25' : 'border-line hover:border-muted'}`}
              >
                <Icon className={`mt-0.5 h-5 w-5 ${form.is_public === value ? 'text-brand' : 'text-muted'}`} />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Everything needed to start a story in one step: title, author, synopsis,
 * genres, column, price, free preview and cover, with a live cover preview.
 * Creates the story, uploads the cover, then opens it in the Studio.
 */
export function NewStoryModal({ open, onClose }) {
  const toast = useToast()
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const [genres, setGenres] = useState([])
  const [columns, setColumns] = useState([])
  const [columnModal, setColumnModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cover, setCover] = useState(null) // { file, url }
  const [form, setForm] = useState(blank())

  function blank() {
    return { title: '', author_name: '', synopsis: '', genre_ids: new Set(), column_id: '', paid: false, price: 49, preview_page_count: 3 }
  }

  useEffect(() => {
    if (!open) return
    setForm(blank())
    setCover(null)
    Promise.all([api.get('admin/genres/'), api.get('admin/columns/')])
      .then(([g, c]) => {
        setGenres(g)
        setColumns(c)
      })
      .catch((e) => toast(e, 'error'))
  }, [open, toast])

  useEffect(() => () => cover && URL.revokeObjectURL(cover.url), [cover])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const selectedColumn = columns.find((c) => String(c.id) === String(form.column_id))
  const freeByColumn = Boolean(selectedColumn?.is_public)
  const firstGenre = genres.find((g) => form.genre_ids.has(g.id))
  const priceError = form.paid && !freeByColumn && Number(form.price) < 20 ? 'PayMongo requires at least ₱20.' : ''

  async function create(e) {
    e?.preventDefault()
    if (priceError) return
    setBusy(true)
    try {
      const story = await api.post('admin/stories/', {
        title: form.title.trim(),
        author_name: form.author_name.trim(),
        synopsis: form.synopsis.trim(),
        genre_ids: [...form.genre_ids],
        column_id: form.column_id ? Number(form.column_id) : null,
        price: form.paid && !freeByColumn ? String(form.price) : '0',
        preview_page_count: Number(form.preview_page_count) || 0,
      })
      if (cover) {
        const data = new FormData()
        data.append('cover_image', cover.file)
        await api.upload(`admin/stories/${story.id}/`, data, 'PATCH').catch(() => toast('Story created, but the cover could not be uploaded.', 'error'))
      }
      toast(`“${story.title}” created. Start writing!`)
      onClose()
      navigate(`/admin/stories/${story.id}`)
    } catch (err) {
      toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        icon={BookPlus}
        size="max-w-4xl"
        title="New story"
        subtitle="Set it up here, then write it in the Studio. You can change everything later."
        footer={
          <>
            <span className="mr-auto hidden text-xs text-muted sm:block">Saved as a draft until you publish.</span>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button form="story-form" className="btn-primary" disabled={busy || !form.title.trim() || Boolean(priceError)}>
              <PenLine className="h-4 w-4" /> {busy ? 'Creating…' : 'Create & start writing'}
            </button>
          </>
        }
      >
        <form id="story-form" onSubmit={create} className="grid gap-8 md:grid-cols-[220px_1fr]">
          {/* Live cover preview + cover upload */}
          <div className="mx-auto w-48 md:w-full">
            <div className="[perspective:900px]">
              <div className="book-3d relative aspect-[2/3] [transform:rotateY(-16deg)]">
                <div className="spine rounded-l-sm" style={{ background: firstGenre?.color || '#6a4ff0' }} />
                <div className="pages" />
                <div
                  className="absolute inset-0 overflow-hidden rounded-r-md rounded-l-sm shadow-[10px_14px_30px_-8px_rgba(0,0,0,0.55)]"
                  style={{ background: `linear-gradient(150deg, ${firstGenre?.color || '#6a4ff0'}, #0b0716)` }}
                >
                  {cover ? (
                    <img src={cover.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col justify-between p-4 text-white">
                      <span className="text-[10px] font-semibold tracking-[0.2em] uppercase opacity-80">{firstGenre?.name || 'Story'}</span>
                      <div>
                        <p className="font-display text-xl leading-tight break-words">{form.title || 'Your title'}</p>
                        <p className="mt-1 text-xs opacity-80">{form.author_name || 'Author'}</p>
                      </div>
                    </div>
                  )}
                  <div className="gloss pointer-events-none absolute inset-0" />
                </div>
              </div>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) setCover({ file, url: URL.createObjectURL(file) })
              }}
            />
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-ghost flex-1 !px-2 !py-2 text-xs" onClick={() => fileInput.current?.click()}>
                <ImagePlus className="h-4 w-4" /> {cover ? 'Change cover' : 'Add cover'}
              </button>
              {cover && (
                <button type="button" className="btn-ghost !px-2 !py-2" onClick={() => setCover(null)} aria-label="Remove cover">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">Optional. Without one, a cover is drawn from the genre colour.</p>
          </div>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <IconInput icon={Type} label="Title" required maxLength={200} placeholder="e.g. Ang Huling Diwata" value={form.title} onChange={set('title')} className="sm:col-span-2" />
              <IconInput icon={PenLine} label="Author" maxLength={120} placeholder="Maria Gemima Valderrama" value={form.author_name} onChange={set('author_name')} className="sm:col-span-2" />
            </div>
            <IconInput icon={AlignLeft} label="Synopsis" multiline maxLength={2000} placeholder="A short teaser readers see before opening the story" value={form.synopsis} onChange={set('synopsis')} />

            <div>
              <p className="mb-2 text-sm font-medium">Genres</p>
              <GenreChips
                genres={genres}
                selected={form.genre_ids}
                onToggle={(id) =>
                  setForm((f) => {
                    const next = new Set(f.genre_ids)
                    next.has(id) ? next.delete(id) : next.add(id)
                    return { ...f, genre_ids: next }
                  })
                }
              />
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Layers className="h-4 w-4" /> Column</p>
              <div className="flex gap-2">
                <select className="input flex-1" value={form.column_id} onChange={set('column_id')}>
                  <option value="">Standalone story (no column)</option>
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}{c.is_public ? ' · public, free' : ''}</option>
                  ))}
                </select>
                <button type="button" className="btn-ghost shrink-0" onClick={() => setColumnModal(true)}>
                  <Plus className="h-4 w-4" /> New column
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Coins className="h-4 w-4" /> Price</p>
              {freeByColumn ? (
                <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-500">
                  Free: “{selectedColumn.title}” is a public column, so every story in it is free.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [false, Gift, 'Free', 'Anyone can read it all'],
                      [true, Lock, 'Paid', 'Preview, then unlock via QR Ph'],
                    ].map(([value, Icon, label, hint]) => (
                      <button
                        type="button"
                        key={label}
                        onClick={() => setForm({ ...form, paid: value })}
                        className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${form.paid === value ? 'border-brand bg-brand/10 ring-2 ring-brand/25' : 'border-line hover:border-muted'}`}
                      >
                        <Icon className={`mt-0.5 h-5 w-5 ${form.paid === value ? 'text-brand' : 'text-muted'}`} />
                        <span>
                          <span className="block font-semibold">{label}</span>
                          <span className="block text-xs text-muted">{hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {form.paid && (
                    <div className="mt-3 space-y-3 rounded-2xl border border-line bg-surface-2/40 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {PRICE_PRESETS.map((p) => (
                          <button type="button" key={p} onClick={() => setForm({ ...form, price: p })} className={`chip ${Number(form.price) === p ? 'border-brand bg-brand/15 font-semibold' : 'border-line'}`}>
                            ₱{p}
                          </button>
                        ))}
                        <div className="relative w-28">
                          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">₱</span>
                          <input type="number" min="20" step="1" className="input !py-1.5 !pl-7" value={form.price} onChange={set('price')} aria-label="Custom price" />
                        </div>
                      </div>
                      {priceError && <p className="text-xs text-rose-400">{priceError}</p>}
                      <label className="block">
                        <span className="flex items-center justify-between text-sm">
                          <span>Free preview</span>
                          <span className="font-semibold">{form.preview_page_count} paragraph{Number(form.preview_page_count) === 1 ? '' : 's'}</span>
                        </span>
                        <input type="range" min="0" max="15" value={form.preview_page_count} onChange={set('preview_page_count')} className="mt-2 w-full accent-[var(--brand)]" />
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <ColumnModal
        open={columnModal}
        onClose={() => setColumnModal(false)}
        onSaved={(column) => {
          setColumns((list) => [...list, column])
          setForm((f) => ({ ...f, column_id: String(column.id) }))
        }}
      />
    </>
  )
}
