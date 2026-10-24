import { CheckCircle2, Clock, Copy, KeyRound, ReceiptText, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'

const STATE = {
  success: [CheckCircle2, 'bg-emerald-500/15 text-emerald-400', 'Successful'],
  pending: [Clock, 'bg-amber-500/15 text-amber-400', 'In progress'],
  failed: [XCircle, 'bg-rose-500/15 text-rose-400', 'Failed'],
}

/** A reader's payments and whether each went through. Guests see the ones made on this device. */
export function Purchases() {
  const { user } = useAuth()
  const toast = useToast()
  const purchases = useAsync(() => api.get('my-purchases/').then((d) => d.results), [user?.id])

  return (
    <div className="mx-auto max-w-2xl pt-8">
      <h1 className="flex items-center gap-2 font-display text-3xl">
        <ReceiptText className="h-7 w-7 text-brand" /> My purchases
      </h1>
      <p className="mt-1 text-sm text-muted">
        {user
          ? 'Every story you paid for with this account, and whether the payment went through.'
          : 'Payments made on this device. Sign in to see the ones made with your account on other devices.'}
      </p>

      {purchases.loading && !purchases.data ? (
        <Spinner />
      ) : !purchases.data?.length ? (
        <div className="card mt-6 p-8 text-center text-sm text-muted">
          <ReceiptText className="mx-auto mb-2 h-8 w-8 opacity-50" />
          No payments yet.{' '}
          <Link to="/" className="text-brand hover:underline">
            Find a story to read
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {purchases.data.map((p) => {
            const [Icon, tone, label] = STATE[p.state] || STATE.failed
            return (
              <div key={p.id} className="card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/stories/${p.story.slug}`} className="font-semibold hover:text-brand">
                      {p.story.title}
                    </Link>
                    <p className="text-sm text-muted">
                      ₱{Number(p.amount).toFixed(2)} via {p.method}
                      {p.reference_number && <> · ref <span className="font-mono">{p.reference_number}</span></>}
                      {' · '}
                      {new Date(p.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-sm">{p.message}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
                </div>
                {p.access_code && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(p.access_code).then(() => toast('Access code copied'))}
                    className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-sm"
                    title="Use it to open the story on another device"
                  >
                    <KeyRound className="h-4 w-4 text-brand" /> Access code <span className="font-mono tracking-widest">{p.access_code}</span>
                    <Copy className="h-3.5 w-3.5 opacity-60" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
