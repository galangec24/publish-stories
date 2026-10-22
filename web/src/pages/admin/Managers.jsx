import { ExternalLink, GripVertical, Lock, LockOpen, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { Field, Spinner, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { ColumnModal } from './CreateModals'

function EditorModal({ title, children, onClose, onSave }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form
        className="card w-full max-w-md space-y-4 p-6"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
      >
        <h2 className="font-display text-xl">{title}</h2>
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  )
}

export function Genres() {
  const toast = useToast()
  const list = useAsync(() => api.get('admin/genres/'), [])
  const [edit, setEdit] = useState(null)
  const dragFrom = useRef({ i: null }).current

  async function save() {
    const { id, ...body } = edit
    try {
      id ? await api.patch(`admin/genres/${id}/`, body) : await api.post('admin/genres/', body)
      setEdit(null)
      list.reload()
    } catch (e) {
      toast(e, 'error')
    }
  }

  async function removeGenre(g) {
    const used = g.story_count
      ? `

${g.story_count} stor${g.story_count === 1 ? 'y uses' : 'ies use'} it. The stories stay; only the "${g.name}" tag is removed from them and from readers' favourites.`
      : ''
    if (!window.confirm(`Delete the genre "${g.name}"?${used}`)) return
    try {
      await api.delete(`admin/genres/${g.id}/`)
      toast(`Deleted "${g.name}".`)
      list.reload()
    } catch (e) {
      toast(e, 'error')
    }
  }

  async function drop(to) {
    const from = dragFrom.i
    if (from === null || from === to) return
    const items = [...list.data]
    items.splice(to, 0, items.splice(from, 1)[0])
    list.setData(items)
    await Promise.all(items.map((g, i) => api.patch(`admin/genres/${g.id}/`, { sort_order: i }))).catch((e) => toast(e, 'error'))
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Genres</h1>
        <button className="btn-primary" onClick={() => setEdit({ name: '', description: '', color: '#6750A4', is_active: true })}>
          + New genre
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">Drag to set the order readers see.</p>
      {list.loading ? (
        <Spinner />
      ) : (
        <div className="card mt-5 divide-y divide-line">
          {list.data.map((g, i) => (
            <div
              key={g.id}
              draggable
              onDragStart={() => (dragFrom.i = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)}
              onClick={() => setEdit({ id: g.id, name: g.name, description: g.description, color: g.color, is_active: g.is_active })}
              className="flex cursor-pointer items-center gap-3 p-4 hover:bg-surface-2"
            >
              <GripVertical className="h-4 w-4 cursor-grab text-muted" />
              <span className="h-4 w-4 rounded-full" style={{ background: g.color }} />
              <div className="flex-1">
                <p className="font-medium">{g.name}</p>
                <p className="text-sm text-muted">{g.is_active ? g.description || '—' : 'Hidden from readers'}</p>
              </div>
              <span className="text-xs text-muted">{g.story_count ?? 0} stor{g.story_count === 1 ? 'y' : 'ies'}</span>
              <button
                type="button"
                title={`Delete ${g.name}`}
                className="rounded-lg p-2 text-muted hover:bg-rose-500/10 hover:text-rose-400"
                onClick={(e) => {
                  e.stopPropagation()
                  removeGenre(g)
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {edit && (
        <EditorModal title={edit.id ? 'Edit genre' : 'New genre'} onClose={() => setEdit(null)} onSave={save}>
          <Field label="Name"><input className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Description"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <Field label="Colour">
            <div className="flex gap-3">
              <input type="color" className="h-11 w-14 rounded-lg border border-line bg-transparent" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
              <input className="input" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
            </div>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
            Shown to readers
          </label>
        </EditorModal>
      )}
    </div>
  )
}

export function Columns() {
  const list = useAsync(() => api.get('admin/columns/'), [])
  const [edit, setEdit] = useState(null)

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Columns</h1>
        <button className="btn-primary" onClick={() => setEdit({ title: '', description: '', is_public: false })}>
          + New column
        </button>
      </div>
      {list.loading ? (
        <Spinner />
      ) : !list.data.length ? (
        <p className="py-16 text-center text-muted">No columns yet.</p>
      ) : (
        <div className="card mt-5 divide-y divide-line">
          {list.data.map((c) => (
            <button
              key={c.id}
              onClick={() => setEdit({ id: c.id, title: c.title, description: c.description, is_public: c.is_public, url: c.url || "" })}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2"
            >
              {c.is_public ? <LockOpen className="h-5 w-5 text-emerald-400" /> : <Lock className="h-5 w-5 text-amber-500" />}
              <div className="flex-1">
                <p className="font-medium">{c.title}</p>
                <p className="text-sm text-muted">{c.is_public ? 'Public · free for everyone' : 'Paywalled'}</p>
                {c.url && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-brand">
                    <ExternalLink className="h-3 w-3 shrink-0" /> {c.url}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      <ColumnModal open={Boolean(edit)} initial={edit} onClose={() => setEdit(null)} onSaved={() => list.reload()} />
    </div>
  )
}

const STATUS_STYLE = {
  paid: 'bg-emerald-500/15 text-emerald-400',
  duplicate: 'bg-sky-500/15 text-sky-400',
  rejected: 'bg-red-500/15 text-red-400',
}

export function Payments() {
  const logs = useAsync(() => api.get('admin/payments/logs/'), [])
  const [open, setOpen] = useState(null)
  return (
    <div>
      <h1 className="font-display text-3xl">Payments</h1>
      <p className="mt-1 text-sm text-muted">Every PayMongo webhook, including rejected ones, with the raw payload.</p>
      {logs.loading ? (
        <Spinner />
      ) : !logs.data?.results.length ? (
        <p className="py-16 text-center text-muted">No webhook events yet.</p>
      ) : (
        <div className="card mt-5 divide-y divide-line">
          {logs.data.results.map((l) => (
            <div key={l.id}>
              <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2" onClick={() => setOpen(open === l.id ? null : l.id)}>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-surface-2 text-muted'}`}>{l.status}</span>
                <span className="flex-1 truncate text-sm">{l.event_type}</span>
                <span className="text-xs text-muted">{new Date(l.created_at).toLocaleString()}</span>
              </button>
              {open === l.id && (
                <pre className="overflow-x-auto bg-bg-2 p-4 text-xs">{JSON.stringify(l.raw_webhook, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
