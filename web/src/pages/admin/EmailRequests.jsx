import { ArrowRight, Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Spinner, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import { useAsync } from '../../lib/useAsync'
import { onLiveEvent } from '../../realtime/LiveProvider'

const BADGE = {
  pending: 'bg-amber-500/15 text-amber-500',
  approved: 'bg-sky-500/15 text-sky-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  denied: 'bg-rose-500/15 text-rose-400',
  cancelled: 'bg-surface-2 text-muted',
}

/** Approve or decline readers' email change requests. */
export function EmailRequests() {
  const toast = useToast()
  const [status, setStatus] = useState('pending')
  const list = useAsync(() => api.get('admin/email-requests/', { status }), [status])

  useEffect(() => onLiveEvent('email_request', () => list.reload()), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(req, decision) {
    const note = window.prompt(
      decision === 'approve' ? 'Optional note to the reader:' : 'Reason for declining (shown to the reader):',
      '',
    )
    if (note === null) return
    try {
      await api.post(`admin/email-requests/${req.id}/decide/`, { decision, note })
      toast(decision === 'approve' ? 'Approved. The reader can now confirm the new email.' : 'Request declined.')
      list.reload()
    } catch (e) {
      toast(e, 'error')
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl">Email change requests</h1>
      <p className="mt-1 text-sm text-muted">
        Readers can&apos;t change their email on their own. After you approve, they confirm the new address with a code.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {['pending', 'approved', 'completed', 'denied', ''].map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)} className={`chip capitalize ${status === s ? 'border-brand bg-brand/15' : 'border-line'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : !list.data?.results.length ? (
        <p className="py-16 text-center text-muted">Nothing here.</p>
      ) : (
        <div className="card mt-5 divide-y divide-line p-0">
          {list.data.results.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.user.first_name} {r.user.last_name}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs capitalize ${BADGE[r.status]}`}>{r.status}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-muted">{r.old_email}</span>
                  <ArrowRight className="h-4 w-4 text-muted" />
                  <span className="font-semibold">{r.new_email}</span>
                </p>
                {r.reason && <p className="mt-1 text-sm text-muted">“{r.reason}”</p>}
                <p className="mt-1 text-xs text-muted">Requested {timeAgo(r.created_at)} ago</p>
              </div>
              {r.status === 'pending' && (
                <div className="flex gap-2">
                  <button className="btn-ghost !py-1.5" onClick={() => decide(r, 'deny')}>
                    <X className="h-4 w-4" /> Decline
                  </button>
                  <button className="btn-primary !py-1.5" onClick={() => decide(r, 'approve')}>
                    <Check className="h-4 w-4" /> Approve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
