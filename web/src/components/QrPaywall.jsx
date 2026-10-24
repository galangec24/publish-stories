import { Building2, CheckCircle2, Clock, Copy, Download, ImagePlus, KeyRound, Lock, QrCode, ShieldCheck, TriangleAlert, Wallet, Wifi, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '../lib/api'
import { withAmount } from '../lib/qrph'
import { useAsync } from '../lib/useAsync'
import { Modal } from './Modal'
import { useToast } from './ui'

const peso = (n) => `₱${Number(n).toFixed(2)}`
const EWALLETS = ['gcash', 'maya', 'shopeepay', 'gotyme']
const isWallet = (method) => EWALLETS.includes(method.name.trim().toLowerCase())
const methodLabel = (method) => (isWallet(method) ? method.name : `Bank transfer (${method.name})`)

/** Shown at the end of the free chapters: pick GCash or a bank, then scan a QR that already has the price. */
export function QrPaywall({ story, signedIn, onUnlocked }) {
  const toast = useToast()
  const options = useAsync(() => api.get('payment-methods/'), [])
  const [open, setOpen] = useState(null) // { methodId } or { code: true }
  const [redirecting, setRedirecting] = useState(false)
  const purchase = story.purchase
  const pending = purchase?.status === 'pending'
  const free = story.free_chapters
  const list = options.data?.methods || []
  const instant = options.data?.online_checkout

  // PayMongo's page shows a QR Ph code with the amount set; its webhook unlocks the story, no approval needed.
  async function payInstantly() {
    setRedirecting(true)
    try {
      const { checkout_url, access_code } = await api.post(`subscribe/${story.id}/`)
      try {
        localStorage.setItem(`access-code:${story.slug}`, access_code)
      } catch {
        /* the device still unlocks without it */
      }
      window.location.assign(checkout_url) // same tab: pop-ups opened after a request get blocked
    } catch (e) {
      setRedirecting(false)
      toast(e, 'error')
    }
  }

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
              Unlock the whole story once. No account needed.
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
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {instant && (
                <button className="btn-primary" onClick={payInstantly} disabled={redirecting}>
                  <Zap className="h-4 w-4" /> {redirecting ? 'Opening secure payment…' : 'Instant QR Ph (unlocks right away)'}
                </button>
              )}
              {options.loading && !options.data ? (
                <button className="btn-primary" disabled>Loading payment options…</button>
              ) : list.length ? (
                list.map((m) => {
                  const Icon = isWallet(m) ? Wallet : Building2
                  return (
                    <button key={m.id} className={instant ? 'btn-ghost' : 'btn-primary'} onClick={() => setOpen({ methodId: m.id })}>
                      <Icon className="h-4 w-4" /> Pay with {methodLabel(m)}
                    </button>
                  )
                })
              ) : (
                !instant && <p className="text-sm text-muted">Payments open soon. Please check back.</p>
              )}
            </div>
            <button type="button" className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand hover:underline" onClick={() => setOpen({ code: true })}>
              <KeyRound className="h-4 w-4" /> Already paid? Enter your access code
            </button>
          </>
        )}
      </div>
      <PayModal
        open={Boolean(open)}
        start={open}
        methods={list}
        onClose={() => setOpen(null)}
        story={story}
        signedIn={signedIn}
        onDone={() => {
          setOpen(null)
          onUnlocked()
        }}
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

/**
 * The method's QR redrawn with the story price inside, so the banking app fills in the amount.
 * Falls back to the uploaded picture when the QR's contents aren't known.
 */
function useAmountQr(method, amount) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    setSrc(null)
    const payload = method?.qr_payload && withAmount(method.qr_payload, amount)
    if (!payload) return
    let live = true
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 640 }))
      .then((url) => live && setSrc(url))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [method, amount])
  return src
}

/** A picture to keep in the gallery: method, amount, story and the QR, for "upload QR" in GCash or a bank app. */
async function saveQrImage({ qr, method, story }) {
  const img = new Image()
  img.src = qr
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 960
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111827'
  ctx.textAlign = 'center'
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.fillText(method.name, 360, 80)
  ctx.font = 'bold 56px system-ui, sans-serif'
  ctx.fillStyle = '#0f766e'
  ctx.fillText(peso(story.price), 360, 150)
  ctx.drawImage(img, 60, 180, 600, 600)
  ctx.fillStyle = '#4b5563'
  ctx.font = '28px system-ui, sans-serif'
  ctx.fillText([method.account_name, method.account_number].filter(Boolean).join(' · '), 360, 830)
  ctx.font = 'italic 26px system-ui, sans-serif'
  ctx.fillText(story.title.length > 40 ? `${story.title.slice(0, 39)}…` : story.title, 360, 880)
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = `${method.name}-${Number(story.price).toFixed(0)}-pesos.png`
  link.click()
}

