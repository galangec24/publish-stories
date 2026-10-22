import { Eye, EyeOff, MessageSquareText, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Avatar } from '../../components/HeaderMenus'
import { Spinner, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import { useAsync } from '../../lib/useAsync'
import { onLiveEvent } from '../../realtime/LiveProvider'

/** Moderate readers' comments: hide (reversible) or delete. */
export function CommentsAdmin() {
  const toast = useToast()
  const [hiddenOnly, setHiddenOnly] = useState(false)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const list = useAsync(() => api.get('admin/comments/', { hidden: hiddenOnly ? 'true' : '', q: search }), [hiddenOnly, search])

  // New-comment notifications arrive live; refresh the list when they do.
  useEffect(() => onLiveEvent('notification', (n) => n.kind === 'comment' && list.reload()), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function setHidden(c, hide) {
    try {
      await api.post(`admin/comments/${c.id}/${hide ? 'hide' : 'unhide'}/`)
      list.setData((d) => ({ ...d, results: d.results.map((x) => (x.id === c.id ? { ...x, is_hidden: hide } : x)) }))
      toast(hide ? 'Comment hidden from readers.' : 'Comment visible again.')
    } catch (e) {
      toast(e, 'error')
    }
  }

  async function remove(c) {
    if (!window.confirm('Delete this comment permanently? Its replies are deleted too.')) return
    try {
      await api.delete(`comments/${c.id}/`)
      list.setData((d) => ({ ...d, results: d.results.filter((x) => x.id !== c.id && x.parent !== c.id) }))
      toast('Comment deleted.')
    } catch (e) {
      toast(e, 'error')
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl">Comments</h1>
      <p className="mt-1 text-sm text-muted">Hide a comment to remove it from the story without deleting it, or delete it for good.</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(q.trim())
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input !w-64 !py-2 !pl-9" placeholder="Search text or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        {[
          [false, 'All'],
          [true, 'Hidden'],
        ].map(([value, label]) => (
          <button key={label} onClick={() => setHiddenOnly(value)} className={`chip ${hiddenOnly === value ? 'border-brand bg-brand/15' : 'border-line'}`}>
            {label}
          </button>
        ))}
      </div>

      {list.loading && !list.data ? (
        <Spinner />
      ) : !list.data?.results.length ? (
        <p className="py-16 text-center text-muted">
          <MessageSquareText className="mx-auto mb-2 h-8 w-8 opacity-40" /> No comments here.
        </p>
      ) : (
        <div className="card mt-5 divide-y divide-line p-0">
          {list.data.results.map((c) => (
            <div key={c.id} className={`flex gap-3 p-4 ${c.is_hidden ? 'opacity-60' : ''}`}>
              <Avatar user={c.user} size="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">
                    {c.user.first_name} {c.user.last_name}
                  </span>{' '}
                  <span className="text-muted">({c.user.email})</span>
                  {c.parent && <span className="ml-1 text-xs text-muted">· reply</span>}
                  {c.is_hidden && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">Hidden</span>}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
                <p className="mt-1 text-xs text-muted">
                  on <Link to={`/stories/${c.story.slug}#comment-${c.id}`} className="text-brand hover:underline">{c.story.title}</Link> · {timeAgo(c.created_at)} ago
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" title={c.is_hidden ? 'Show again' : 'Hide'} onClick={() => setHidden(c, !c.is_hidden)}>
                  {c.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button type="button" className="rounded-lg p-2 text-muted hover:bg-rose-500/10 hover:text-rose-400" title="Delete" onClick={() => remove(c)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
