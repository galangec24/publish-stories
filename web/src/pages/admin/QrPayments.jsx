import { Check, Eye, EyeOff, ImagePlus, MonitorSmartphone, Pencil, Plus, QrCode, ReceiptText, Trash2, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Modal } from '../../components/Modal'
import { Spinner, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import { useAsync } from '../../lib/useAsync'
import { onLiveEvent } from '../../realtime/LiveProvider'

const peso = (n) => `₱${Number(n).toFixed(2)}`
const STATUS = {
  pending: 'bg-amber-500/15 text-amber-400',
  paid: 'bg-emerald-500/15 text-emerald-400',
  rejected: 'bg-rose-500/15 text-rose-400',
}

/** Receipt screenshot, fetched with the admin's login (it is never public). */
function Proof({ id }) {
  const [src, setSrc] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let url
    api.blobUrl(`admin/payments/manual/${id}/proof/`).then((u) => setSrc((url = u))).catch(() => {})
    return () => url && URL.revokeObjectURL(url)
  }, [id])
  if (!src) return <div className="h-24 w-16 animate-pulse rounded-lg bg-surface-2" />
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="View receipt">
        <img src={src} alt="Receipt" className="h-24 w-16 rounded-lg border border-line object-cover" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Receipt screenshot" icon={ReceiptText}>
        <img src={src} alt="Receipt" className="mx-auto max-h-[70vh] rounded-xl" />
      </Modal>
    </>
  )
}

