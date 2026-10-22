import { BookOpen, Clock3, Eye, Mail, ShoppingCart, UserRoundX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import { useAsync } from '../../lib/useAsync'
import { onLiveEvent } from '../../realtime/LiveProvider'

/** Who read a paid story but hasn't paid, and checkouts still pending. Updates live. */
export function ReadersMonitor() {
  const [tab, setTab] = useState('unpaid')
  const [story, setStory] = useState('')
  const stories = useAsync(() => api.get('admin/stories/', { status: 'published' }), [])
  const unpaid = useAsync(() => api.get('admin/payments/unpaid-readers/', { story }), [story])
  const pending = useAsync(() => api.get('admin/payments/pending/'), [])

  useEffect(
    () =>
      onLiveEvent('payments.changed', () => {
        unpaid.reload()
        pending.reload()
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const paidStories = (stories.data?.results || []).filter((s) => !s.is_free)

  return (
    <div>
      <h1 className="font-display text-3xl">Readers &amp; payments</h1>
      <p className="mt-1 text-sm text-muted">Find readers to follow up with. This page updates as payments come in.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat icon={UserRoundX} label="Read but not paid" value={unpaid.data?.count} tone="text-rose-400" />
        <Stat icon={ShoppingCart} label="Pending checkouts" value={pending.data?.count} tone="text-amber-500" />
        <Stat icon={Eye} label="Guest readers (not signed in)" value={unpaid.data?.guest_readers} tone="text-sky-400" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {[
          ['unpaid', 'Read but not paid', UserRoundX],
          ['pending', 'Pending checkouts', ShoppingCart],
        ].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`chip ${tab === id ? 'border-brand bg-brand/15' : 'border-line'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
        {tab === 'unpaid' && (
          <select className="input ml-auto !w-auto !py-2" value={story} onChange={(e) => setStory(e.target.value)}>
            <option value="">All paid stories</option>
            {paidStories.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        )}
      </div>

      {tab === 'unpaid' &&
        (unpaid.loading && !unpaid.data ? (
          <Spinner />
        ) : !unpaid.data?.results.length ? (
          <Empty text="No signed-in readers are waiting to pay." />
        ) : (
          <Table head={['Reader', 'Story', 'Read on', 'Last read', 'Checkout']}>
            {unpaid.data.results.map((r) => (
              <tr key={`${r.user.id}-${r.story.id}`} className="border-t border-line/60">
                <td className="p-3">
                  <p className="font-medium">{r.user.first_name}</p>
                  <a href={`mailto:${r.user.email}`} className="flex items-center gap-1 text-xs text-brand hover:underline">
                    <Mail className="h-3 w-3" /> {r.user.email}
                  </a>
                </td>
                <td className="p-3">
                  <Link to={`/stories/${r.story.slug}`} className="flex items-center gap-1.5 hover:text-accent">
                    <BookOpen className="h-4 w-4 shrink-0" /> {r.story.title}
                  </Link>
                  <span className="text-xs text-muted">₱{Number(r.price).toFixed(2)}</span>
                </td>
                <td className="p-3 text-sm">{r.days_read} day{r.days_read === 1 ? '' : 's'}</td>
                <td className="p-3 text-sm text-muted">{timeAgo(r.last_read)} ago</td>
                <td className="p-3">
                  {r.checkout_started ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">
                      <Clock3 className="h-3 w-3" /> Started
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Not started</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ))}

      {tab === 'pending' &&
        (pending.loading && !pending.data ? (
          <Spinner />
        ) : !pending.data?.results.length ? (
          <Empty text="No pending checkouts." />
        ) : (
          <Table head={['Reader', 'Story', 'Amount', 'Started']}>
            {pending.data.results.map((p) => (
              <tr key={p.id} className="border-t border-line/60">
                <td className="p-3">
                  <p className="font-medium">{p.user.first_name}</p>
                  <a href={`mailto:${p.user.email}`} className="text-xs text-brand hover:underline">{p.user.email}</a>
                </td>
                <td className="p-3">{p.story.title}</td>
                <td className="p-3 text-sm">₱{Number(p.amount).toFixed(2)}</td>
                <td className="p-3 text-sm text-muted">{timeAgo(p.created_at)} ago</td>
              </tr>
            ))}
          </Table>
        ))}
    </div>
  )
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="card p-4">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-2 font-display text-3xl">{value ?? '–'}</p>
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
    </div>
  )
}

function Table({ head, children }) {
  return (
    <div className="card mt-4 overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-left">
        <thead className="bg-surface-2/60 text-xs tracking-wide text-muted uppercase">
          <tr>{head.map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Empty({ text }) {
  return <p className="py-16 text-center text-muted">{text}</p>
}
