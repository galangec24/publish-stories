import { CheckCircle2, Clock3, KeyRound, Lock, Mail, Save, ShieldCheck, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { Avatar } from '../components/HeaderMenus'
import { Field, Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fullName } from '../lib/time'
import { onLiveEvent } from '../realtime/LiveProvider'

export function Profile() {
  const { user, ready } = useAuth()
  if (!ready) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: '/profile' }} />
  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-10">
      <div className="card flex items-center gap-4 p-6">
        <Avatar user={user} size="h-20 w-20" text="text-3xl" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl">{fullName(user)}</h1>
          <p className="flex items-center gap-1.5 truncate text-sm text-muted">
            <Mail className="h-4 w-4" /> {user.email}
          </p>
        </div>
      </div>
      <ProfileForm />
      <EmailSection />
    </div>
  )
}

function ProfileForm() {
  const { user, updateProfile } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    display_name: user.display_name || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await updateProfile(form)
      toast('Profile saved.')
    } catch (err) {
      toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-6">
      <h2 className="font-semibold">Personal details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <input className="input" value={form.first_name} maxLength={60} onChange={set('first_name')} autoComplete="given-name" />
        </Field>
        <Field label="Last name">
          <input className="input" value={form.last_name} maxLength={60} onChange={set('last_name')} autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Display name" hint="Shown on your profile and comments.">
        <input className="input" value={form.display_name} maxLength={120} onChange={set('display_name')} autoComplete="nickname" />
      </Field>
      <Field label="Email">
        <div className="input flex items-center gap-2 !bg-surface-2 text-muted">
          <Lock className="h-4 w-4 shrink-0" />
          <span className="truncate">{user.email}</span>
        </div>
      </Field>
      <button className="btn-primary" disabled={busy}>
        <Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}

/**
 * Email can't be edited directly. The reader asks, an admin approves, then the
 * reader confirms a code sent to the new address and keeps or changes their password.
 */
function EmailSection() {
  const { user, acceptTokens } = useAuth()
  const toast = useToast()
  const [req, setReq] = useState(undefined)
  const [form, setForm] = useState({ new_email: '', reason: '' })
  const [code, setCode] = useState('')
  const [choice, setChoice] = useState('keep')
  const [newPassword, setNewPassword] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => api.get('user/email-change/').then(setReq).catch(() => setReq(null))
  useEffect(() => {
    load()
    // Admin decisions arrive as notifications; refresh the card live.
    return onLiveEvent('notification', (n) => n.kind?.startsWith('email_') && load())
  }, [])

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  const open = req && (req.status === 'pending' || (req.status === 'approved' && !req.approval_expired))

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-brand" /> Change email
        </h2>
        <p className="mt-1 text-sm text-muted">
          For your security, email changes need approval from an admin. After approval we&apos;ll send a code to the new
          address.
        </p>
      </div>

      {req === undefined && <Spinner className="!py-4" />}

      {req?.status === 'pending' && (
        <Status icon={Clock3} tone="amber" title="Waiting for admin approval">
          {req.old_email} &rarr; <strong>{req.new_email}</strong>
          <button className="mt-3 block text-sm text-rose-400 hover:underline" disabled={busy} onClick={() => run(async () => { await api.delete('user/email-change/'); await load() })}>
            Cancel request
          </button>
        </Status>
      )}

      {req?.status === 'approved' && !req.approval_expired && (
        <div className="space-y-4">
          <Status icon={CheckCircle2} tone="emerald" title="Approved! Confirm your new email">
            We&apos;ll send a 6-digit code to <strong>{req.new_email}</strong>.
            {req.admin_note && <span className="mt-1 block">Note from admin: {req.admin_note}</span>}
          </Status>
          {!codeSent ? (
            <button className="btn-primary" disabled={busy} onClick={() => run(async () => { await api.post('user/email-change/send-code/'); setCodeSent(true); toast(`Code sent to ${req.new_email}`) })}>
              <Mail className="h-4 w-4" /> Send code to new email
            </button>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  const tokens = await api.post('user/email-change/confirm/', {
                    code,
                    password_choice: choice,
                    ...(choice === 'change' && { new_password: newPassword }),
                  })
                  acceptTokens(tokens)
                  toast(`Your email is now ${tokens.user.email}.`)
                  setCodeSent(false)
                  await load()
                })
              }}
            >
              <Field label="6-digit code">
                <input className="input tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </Field>
              <fieldset className="space-y-2">
                <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <KeyRound className="h-4 w-4" /> Password
                </legend>
                {[
                  ['keep', 'Keep my current password'],
                  ['change', 'Set a new password'],
                ].map(([value, label]) => (
                  <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${choice === value ? 'border-brand bg-brand/10' : 'border-line'}`}>
                    <input type="radio" name="pw" value={value} checked={choice === value} onChange={() => setChoice(value)} className="accent-[var(--brand)]" />
                    {label}
                  </label>
                ))}
              </fieldset>
              {choice === 'change' && (
                <Field label="New password" hint="At least 8 characters, not all numbers.">
                  <input className="input" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </Field>
              )}
              <div className="flex gap-2">
                <button className="btn-primary" disabled={busy || code.length !== 6}>
                  <CheckCircle2 className="h-4 w-4" /> Confirm new email
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(() => api.post('user/email-change/send-code/').then(() => toast('New code sent.')))}>
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {req?.status === 'denied' && (
        <Status icon={XCircle} tone="rose" title="Your last request was declined">
          {req.admin_note || 'Contact support if you have questions.'}
        </Status>
      )}

      {req !== undefined && !open && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              setReq(await api.post('user/email-change/', form))
              setForm({ new_email: '', reason: '' })
              toast('Request sent. An admin will review it.')
            })
          }}
        >
          <Field label="New email address">
            <input className="input" type="email" required value={form.new_email} onChange={(e) => setForm({ ...form, new_email: e.target.value })} placeholder={user.email} />
          </Field>
          <Field label="Reason (optional)">
            <input className="input" maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. I no longer use my old email" />
          </Field>
          <button className="btn-ghost" disabled={busy}>
            <Mail className="h-4 w-4" /> Request email change
          </button>
        </form>
      )}
    </section>
  )
}

const TONES = {
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
}

function Status({ icon: Icon, tone, title, children }) {
  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${TONES[tone]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="text-sm text-ink">
        <p className="font-semibold">{title}</p>
        <div className="mt-1 text-muted">{children}</div>
      </div>
    </div>
  )
}
