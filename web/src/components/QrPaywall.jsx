import { CheckCircle2, Clock, Copy, Download, ImagePlus, KeyRound, Lock, QrCode, ShieldCheck, TriangleAlert, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { Modal } from './Modal'
import { useToast } from './ui'

const peso = (n) => `₱${Number(n).toFixed(2)}`

/** Shown at the end of the free chapters: a short card that opens the payment steps. */
export function QrPaywall({ story, signedIn, onUnlocked, onOnlineCheckout }) {
  const [open, setOpen] = useState(false)
  const purchase = story.purchase
  const pending = purchase?.status === 'pending'
  const free = story.free_chapters

  return (
    <div className="relative mt-6 break-inside-avoid">
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <div className={`mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl ${pending ? 'bg-amber-500/15 text-amber-400' : 'bg-accent/15 text-accent'}`}>
          {pending ? <Clock className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
        </div>
        {pending ? (
          <>
            <h3 className="font-display text-xl">Payment sent. Waiting for confirmation</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              The author checks each transfer by hand. This chapter opens by itself once it&apos;s confirmed.
            </p>
            <PendingWatcher purchase={purchase} onPaid={onUnlocked} />
          </>
        ) : (
          <>
            <h3 className="font-display text-xl">Keep reading for {peso(story.price)}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              {free > 0 ? `The first ${free === 1 ? 'chapter is' : `${free} chapters are`} free. ` : ''}
              Unlock the whole story once: scan the QR with GCash or your bank app. No account needed.
            </p>
            {purchase?.status === 'rejected' && (
              <p className="mx-auto mt-3 flex max-w-sm items-start gap-2 rounded-xl bg-rose-500/10 p-3 text-left text-sm text-rose-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Your last payment (ref {purchase.reference_number}) wasn&apos;t confirmed.
                  {purchase.admin_note ? ` “${purchase.admin_note}”` : ''} You can send it again.
                </span>
              </p>
            )}
            <button className="btn-primary mt-5" onClick={() => setOpen(true)}>
              <QrCode className="h-4 w-4" /> Unlock with QR
            </button>
          </>
        )}
      </div>
      <PayModal
        open={open}
        onClose={() => setOpen(false)}
        story={story}
        signedIn={signedIn}
        onSubmitted={() => {
          setOpen(false)
          onUnlocked()
        }}
        onOnlineCheckout={onOnlineCheckout}
      />
    </div>
  )
}

function CodeBox({ code }) {
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(code).then(() => toast('Access code copied'))}
      className="mx-auto mt-2 flex items-center gap-2 rounded-xl border border-dashed border-brand/60 bg-brand/10 px-4 py-2 font-mono text-xl tracking-[0.2em]"
      title="Copy"
    >
      {code} <Copy className="h-4 w-4 opacity-70" />
    </button>
  )
}

/** Polls the purchase while the admin reviews it. */
function PendingWatcher({ purchase, onPaid }) {
  const toast = useToast()
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const { purchase: now } = await api.get(`payments/manual/${purchase.access_code}/`)
        if (now.status !== 'pending') {
          clearInterval(timer)
          if (now.status === 'paid') toast('Payment confirmed. Enjoy the full story!')
          onPaid()
        }
      } catch {
        /* try again next tick */
      }
    }, 15000)
    return () => clearInterval(timer)
  }, [purchase.access_code, onPaid, toast])

  return (
    <div className="mx-auto mt-4 max-w-sm text-sm">
      <p className="text-muted">
        {peso(purchase.amount)} via {purchase.method_name} · ref <span className="font-mono">{purchase.reference_number}</span>
      </p>
      <p className="mt-3 text-xs text-muted">Your access code (save it to read on another phone or computer):</p>
      <CodeBox code={purchase.access_code} />
    </div>
  )
}

