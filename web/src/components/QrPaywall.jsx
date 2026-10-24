import { Building2, CheckCircle2, Copy, Download, ImagePlus, KeyRound, Lock, ReceiptText, ShieldCheck, TriangleAlert, Wallet, Wifi, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../lib/api'
import { parseQrPh, readQrFromFile, withAmount } from '../lib/qrph'
import { useAsync } from '../lib/useAsync'
import { Modal } from './Modal'
import { useToast } from './ui'

const peso = (n) => `₱${Number(n).toFixed(2)}`
const EWALLETS = ['gcash', 'maya', 'shopeepay', 'gotyme']
const isWallet = (method) => EWALLETS.includes(method.name.trim().toLowerCase())
const tabLabel = (method) => (isWallet(method) ? method.name : 'Bank transfer')

/**
 * End of the free chapters: the QR is right here (GCash / bank tabs) with the price already in it.
 * After paying, "I've paid" asks for the reference number and the story opens immediately;
 * the author checks the transfer later and can revoke it if the money never arrived.
 */
export function QrPaywall({ story, signedIn, onUnlocked }) {
  const toast = useToast()
  const options = useAsync(() => api.get('payment-methods/'), [])
  const [methodId, setMethodId] = useState(null)
  const [dialog, setDialog] = useState(null) // 'paid' | 'code'
  const [redirecting, setRedirecting] = useState(false)
  const purchase = story.purchase
  const free = story.free_chapters
  const list = options.data?.methods || []
  const instant = options.data?.online_checkout
  const method = list.find((m) => m.id === methodId) || list[0]
  const qr = useAmountQr(method, story.price)

  // PayMongo's page shows a QR Ph code with the amount set; its webhook unlocks the story.
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
      <div className="rounded-2xl border border-line bg-surface p-5 text-center">
        <p className="flex items-center justify-center gap-2 font-display text-xl">
          <Lock className="h-5 w-5 text-accent" /> Keep reading for {peso(story.price)}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
          {free > 0 ? `The first ${free === 1 ? 'chapter is' : `${free} chapters are`} free. ` : ''}
          Scan to pay once and the whole story opens. No account needed.
        </p>
        {purchase?.status === 'rejected' && (
          <p className="mx-auto mt-3 flex max-w-sm items-start gap-2 rounded-xl bg-rose-500/10 p-3 text-left text-xs text-rose-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Your payment (ref {purchase.reference_number}) wasn&apos;t received, so the story was locked again.
              {purchase.admin_note ? ` “${purchase.admin_note}”` : ''}
            </span>
          </p>
        )}

        {options.loading && !options.data ? (
          <div className="mx-auto mt-4 aspect-square w-52 animate-pulse rounded-2xl bg-surface-2" />
        ) : method ? (
          <>
            {list.length > 1 && (
              <div className="mx-auto mt-4 flex max-w-xs gap-1 rounded-xl border border-line p-1">
                {list.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethodId(m.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium whitespace-nowrap transition ${m.id === method.id ? 'bg-brand text-white shadow' : 'text-muted hover:text-ink'}`}
                  >
                    {isWallet(m) ? <Wallet className="h-4 w-4 shrink-0" /> : <Building2 className="h-4 w-4 shrink-0" />}
                    {tabLabel(m)}
                  </button>
                ))}
              </div>
            )}
            <div className="mx-auto mt-3 w-56 rounded-2xl bg-white p-2 shadow-lg">
              {qr ? (
                <img src={qr} alt={`${method.name} QR for ${peso(story.price)}`} className="w-full" />
              ) : qr === null ? (
                <img src={method.qr_url} alt={`${method.name} QR code`} className="max-h-72 w-full rounded-xl object-contain" />
              ) : (
                <div className="aspect-square w-full animate-pulse rounded-xl bg-gray-200" />
              )}
              <p className="pb-1 text-sm font-semibold text-gray-800">
                {method.name} · <span className="text-teal-700">{peso(story.price)}</span>
              </p>
            </div>
            {(method.account_name || method.account_number) && (
              <p className="mt-2 text-xs text-muted">Pays {[method.account_name, method.account_number].filter(Boolean).join(' · ')}</p>
            )}
            <ol className="mx-auto mt-4 max-w-sm space-y-2 text-left text-sm">
              {[
                <>Scan this QR with GCash or any bank app. Paying on this phone? Tap <b>Save QR</b>, then upload it in your app&apos;s QR scanner.</>,
                <>
                  Pay <b className="text-accent">{peso(story.price)}</b>.
                  {qr ? ` Your app may show it greyed out; if so, type ${Number(story.price)}.` : ''}
                </>,
                <>Take a <b>screenshot</b> of the receipt (it shows the amount and reference number).</>,
                <>Tap <b>I&apos;ve paid</b>, attach the screenshot and type the reference number. The story opens right away.</>,
              ].map((text, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">{i + 1}</span>
                  <span className="text-muted">{text}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" onClick={() => setDialog('paid')}>
                <ReceiptText className="h-4 w-4" /> I&apos;ve paid
              </button>
              <button type="button" className="btn-ghost" onClick={() => saveQrImage({ qr, method, story })}>
                <Download className="h-4 w-4" /> Save QR
              </button>
            </div>
            <p className="mx-auto mt-2 max-w-sm text-[11px] text-muted">
              The author checks every receipt. If the payment can&apos;t be found, access is removed.
            </p>
          </>
        ) : (
          !instant && <p className="mt-4 text-sm text-muted">Payments open soon. Please check back.</p>
        )}

        {instant && (
          <button className="btn-ghost mt-3" onClick={payInstantly} disabled={redirecting}>
            <Zap className="h-4 w-4" /> {redirecting ? 'Opening secure payment…' : 'Instant QR Ph checkout'}
          </button>
        )}
        <button type="button" className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm text-brand hover:underline" onClick={() => setDialog('code')}>
          <KeyRound className="h-4 w-4" /> Paid on another device? Enter your access code
        </button>
        <Link to="/purchases" className="mt-1 block text-xs text-muted hover:text-brand hover:underline">
          Check my payments
        </Link>
      </div>

      <PaidDialog
        open={dialog === 'paid'}
        method={method}
        story={story}
        signedIn={signedIn}
        onClose={() => setDialog(null)}
        onUnlocked={() => {
          setDialog(null)
          onUnlocked()
        }}
      />
      <Modal open={dialog === 'code'} onClose={() => setDialog(null)} title="Enter your access code" subtitle="The code you got after paying, e.g. ABCD-EFGH." icon={KeyRound} size="max-w-md">
        <ClaimCode
          onClaimed={() => {
            setDialog(null)
            onUnlocked()
          }}
        />
      </Modal>
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

/**
 * The method's QR redrawn with the story price inside, so the banking app fills in the amount.
 * Uses the saved QR contents, or reads the uploaded picture if they weren't saved.
 * undefined while working, null when only the original picture can be shown.
 */
function useAmountQr(method, amount) {
  const [src, setSrc] = useState(undefined)
  useEffect(() => {
    if (!method) return
    let live = true
    setSrc(undefined)
    const payload = method.qr_payload
      ? Promise.resolve(method.qr_payload)
      : fetch(method.qr_url)
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
          .then(readQrFromFile)
          .then((text) => (parseQrPh(text)?.valid ? text : null))
    payload
      .then((text) => {
        const withPrice = text && withAmount(text, amount)
        if (!withPrice) return null
        return import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(withPrice, { errorCorrectionLevel: 'M', margin: 2, width: 640 }))
      })
      .then((url) => live && setSrc(url || null))
      .catch(() => live && setSrc(null))
    return () => {
      live = false
    }
  }, [method, amount])
  return src
}

/** A picture to keep in the gallery: method, amount, story and the QR, for "upload QR" in GCash or a bank app. */
async function saveQrImage({ qr, method, story }) {
  if (!qr) {
    window.open(method.qr_url, '_blank', 'noopener')
    return
  }
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

/** "I've paid": the reference number unlocks the story right away. */
function PaidDialog({ open, method, story, signedIn, onClose, onUnlocked }) {
  const toast = useToast()
  const [form, setForm] = useState({ reference: '', payer_name: '', payer_email: '' })
  const [proof, setProof] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(null)
  const [preview, setPreview] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  useEffect(() => {
    if (!proof) return setPreview(null)
    const url = URL.createObjectURL(proof)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [proof])

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
    if (done) onUnlocked()
    else onClose()
    setDone(null)
  }

  if (!method) return null
  return (
    <Modal
      open={open}
      onClose={close}
      title={done ? 'Unlocked! Enjoy the story' : 'Almost there'}
      subtitle={done ? 'Thank you for supporting the author.' : `${peso(story.price)} via ${method.name}: send your receipt`}
      icon={done ? CheckCircle2 : ReceiptText}
    >
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted">Save this access code. It opens the story on any other phone or computer, even without an account.</p>
          <CodeBox code={done.access_code} />
          <p className="mx-auto flex max-w-sm gap-2 text-left text-xs text-muted">
            <Wifi className="h-4 w-4 shrink-0 text-brand" /> Other devices on this same Wi-Fi open it automatically too.
          </p>
          <button className="btn-primary" onClick={close}>Start reading</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block cursor-pointer">
            <span className="text-sm font-medium">1. Screenshot of your payment receipt</span>
            <span className={`mt-1 flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm hover:border-brand ${errors.proof ? 'border-rose-400' : 'border-line'}`}>
              {preview ? (
                <img src={preview} alt="Receipt" className="h-20 w-14 rounded-md object-cover" />
              ) : (
                <ImagePlus className="h-6 w-6 text-brand" />
              )}
              <span className="min-w-0 flex-1">
                {proof ? <span className="block truncate">{proof.name}</span> : 'Choose the screenshot that shows the amount and reference number'}
                {proof && <span className="block text-xs text-brand">Tap to change</span>}
              </span>
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setProof(e.target.files[0] || null)} />
            {errors.proof && <span className="mt-1 block text-xs text-rose-400">{errors.proof[0]}</span>}
          </label>
          <label className="block">
            <span className="text-sm font-medium">2. Reference number from the receipt</span>
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
          {errors.method && <span className="block text-xs text-rose-400">{errors.method[0]}</span>}
          <button className="btn-primary w-full" disabled={busy || !form.reference.trim() || !proof}>
            {busy ? 'Unlocking…' : 'Unlock the story'}
          </button>
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {signedIn
              ? 'It opens on your account right away. The author checks your receipt against the payments received; if it isn’t found, access is removed.'
              : 'No account needed: it opens right away on this device and others on the same Wi-Fi. The author checks your receipt against the payments received; if it isn’t found, access is removed.'}
          </p>
        </form>
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
