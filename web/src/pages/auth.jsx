import { ArrowLeft, ArrowRight, BookOpenText, KeyRound, LogIn, Mail, MailCheck, Lock, Sparkles, UserPlus, UserRound } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { IconInput } from '../components/Modal'
import { useToast } from '../components/ui'
import { EmailNotVerified, useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'

const AuthScene3D = lazy(() => import('../components/AuthScene3D'))
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

// ---------------------------------------------------------------- Google ---

// Google Identity Services must be initialised once per page; each rendered
// button forwards the credential (an ID token) to whichever handler is current.
let gisReady = false
let onCredential = () => {}

function useGoogleScript() {
  const [ready, setReady] = useState(Boolean(window.google?.accounts?.id))
  useEffect(() => {
    if (ready) return
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        setReady(true)
        clearInterval(timer)
      }
    }, 200)
    return () => clearInterval(timer)
  }, [ready])
  if (ready && !gisReady && GOOGLE_CLIENT_ID) {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: ({ credential }) => onCredential(credential),
      ux_mode: 'popup',
    })
    gisReady = true
  }
  return ready && Boolean(GOOGLE_CLIENT_ID)
}

const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

/**
 * Our own Google button design. Google's official button is rendered on top of
 * it, fully transparent, so the click still goes through Google's secure popup.
 */
function GoogleButton({ label = 'Continue with Google', onError }) {
  const ready = useGoogleScript()
  const host = useRef(null)
  const theme = useTheme()
  const { googleLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    onCredential = async (credential) => {
      try {
        await googleLogin(credential)
        navigate(location.state?.from || '/', { replace: true })
      } catch (e) {
        onError?.(e)
      }
    }
  })

  useEffect(() => {
    if (!ready || !host.current) return
    host.current.innerHTML = ''
    window.google.accounts.id.renderButton(host.current, {
      type: 'standard',
      size: 'large',
      text: 'continue_with',
      width: Math.min(400, Math.max(200, host.current.offsetWidth)),
    })
  }, [ready])

  const dark = theme === 'dark'
  return (
    <div className={`group relative h-12 w-full ${ready ? '' : 'cursor-not-allowed opacity-60'}`} title={ready ? undefined : 'Google sign-in is loading…'}>
      <div
        aria-hidden
        className={`pointer-events-none flex h-12 w-full items-center justify-center gap-3 rounded-xl border text-[15px] font-semibold shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg ${
          dark ? 'border-[#8e918f] bg-[#131314] text-[#e3e3e3] group-hover:shadow-black/40' : 'border-[#dadce0] bg-white text-[#1f1f1f] group-hover:shadow-black/10'
        }`}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white">
          <GoogleG />
        </span>
        {label}
      </div>
      <div ref={host} className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden opacity-[0.01] [&_iframe]:!w-full" />
    </div>
  )
}

function Divider({ text = 'or with email' }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs tracking-wide text-muted uppercase">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line" /> {text}{' '}
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line" />
    </div>
  )
}

// --------------------------------------------------------------- Forms -----

function SignInForm({ onSwitch }) {
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
    <div className="flex h-full flex-col justify-center px-6 py-8 sm:px-10">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-accent uppercase">
        <LogIn className="h-4 w-4" /> Sign in
      </p>
      <h1 className="mt-2 font-display text-4xl leading-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Pick up right where you left off.</p>
      <div className="mt-6">
        <GoogleButton onError={(e) => toast(e, 'error')} />
      </div>
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <IconInput icon={Mail} label="Email" type="email" autoComplete="email" required placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <IconInput icon={Lock} label="Password" type="password" autoComplete="current-password" required placeholder="Your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="flex justify-end">
          <Link to="/reset-password" state={{ email: form.email }} className="text-sm text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <button className="btn-primary h-12 w-full text-base" disabled={busy}>
          {busy ? 'Signing in…' : <>Sign in <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted md:hidden">
        New here?{' '}
        <button type="button" onClick={onSwitch} className="font-semibold text-brand hover:underline">
          Create an account
        </button>
      </p>
    </div>
  )
}