function PayModal({ open, onClose, story, signedIn, onSubmitted, onOnlineCheckout }) {
  const toast = useToast()
  const methods = useAsync(() => (open ? api.get('payment-methods/') : Promise.resolve(null)), [open])
  const [methodId, setMethodId] = useState(null)
  const [form, setForm] = useState({ reference: '', payer_name: '', payer_email: '' })
  const [proof, setProof] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(null)
  const [codeOpen, setCodeOpen] = useState(false)

  const list = methods.data?.methods || []
  const method = list.find((m) => m.id === methodId) || list[0]
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    const body = new FormData()
    body.append('story', story.id)
    body.append('method', method.id)
    Object.entries(form).forEach(([k, v]) => body.append(k, v.trim()))
    if (proof) body.append('proof', proof)
    try {
      const { purchase } = await api.upload('payments/manual/', body)
      setDone(purchase)
    } catch (err) {
      if (err.body && typeof err.body === 'object' && !err.body.detail) setErrors(err.body)
      else toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (done) onSubmitted()
    else onClose()
    setDone(null)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={done ? 'Payment sent' : `Unlock “${story.title}”`}
      subtitle={done ? 'We’ll unlock it as soon as the author confirms it.' : `One-time payment of ${peso(story.price)}`}
      icon={done ? CheckCircle2 : QrCode}
      size="max-w-2xl"
    >
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted">
            Keep this access code. It opens the story on any other phone or computer, even without an account.
          </p>
          <CodeBox code={done.access_code} />
          <ul className="mx-auto max-w-md space-y-2 text-left text-sm text-muted">
            <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Confirmation is done by hand, usually within the day. This page updates by itself.</li>
            <li className="flex gap-2"><Wifi className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Once confirmed, other devices on this same Wi-Fi open it automatically.</li>
          </ul>
          <button className="btn-primary" onClick={close}>Back to the story</button>
        </div>
      ) : methods.loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading payment options…</p>
      ) : !list.length ? (
        <div className="py-6 text-center text-sm text-muted">
          <p>QR payments aren&apos;t set up yet. Please check back soon.</p>
          {signedIn && methods.data?.online_checkout && (
            <button className="btn-primary mt-4" onClick={onOnlineCheckout}>Pay online with QR Ph</button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_1fr]">
          <div>
            {list.length > 1 && (
              <div className="mb-3 flex gap-1 rounded-xl border border-line p-1">
                {list.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethodId(m.id)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition ${m.id === method.id ? 'bg-brand text-white shadow' : 'text-muted hover:text-ink'}`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
            <a href={method.qr_url} target="_blank" rel="noreferrer" className="block rounded-2xl bg-white p-2 shadow-lg">
              <img src={method.qr_url} alt={`${method.name} QR code`} className="mx-auto max-h-80 w-full rounded-xl object-contain" />
            </a>
            <a href={method.qr_url} download={`${method.name}-QR`} target="_blank" rel="noreferrer" className="btn-ghost mt-2 w-full !py-1.5 text-sm">
              <Download className="h-4 w-4" /> Save QR to your phone
            </a>
            {(method.account_name || method.account_number) && (
              <p className="mt-2 text-center text-xs text-muted">
                {method.account_name}
                {method.account_name && method.account_number ? ' · ' : ''}
                {method.account_number}
              </p>
            )}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <ol className="space-y-2 text-sm">
              <li><b>1.</b> Open {method.name === 'GCash' ? 'GCash' : `${method.name} or any bank / e-wallet app`} and scan the QR (or upload the saved image).</li>
              <li><b>2.</b> Send exactly <b className="text-accent">{peso(story.price)}</b>.</li>
              <li><b>3.</b> Type the reference number from your receipt below.</li>
            </ol>
            {method.instructions && <p className="rounded-xl bg-surface-2/70 p-3 text-xs whitespace-pre-line text-muted">{method.instructions}</p>}

            <label className="block">
              <span className="text-sm font-medium">Reference number</span>
              <input className="input mt-1 font-mono" required value={form.reference} onChange={set('reference')} placeholder="e.g. 1012 345 678901" autoComplete="off" />
              {errors.reference && <span className="mt-1 block text-xs text-rose-400">{errors.reference[0]}</span>}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Your name <span className="text-muted">(optional)</span></span>
                <input className="input mt-1" value={form.payer_name} onChange={set('payer_name')} maxLength={120} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Email <span className="text-muted">(optional)</span></span>
                <input className="input mt-1" type="email" value={form.payer_email} onChange={set('payer_email')} placeholder="We'll send your code" />
                {errors.payer_email && <span className="mt-1 block text-xs text-rose-400">{errors.payer_email[0]}</span>}
              </label>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-3 text-sm hover:border-brand">
              <ImagePlus className="h-5 w-5 text-brand" />
              <span className="min-w-0 flex-1 truncate">{proof ? proof.name : 'Attach the receipt screenshot (optional, helps us confirm faster)'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setProof(e.target.files[0] || null)} />
            </label>
            {errors.proof && <span className="block text-xs text-rose-400">{errors.proof[0]}</span>}
            {errors.method && <span className="block text-xs text-rose-400">{errors.method[0]}</span>}

            <button className="btn-primary w-full" disabled={busy || !form.reference.trim()}>
              {busy ? 'Sending…' : 'I have paid'}
            </button>
            <p className="flex items-start gap-2 text-xs text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              {signedIn
                ? 'It unlocks on your account, so every device you sign in to can read it.'
                : 'No account needed: it unlocks on this device, on others using the same Wi-Fi, and anywhere you enter your access code.'}
            </p>
            {signedIn && methods.data?.online_checkout && (
              <button type="button" className="w-full text-center text-xs text-brand underline" onClick={onOnlineCheckout}>
                Or pay online with QR Ph (unlocks right away)
              </button>
            )}
          </form>
        </div>
      )}

      {!done && (
        <div className="mt-6 border-t border-line/70 pt-4">
          {codeOpen ? (
            <ClaimCode onClaimed={onSubmitted} />
          ) : (
            <button type="button" className="flex items-center gap-2 text-sm text-brand hover:underline" onClick={() => setCodeOpen(true)}>
              <KeyRound className="h-4 w-4" /> Already paid on another device? Enter your access code
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}

export function ClaimCode({ onClaimed, initial = '' }) {
  const toast = useToast()
  const [code, setCode] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function claim(e) {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('access/claim/', { code })
      toast('Unlocked on this device!')
      onClaimed()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={claim} className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <input
          className="input font-mono tracking-[0.2em] uppercase"
          placeholder="ABCD-EFGH"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={12}
          autoFocus
        />
        {error && <span className="mt-1 block text-xs text-rose-400">{error}</span>}
      </div>
      <button className="btn-primary" disabled={busy || code.replace(/[^a-z0-9]/gi, '').length !== 8}>
        <KeyRound className="h-4 w-4" /> {busy ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  )
}