/** Payments readers sent by scanning a QR. Check your GCash / bank app, then approve or reject. */
export function QrPayments() {
  const toast = useToast()
  const [status, setStatus] = useState('pending')
  const list = useAsync(() => api.get('admin/payments/manual/', { status }), [status])
  const [busy, setBusy] = useState(null)

  useEffect(() => onLiveEvent('payments.changed', () => list.reload()), [list.reload]) // eslint-disable-line react-hooks/exhaustive-deps

  async function review(p, decision) {
    let note = ''
    if (decision === 'reject') {
      note = window.prompt('Reason shown to the reader (optional):', 'We could not find this transfer. Please check the reference number.')
      if (note === null) return
    } else if (!window.confirm(`Approve ${peso(p.amount)} from ${p.user?.first_name || p.payer_name || 'this guest'} (ref ${p.reference_number})?\nOnly approve if it arrived in your ${p.method_name}.`)) {
      return
    }
    setBusy(p.id)
    try {
      await api.post(`admin/payments/manual/${p.id}/${decision}/`, { note })
      toast(decision === 'approve' ? 'Approved. The reader can read the full story now.' : 'Marked as not received.')
      list.reload()
    } catch (e) {
      toast(e, 'error')
    } finally {
      setBusy(null)
    }
  }

  const rows = list.data?.results || []
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-display text-3xl">QR payments</h1>
        <Link to="/admin/payment-methods" className="btn-ghost">
          <QrCode className="h-4 w-4" /> Your QR codes
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Open your GCash or bank app, find the transfer by its reference number and amount, then approve it here.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          ['pending', `To check${list.data ? ` (${list.data.pending_count})` : ''}`],
          ['paid', 'Approved'],
          ['rejected', 'Rejected'],
          ['all', 'All'],
        ].map(([value, label]) => (
          <button key={value} onClick={() => setStatus(value)} className={`chip ${status === value ? 'border-brand bg-brand/15' : 'border-line'}`}>
            {label}
          </button>
        ))}
      </div>

      {list.loading && !list.data ? (
        <Spinner />
      ) : !rows.length ? (
        <p className="py-16 text-center text-muted">{status === 'pending' ? 'Nothing to check right now.' : 'No payments here yet.'}</p>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map((p) => (
            <div key={p.id} className="card flex flex-wrap items-start gap-4 p-4">
              {p.has_proof ? <Proof id={p.id} /> : <div className="grid h-24 w-16 place-items-center rounded-lg border border-dashed border-line text-[10px] text-muted">No receipt</div>}
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl">{peso(p.amount)}</span>
                  <span className="text-muted">via {p.method_name || 'QR'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[p.status] || 'bg-surface-2 text-muted'}`}>{p.status}</span>
                </p>
                <p>
                  Ref <span className="font-mono font-semibold">{p.reference_number}</span> ·{' '}
                  <Link to={`/stories/${p.story_slug}`} className="text-brand hover:underline">{p.story_title}</Link>
                </p>
                <p className="flex items-center gap-1.5 text-muted">
                  <UserRound className="h-3.5 w-3.5" />
                  {p.user ? `${p.user.first_name} · ${p.user.email}` : `Guest${p.payer_name ? `: ${p.payer_name}` : ''}${p.payer_email ? ` · ${p.payer_email}` : ''}`}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <MonitorSmartphone className="h-3.5 w-3.5" /> {p.devices} device{p.devices === 1 ? '' : 's'} · code{' '}
                  <span className="font-mono">{p.access_code}</span> · sent {timeAgo(p.created_at)}
                  {p.reviewed_by && ` · reviewed by ${p.reviewed_by}`}
                </p>
                {p.admin_note && <p className="text-xs text-muted">Note: {p.admin_note}</p>}
              </div>
              <div className="flex gap-2">
                {p.status !== 'paid' && (
                  <button className="btn-primary !py-2" disabled={busy === p.id} onClick={() => review(p, 'approve')}>
                    <Check className="h-4 w-4" /> Approve
                  </button>
                )}
                {p.status !== 'rejected' && (
                  <button className="btn-ghost !py-2" disabled={busy === p.id} onClick={() => review(p, 'reject')}>
                    <X className="h-4 w-4" /> {p.status === 'paid' ? 'Revoke' : 'Not received'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const EMPTY = { name: '', account_name: '', account_number: '', qr_url: '', instructions: '', is_active: true, sort_order: 0 }

/** The QR codes readers scan (GCash, bank InstaPay, ...). */
export function PaymentMethods() {
  const toast = useToast()
  const methods = useAsync(() => api.get('admin/payment-methods/'), [])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function uploadQr(file) {
    const data = new FormData()
    data.append('image', file)
    setBusy(true)
    try {
      const { url } = await api.upload('admin/images/', data)
      setForm((f) => ({ ...f, qr_url: url }))
    } catch (e) {
      toast(e, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      if (form.id) await api.patch(`admin/payment-methods/${form.id}/`, form)
      else await api.post('admin/payment-methods/', form)
      setForm(null)
      methods.reload()
      toast('Saved. Readers see this QR when they unlock a story.')
    } catch (err) {
      toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(m) {
    await api.patch(`admin/payment-methods/${m.id}/`, { is_active: !m.is_active }).catch((e) => toast(e, 'error'))
    methods.reload()
  }

  async function remove(m) {
    if (!window.confirm(`Delete the ${m.name} QR? Past payments keep their records.`)) return
    await api.delete(`admin/payment-methods/${m.id}/`).catch((e) => toast(e, 'error'))
    methods.reload()
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-display text-3xl">Your QR codes</h1>
        <button className="btn-primary" onClick={() => setForm({ ...EMPTY, sort_order: methods.data?.length || 0 })}>
          <Plus className="h-4 w-4" /> Add QR code
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Upload the QR from your GCash (Receive → QR) or bank app. Readers scan it, pay, then send you the reference number to check.
      </p>

      {methods.loading && !methods.data ? (
        <Spinner />
      ) : !methods.data?.length ? (
        <p className="py-16 text-center text-muted">No QR codes yet. Add your GCash or bank QR so readers can pay.</p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {methods.data.map((m) => (
            <div key={m.id} className={`card overflow-hidden p-0 ${m.is_active ? '' : 'opacity-60'}`}>
              <div className="bg-white p-3">
                <img src={m.qr_url} alt={`${m.name} QR`} className="mx-auto h-56 object-contain" />
              </div>
              <div className="flex items-center gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.name} {!m.is_active && <span className="text-xs text-muted">(hidden)</span>}</p>
                  <p className="truncate text-xs text-muted">{[m.account_name, m.account_number].filter(Boolean).join(' · ')}</p>
                </div>
                <button className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" title={m.is_active ? 'Hide from readers' : 'Show to readers'} onClick={() => toggle(m)}>
                  {m.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" title="Edit" onClick={() => setForm(m)}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-rose-400" title="Delete" onClick={() => remove(m)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.name}` : 'Add a QR code'} icon={QrCode}>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line p-4 text-sm hover:border-brand">
              {form.qr_url ? (
                <img src={form.qr_url} alt="" className="h-48 rounded-lg bg-white object-contain p-1" />
              ) : (
                <ImagePlus className="h-8 w-8 text-brand" />
              )}
              <span className="text-muted">{busy ? 'Uploading…' : form.qr_url ? 'Change image' : 'Upload the QR image'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadQr(e.target.files[0])} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Name</span>
                <input className="input mt-1" required maxLength={60} value={form.name} onChange={set('name')} placeholder="GCash" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Account name</span>
                <input className="input mt-1" maxLength={120} value={form.account_name} onChange={set('account_name')} placeholder="MA**A GE***A G." />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Account / mobile number <span className="text-muted">(shown to readers; mask it if you like)</span></span>
              <input className="input mt-1" maxLength={60} value={form.account_number} onChange={set('account_number')} placeholder="0917 727 ••••" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Extra instructions <span className="text-muted">(optional)</span></span>
              <textarea className="input mt-1 min-h-20" value={form.instructions} onChange={set('instructions')} placeholder="InstaPay QR: works with any bank or e-wallet. Transfer fees may apply." />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Show to readers
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy || !form.qr_url || !form.name.trim()}>Save</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
