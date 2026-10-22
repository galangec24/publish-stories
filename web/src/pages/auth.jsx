import { ArrowLeft, KeyRound, LogIn, MailCheck, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Field, useToast } from '../components/ui'
import { EmailNotVerified, useAuth } from '../lib/auth'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

function AuthCard({ title, subtitle, children, back, icon: Icon }) {
  return (
    <div className="mx-auto max-w-md animate-float-up pt-12">
      {back && (
        <Link to={back.to} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="card p-7 sm:p-8">
        {Icon && (
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand/15 text-brand">
            <Icon className="h-6 w-6" />
          </span>
        )}
        <h1 className="font-display text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

/** Google Identity Services button. Its credential is an ID token the API verifies. */
function GoogleButton({ onError }) {
  const ref = useRef(null)
  const { googleLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [loaded, setLoaded] = useState(Boolean(window.google?.accounts?.id))
  // Keep the latest callbacks without re-rendering Google's button on every render.
  const handlers = useRef({})
  handlers.current = { googleLogin, navigate, from: location.state?.from, onError }

  useEffect(() => {
    if (loaded) return
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        setLoaded(true)
        clearInterval(timer)
      }
    }, 200)
    return () => clearInterval(timer)
  }, [loaded])

  useEffect(() => {
    if (!loaded || !GOOGLE_CLIENT_ID || !ref.current) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        const h = handlers.current
        try {
          await h.googleLogin(credential)
          h.navigate(h.from || '/', { replace: true })
        } catch (e) {
          h.onError(e)
        }
      },
      ux_mode: 'popup',
    })
    const dark = document.documentElement.dataset.theme === 'dark'
    window.google.accounts.id.renderButton(ref.current, {
      theme: dark ? 'filled_black' : 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: Math.min(360, ref.current.offsetWidth || 360),
    })
  }, [loaded])

  if (!GOOGLE_CLIENT_ID) {
    return <p className="rounded-xl border border-line p-3 text-center text-xs text-muted">Google sign-in isn&apos;t configured (VITE_GOOGLE_CLIENT_ID).</p>
  }
  return <div ref={ref} className="flex min-h-11 justify-center" />
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted uppercase">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  )
}

export function Login() {
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await login(form.email.trim(), form.password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      if (err instanceof EmailNotVerified) {
        toast('Verify your email first. We sent you a new code.')
        navigate('/verify', { state: { email: err.email, from: location.state?.from } })
      } else toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard icon={LogIn} title="Welcome back" subtitle="Sign in to unlock stories and sync your library.">
      <GoogleButton onError={(e) => toast(e, 'error')} />
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="flex justify-end">
          <Link to="/reset-password" state={{ email: form.email }} className="text-sm text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link to="/register" className="text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  )
}

export function Register() {
  const { register } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const email = form.email.trim()
      const first_name = form.first_name.trim()
      const last_name = form.last_name.trim()
      await register(email, form.password, `${first_name} ${last_name}`.trim(), { first_name, last_name })
      navigate('/verify', { state: { email } })
    } catch (err) {
      toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      icon={UserPlus}
      back={{ to: '/login', label: 'Back to sign in' }}
      title="Create your account"
      subtitle="We'll email you a 6-digit code to confirm it's you."
    >
      <GoogleButton onError={(e) => toast(e, 'error')} />
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input className="input" autoComplete="given-name" required maxLength={60} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </Field>
          <Field label="Last name">
            <input className="input" autoComplete="family-name" maxLength={60} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </Field>
        </div>
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" hint="At least 8 characters, not all numbers.">
          <input className="input" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  )
}

function CodeInput({ value, onChange, onComplete }) {
  return (
    <input
      className="input text-center font-display text-3xl tracking-[0.5em]"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      autoFocus
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 6)
        onChange(v)
        if (v.length === 6) onComplete?.(v)
      }}
    />
  )
}

export function VerifyEmail() {
  const { verifyEmail, resendCode } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { state } = useLocation()
  const email = state?.email
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(60)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (!email) return <AuthCard back={{ to: '/login', label: 'Back to sign in' }} title="Verify your email" subtitle="Sign in again to get a new code." />

  async function verify(value = code) {
    if (value.length !== 6) return
    setBusy(true)
    try {
      await verifyEmail(email, value)
      navigate(state?.from || '/', { replace: true })
    } catch (err) {
      toast(err, 'error')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard icon={MailCheck} back={{ to: '/login', label: 'Back to sign in' }} title="Check your inbox" subtitle={`Enter the 6-digit code we sent to ${email}.`}>
      <CodeInput value={code} onChange={setCode} onComplete={verify} />
      <button className="btn-primary mt-4 w-full" disabled={busy || code.length !== 6} onClick={() => verify()}>
        {busy ? 'Verifying…' : 'Verify'}
      </button>
      <button
        className="mt-4 w-full text-sm text-brand disabled:text-muted"
        disabled={cooldown > 0}
        onClick={async () => {
          await resendCode(email).catch((e) => toast(e, 'error'))
          toast('A new code is on its way.')
          setCooldown(60)
        }}
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
      </button>
      <p className="mt-2 text-center text-xs text-muted">Can&apos;t find it? Check your spam folder.</p>
    </AuthCard>
  )
}

export function ResetPassword() {
  const { requestReset, confirmReset, resendCode } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [email, setEmail] = useState(state?.email || '')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

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

  return (
    <AuthCard icon={KeyRound} back={{ to: '/login', label: 'Back to sign in' }} title="Reset password" subtitle={sent ? `Enter the code sent to ${email} and choose a new password.` : "We'll email you a 6-digit code."}>
      {!sent ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await requestReset(email.trim())
              setSent(true)
            })
          }}
        >
          <Field label="Email">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>
            Send reset code
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await confirmReset(email.trim(), code, password)
              navigate('/', { replace: true })
            })
          }}
        >
          <CodeInput value={code} onChange={setCode} />
          <Field label="New password">
            <input className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
            Set new password
          </button>
          <button type="button" className="w-full text-sm text-brand" disabled={busy} onClick={() => run(() => resendCode(email.trim(), 'reset_password'))}>
            Send another code
          </button>
        </form>
      )}
    </AuthCard>
  )
}
