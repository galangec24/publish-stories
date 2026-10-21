import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { GenreChips, Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'

/** "What do you like to read?" Shown after the first sign-in; reused from Settings. */
export function Onboarding() {
  const { user, saveGenres } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const genres = useAsync(() => api.get('genres/'), [])
  const [selected, setSelected] = useState(() => new Set((user?.preferred_genres || []).map((g) => g.id)))
  const [busy, setBusy] = useState(false)
  const editing = user?.onboarded

  async function save(ids) {
    setBusy(true)
    try {
      await saveGenres(ids)
      navigate(editing ? '/settings' : '/', { replace: true })
    } catch (e) {
      toast(e, 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="mx-auto max-w-2xl animate-float-up pt-12">
      <p className="text-sm tracking-widest text-accent uppercase">{editing ? 'Your genres' : 'Welcome'}</p>
      <h1 className="mt-2 font-display text-4xl">What do you like to read?</h1>
      <p className="mt-2 text-muted">
        Pick a few genres and we&apos;ll fill your <em>For you</em> shelf. You can change these anytime.
      </p>
      <div className="card mt-8 p-6">
        {genres.loading ? <Spinner /> : <GenreChips genres={genres.data || []} selected={selected} onToggle={toggle} />}
      </div>
      <div className="mt-6 flex items-center justify-between">
        {!editing ? (
          <button className="text-sm text-muted hover:text-ink" disabled={busy} onClick={() => save([])}>
            Skip for now
          </button>
        ) : (
          <span />
        )}
        <button className="btn-primary" disabled={busy || (!editing && selected.size === 0)} onClick={() => save([...selected])}>
          {selected.size ? `Continue · ${selected.size} selected` : editing ? 'Save' : 'Pick at least one'}
        </button>
      </div>
    </div>
  )
}