function PayModal({ open, start, methods, onClose, story, signedIn, onDone }) {
  const toast = useToast()
  const [methodId, setMethodId] = useState(null)
  const [form, setForm] = useState({ reference: '', payer_name: '', payer_email: '' })
  const [proof, setProof] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(null)
  const [codeOpen, setCodeOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setMethodId(start?.methodId ?? null)
    setCodeOpen(Boolean(start?.code))
  }, [open, start])

  const method = methods.find((m) => m.id === methodId) || methods[0]
  const qr = useAmountQr(open ? method : null, story.price)
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
    if (done) onDone()
    else onClose()
    setDone(null)
  }

  const codeOnly = codeOpen && !methodId && start?.code
  return (
    <Modal
      open={open}
      onClose={close}
      title={done ? 'Payment sent' : codeOnly ? 'Enter your access code' : `Unlock “${story.title}”`}
      subtitle={
        done
          ? 'We’ll unlock it as soon as the author confirms it.'
          : codeOnly
            ? 'The code you got after paying, e.g. ABCD-EFGH.'
            : `One-time payment of ${peso(story.price)}`
      }
      icon={done ? CheckCircle2 : codeOnly ? KeyRound : QrCode}
      size={codeOnly ? 'max-w-md' : 'max-w-2xl'}
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
      ) : codeOnly ? (
        <ClaimCode onClaimed={onDone} />
      ) : !method ? (
        <p className="py-6 text-center text-sm text-muted">Payments open soon. Please check back.</p>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-[minmax(0,270px)_1fr]">
            <div>
              {methods.length > 1 && (
                <div className="mb-3 flex gap-1 rounded-xl border border-line p-1">
                  {methods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethodId(m.id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition ${m.id === method.id ? 'bg-brand text-white shadow' : 'text-muted hover:text-ink'}`}
                    >
                      {isWallet(m) ? <Wallet className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                      {isWallet(m) ? m.name : 'Bank transfer'}
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-2xl bg-white p-2 text-center shadow-lg">
                {method.qr_payload ? (
                  qr ? <img src={qr} alt={`${method.name} QR for ${peso(story.price)}`} className="mx-auto w-full max-w-64" /> : <div className="mx-auto aspect-square w-full max-w-64 animate-pulse rounded-xl bg-gray-200" />
                ) : (
                  <img src={method.qr_url} alt={`${method.name} QR code`} className="mx-auto max-h-80 w-full rounded-xl object-contain" />
                )}
                <p className="pb-1 text-sm font-semibold text-gray-800">
                  {method.name} · <span className="text-teal-700">{peso(story.price)}</span>
                </p>
              </div>
              {qr ? (
                <button type="button" onClick={() => saveQrImage({ qr, method, story })} className="btn-ghost mt-2 w-full !py-1.5 text-sm">
                  <Download className="h-4 w-4" /> Save QR to your phone
                </button>
              ) : (
                <a href={method.qr_url} download={`${method.name}-QR`} target="_blank" rel="noreferrer" className="btn-ghost mt-2 w-full !py-1.5 text-sm">
                  <Download className="h-4 w-4" /> Save QR to your phone
                </a>
              )}
              {(method.account_name || method.account_number) && (
                <p className="mt-2 text-center text-xs text-muted">
                  Pays {[method.account_name, method.account_number].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            <form onSubmit={submit} className="space-y-4">
              <ol className="space-y-2 text-sm">
                <li>
                  <b>1.</b> Scan with {isWallet(method) ? method.name : 'your bank app'} or any app that pays InstaPay QR. On this phone? Save the QR, then
                  upload it in the app&apos;s scanner.
                </li>
                <li>
                  <b>2.</b>{' '}
                  {method.qr_payload ? (
                    <>The amount <b className="text-accent">{peso(story.price)}</b> fills in by itself. Just confirm the payment.</>
                  ) : (
                    <>Send exactly <b className="text-accent">{peso(story.price)}</b>.</>
                  )}
                </li>
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
            </form>
          </div>

          <div className="mt-6 border-t border-line/70 pt-4">
            {codeOpen ? (
              <ClaimCode onClaimed={onDone} />
            ) : (
              <button type="button" className="flex items-center gap-2 text-sm text-brand hover:underline" onClick={() => setCodeOpen(true)}>
                <KeyRound className="h-4 w-4" /> Already paid on another device? Enter your access code
              </button>
            )}
          </div>
        </>
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