function passwordStrength(pw) {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) score++
  if (/[^a-z0-9]/i.test(pw) || /[A-Z]/.test(pw)) score++
  return Math.min(score, 4)
}
const STRENGTH = [
  ['Too short', 'bg-rose-500'],
  ['Weak', 'bg-rose-500'],
  ['Okay', 'bg-amber-500'],
  ['Good', 'bg-emerald-500'],
  ['Strong', 'bg-emerald-500'],
]

function RegisterForm({ onSwitch }) {
  const { register } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const strength = useMemo(() => passwordStrength(form.password), [form.password])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

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
    <div className="flex h-full flex-col justify-center px-6 py-8 sm:px-10">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-accent uppercase">
        <UserPlus className="h-4 w-4" /> Create account
      </p>
      <h1 className="mt-2 font-display text-4xl leading-tight">Join the readers</h1>
      <p className="mt-1 text-sm text-muted">Free to join. We&apos;ll email you a 6-digit code to confirm it&apos;s you.</p>
      <div className="mt-6">
        <GoogleButton label="Sign up with Google" onError={(e) => toast(e, 'error')} />
      </div>
      <Divider />
      <form onSubmit={submit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <IconInput icon={UserRound} label="First name" autoComplete="given-name" required maxLength={60} placeholder="Juan" value={form.first_name} onChange={set('first_name')} />
          <IconInput icon={UserRound} label="Last name" autoComplete="family-name" maxLength={60} placeholder="Dela Cruz" value={form.last_name} onChange={set('last_name')} />
        </div>
        <IconInput icon={Mail} label="Email" type="email" autoComplete="email" required placeholder="you@example.com" value={form.email} onChange={set('email')} />
        <div>
          <IconInput icon={Lock} label="Password" type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={form.password} onChange={set('password')} />
          {form.password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full transition ${i < strength ? STRENGTH[strength][1] : 'bg-line'}`} />
                ))}
              </div>
              <span className="w-16 text-right text-xs text-muted">{STRENGTH[strength][0]}</span>
            </div>
          )}
        </div>
        <button className="btn-primary h-12 w-full text-base" disabled={busy}>
          {busy ? 'Creating…' : <>Create account <ArrowRight className="h-4 w-4" /></>}
        </button>
        <p className="text-center text-[11px] text-muted">
          By continuing you agree to our <Link to="/terms" className="underline">Terms</Link> and{' '}
          <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>
      <p className="mt-4 text-center text-sm text-muted md:hidden">
        Already have an account?{' '}
        <button type="button" onClick={onSwitch} className="font-semibold text-brand hover:underline">
          Sign in
        </button>
      </p>
    </div>
  )
}

// -------------------------------------------------------------- Layout -----

function useIsDesktop() {
  const query = '(min-width: 768px)'
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desktop
}

const COPY = {
  login: {
    title: 'New to Publish Stories?',
    text: 'Create a free account to unlock stories, keep your place, and get notified when new chapters arrive.',
    cta: 'Create an account',
  },
  register: {
    title: 'Already one of us?',
    text: 'Sign in to continue reading, see your unlocked stories, and chat with support.',
    cta: 'Sign in instead',
  },
}

/**
 * Sign in and create account on one page. On wide screens a 3D panel slides
 * across to reveal the other form; on phones a segmented switch slides the forms.
 */
function AuthPage({ initial }) {
  const navigate = useNavigate()
  const location = useLocation()
  const desktop = useIsDesktop()
  const [mode, setMode] = useState(initial)
  const isRegister = mode === 'register'

  useEffect(() => setMode(initial), [initial])

  const switchTo = (next) => {
    setMode(next)
    navigate(next === 'register' ? '/register' : '/login', { replace: true, state: location.state })
  }
  const toggle = () => switchTo(isRegister ? 'login' : 'register')
  const copy = COPY[mode]

  const scene = (
    <Suspense fallback={null}>
      <AuthScene3D mode={mode} />
    </Suspense>
  )

  if (!desktop) {
    return (
      <div className="mx-auto max-w-md animate-float-up pt-4">
        <div className="relative -mb-10 h-56">{scene}</div>
        <div className="card relative overflow-hidden p-0">
          {/* Segmented slider */}
          <div className="relative m-4 mb-0 grid grid-cols-2 rounded-2xl bg-surface-2 p-1 text-sm font-semibold">
            <span
              className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-gradient-to-r from-brand to-accent shadow-lg transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.3,1)] ${isRegister ? 'translate-x-full' : ''}`}
            />
            {[
              ['login', 'Sign in', LogIn],
              ['register', 'Create account', UserPlus],
            ].map(([id, label, Icon]) => (
              <button key={id} onClick={() => switchTo(id)} className={`relative z-10 flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${mode === id ? 'text-white' : 'text-muted'}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <div className="overflow-hidden">
            <div className={`flex w-[200%] transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.3,1)] ${isRegister ? '-translate-x-1/2' : ''}`}>
              <div className={`w-1/2 transition-opacity duration-500 ${isRegister ? 'opacity-0' : 'opacity-100'}`} inert={isRegister}>
                <SignInForm onSwitch={() => switchTo('register')} />
              </div>
              <div className={`w-1/2 transition-opacity duration-500 ${isRegister ? 'opacity-100' : 'opacity-0'}`} inert={!isRegister}>
                <RegisterForm onSwitch={() => switchTo('login')} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const ease = 'duration-700 ease-[cubic-bezier(0.7,0,0.3,1)]'
  return (
    <div className="mx-auto max-w-5xl animate-float-up pt-8">
      <div className="relative h-[680px] overflow-hidden rounded-[2rem] border border-line bg-surface/85 shadow-2xl shadow-black/30 backdrop-blur-xl">
        {/* Sign-in lives on the left, create-account on the right; the panel covers the other. */}
        <section
          className={`absolute inset-y-0 left-0 w-1/2 overflow-y-auto transition-all ${ease} ${isRegister ? 'pointer-events-none -translate-x-[15%] opacity-0' : 'translate-x-0 opacity-100'}`}
          inert={isRegister}
        >
          <SignInForm onSwitch={toggle} />
        </section>
        <section
          className={`absolute inset-y-0 right-0 w-1/2 overflow-y-auto transition-all ${ease} ${isRegister ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[15%] opacity-0'}`}
          inert={!isRegister}
        >
          <RegisterForm onSwitch={toggle} />
        </section>

        {/* Sliding 3D panel */}
        <aside className={`absolute inset-y-0 left-1/2 z-20 w-1/2 overflow-hidden transition-transform ${ease} ${isRegister ? '-translate-x-full' : ''}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-[#1b1240] via-[#2a1a63] to-[#0e0b1a]" />
          <div className="absolute -top-20 -right-16 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-brand/40 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-[60%]">{scene}</div>
          <div className="absolute inset-x-0 bottom-0 p-10 text-white">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.25em] text-accent uppercase">
              <Sparkles className="h-4 w-4" /> Publish Stories
            </p>
            <h2 key={mode} className="mt-3 animate-float-up font-display text-4xl leading-tight">
              {copy.title}
            </h2>
            <p key={`${mode}-t`} className="mt-3 max-w-sm animate-float-up text-white/75">
              {copy.text}
            </p>
            <button onClick={toggle} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/20">
              {isRegister ? <ArrowLeft className="h-4 w-4" /> : null}
              {copy.cta}
              {!isRegister ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </div>
        </aside>
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
        <BookOpenText className="h-4 w-4" /> Stories by Maria Gemima Valderrama
      </p>
    </div>
  )
}

export const Login = () => <AuthPage initial="login" />
export const Register = () => <AuthPage initial="register" />

// ---------------------------------------------------- Verify & reset -------

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
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand to-accent text-white shadow-lg shadow-brand/30">
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

function CodeInput({ value, onChange, onComplete }) {
  return (
    <div className="relative">
      <KeyRound className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
      <input
        className="input !pl-12 text-center font-display text-3xl tracking-[0.5em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        maxLength={6}
        autoFocus
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
          onChange(v)
          if (v.length === 6) onComplete?.(v)
        }}
      />
    </div>
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
      <button className="btn-primary mt-4 h-12 w-full" disabled={busy || code.length !== 6} onClick={() => verify()}>
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
          <IconInput icon={Mail} label="Email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary h-12 w-full" disabled={busy}>
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
          <IconInput icon={Lock} label="New password" type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn-primary h-12 w-full" disabled={busy || code.length !== 6}>
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
