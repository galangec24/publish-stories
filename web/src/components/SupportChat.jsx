import { Headset, LogIn, MessageCircle, Pencil, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { timeAgo } from '../lib/time'
import { onLiveEvent, useLive } from '../realtime/LiveProvider'
import { ChatBubble, ChatComposer, previewOf, sendChatMessage, useJumpToMessage } from './ChatExtras'
import { useToast } from './ui'

const POLL_OPEN_MS = 10_000
const POLL_CLOSED_MS = 60_000

function readCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: the chat still works, just not instantly next time */
  }
}

/** Guests can leave a name and email so support can reply by email too. */
function GuestDetails({ details, onSaved }) {
  const toast = useToast()
  const [open, setOpen] = useState(!details.first_name && !details.email)
  const [form, setForm] = useState({ name: details.first_name === 'Guest' ? '' : details.first_name || '', email: details.email || '' })
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      onSaved(await api.patch('support/', form))
      setOpen(false)
      toast('Thanks! We’ll also reply to your email.')
    } catch (err) {
      toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 border-b border-line px-3 py-1.5 text-left text-xs text-muted hover:text-ink">
        <Pencil className="h-3 w-3" />
        {details.email ? `Replies also go to ${details.email}` : 'Add your email to get replies there too'}
      </button>
    )
  }
  return (
    <form onSubmit={save} className="space-y-2 border-b border-line bg-surface-2/50 p-3 text-xs">
      <p className="text-muted">
        No account needed. How can we reach you? <span className="opacity-70">(optional)</span>
      </p>
      <div className="flex gap-2">
        <input className="input !py-1.5 text-sm" placeholder="Your name" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input !py-1.5 text-sm" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="flex justify-between gap-2">
        <Link to="/login" className="inline-flex items-center gap-1 text-brand hover:underline">
          <LogIn className="h-3 w-3" /> or sign in
        </Link>
        <span className="flex gap-2">
          <button type="button" className="text-muted hover:text-ink" onClick={() => setOpen(false)}>
            Skip
          </button>
          <button className="btn-primary !px-3 !py-1 text-xs" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>
    </form>
  )
}

/**
 * A guest on a new device (or incognito) can pick up an earlier conversation.
 * The network only suggests it; the email they left, or their chat code, proves it's theirs.
 */
function ResumeCard({ offer, onResumed }) {
  const toast = useToast()
  const [mode, setMode] = useState(offer?.available && offer.with_email ? 'email' : 'code')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(Boolean(offer?.available))

  async function resume(e) {
    e.preventDefault()
    setBusy(true)
    try {
      onResumed(await api.post('support/resume/', mode === 'email' ? { email: value } : { code: value }))
      toast('Welcome back! Here is your conversation.')
    } catch (err) {
      toast(err, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full border-b border-line px-3 py-1.5 text-left text-xs text-brand hover:underline">
        Chatted with us before? Continue that conversation
      </button>
    )
  }
  return (
    <form onSubmit={resume} className="space-y-2 border-b border-line bg-surface-2/50 p-3 text-xs">
      <p className="font-medium text-ink">{offer?.available ? 'Welcome back! Continue your earlier conversation?' : 'Continue an earlier conversation'}</p>
      <p className="text-muted">
        {mode === 'email' ? 'Enter the email you gave us.' : 'Enter the chat code shown at the top of your earlier chat.'}
      </p>
      <div className="flex gap-2">
        <input
          className={`input !py-1.5 text-sm ${mode === 'code' ? 'font-mono uppercase tracking-widest' : ''}`}
          type={mode === 'email' ? 'email' : 'text'}
          placeholder={mode === 'email' ? 'you@example.com' : 'ABCD-EFGH'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
        <button className="btn-primary !px-3 !py-1 text-xs" disabled={busy || !value.trim()}>
          {busy ? '…' : 'Continue'}
        </button>
      </div>
      <div className="flex justify-between">
        <button type="button" className="text-brand hover:underline" onClick={() => setMode(mode === 'email' ? 'code' : 'email')}>
          {mode === 'email' ? 'Use a chat code instead' : 'Use my email instead'}
        </button>
        <button type="button" className="text-muted hover:text-ink" onClick={() => setOpen(false)}>
          Start a new chat
        </button>
      </div>
    </form>
  )
}

/**
 * Floating "Messenger-style" support chat, for signed-in readers and guests alike.
 * Guests are recognised by this device; the last messages are cached so the chat opens instantly.
 */
export function SupportChat() {
  const { user } = useAuth()
  const { chatOpen: open, setChatOpen: setOpen } = useLive()
  const toast = useToast()
  const cacheKey = `support-cache:${user?.id || 'guest'}`
  const [thread, setThread] = useState(() => readCache(cacheKey))
  const [badge, setBadge] = useState(0)
  const badgeRef = useRef(0)
  badgeRef.current = badge
  const list = useRef(null)
  const openRef = useRef(open)
  openRef.current = open
  const lastSeen = useRef(null)
  const [replyTo, setReplyTo] = useState(null)
  const [highlighted, jumpTo] = useJumpToMessage(list)

  useEffect(() => setThread(readCache(cacheKey)), [cacheKey])
  useEffect(() => {
    if (thread) writeCache(cacheKey, { ...thread, messages: thread.messages.slice(-100) })
  }, [thread, cacheKey])

  // Opening the chat loads (and marks read) the latest messages.
  const load = useCallback(
    (quiet = false) =>
      api
        .get('support/')
        .then((t) => {
          const newest = t.messages[t.messages.length - 1]
          if (newest) lastSeen.current = newest.id
          setThread(t)
        })
        .catch((e) => !quiet && toast(e, 'error')),
    [toast],
  )

  // While closed, only ask how many replies are waiting (that doesn't mark them read).
  const checkUnread = useCallback(
    () =>
      api
        .get('support/unread/')
        .then(({ unread }) => {
          if (unread > badgeRef.current) toast(unread === 1 ? 'New reply from Support. Open the chat to read it.' : `${unread} new replies from Support.`)
          setBadge(unread)
        })
        .catch(() => {}),
    [toast],
  )

  useEffect(() => {
    if (!open) return
    setBadge(0)
    load()
  }, [open, user?.id, load])

  // Unread replies from earlier visits show on the bubble right away.
  useEffect(() => {
    if (!open) checkUnread()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Signed-in readers get replies over the live connection; guests check regularly.
  useEffect(() => {
    if (user) return
    const timer = setInterval(() => (openRef.current ? load(true) : checkUnread()), open ? POLL_OPEN_MS : POLL_CLOSED_MS)
    return () => clearInterval(timer)
  }, [user, open, load, checkUnread])

  useEffect(
    () =>
      onLiveEvent('support.message', (conversation) => {
        const m = conversation.last_message
        if (!m) return
        setThread((t) => (t && !t.messages.some((x) => x.id === m.id) ? { ...t, messages: [...t.messages, m] } : t))
        if (m.from_admin && !openRef.current) {
          setBadge((b) => b + 1)
          toast(`New reply from Support: ${previewOf(m).slice(0, 60)}`)
        }
      }),
    [toast],
  )

  // "(2) Publish Stories" in the browser tab while replies are waiting.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '')
    document.title = badge > 0 ? `(${badge}) ${base}` : base
  }, [badge])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [thread?.messages?.length, open])

  async function send(message) {
    const m = await sendChatMessage('support/messages/', message)
    lastSeen.current = m.id
    setThread((t) => {
      const base = t || { messages: [], user: { is_guest: !user } }
      return base.messages.some((x) => x.id === m.id) ? base : { ...base, messages: [...base.messages, m] }
    })
  }

  const messages = thread?.messages ?? null
  const name = user?.first_name || (thread?.user?.first_name && thread.user.first_name !== 'Guest' ? thread.user.first_name : '')

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="tile-3d fixed right-4 bottom-4 z-40 grid h-14 w-14 place-items-center rounded-full sm:right-6 sm:bottom-6"
        aria-label={open ? 'Close support chat' : 'Chat with support'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {badge > 0 && !open && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold ring-2 ring-bg">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <section
          className="card fixed right-3 bottom-22 z-40 flex h-[min(560px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-1.5rem))] animate-float-up flex-col overflow-hidden p-0 shadow-2xl sm:right-6 sm:bottom-24"
          aria-label="Support chat"
        >
          <header className="flex items-center gap-3 bg-gradient-to-r from-brand to-brand/70 px-4 py-3 text-white">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/20">
              <Headset className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">Publish Stories Support</p>
              <p className="text-xs opacity-80">We usually reply within a day</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 hover:bg-white/15">
              <X className="h-5 w-5" />
            </button>
          </header>

          {!user && thread && !thread.id && (
            <ResumeCard
              offer={thread.resume}
              onResumed={(t) => {
                lastSeen.current = t.messages[t.messages.length - 1]?.id ?? null
                setThread(t)
              }}
            />
          )}
          {!user && thread && <GuestDetails details={thread.user || {}} onSaved={(t) => setThread((old) => ({ ...old, ...t }))} />}
          {!user && thread?.resume_code && (
            <p className="border-b border-line px-3 py-1 text-[11px] text-muted" title="Use it to continue this chat on another phone or browser">
              Your chat code: <span className="font-mono font-semibold tracking-widest text-ink">{thread.resume_code}</span>
            </p>
          )}

          <div ref={list} className="flex-1 space-y-2 overflow-y-auto bg-bg-2/40 px-3 py-4">
            {messages === null && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
            {messages?.length === 0 && (
              <div className="py-8 text-center text-sm text-muted">
                <p className="font-medium text-ink">Hi {name || 'there'}!</p>
                <p className="mt-1">Questions about a story, a payment or your account? Send us a message. No account needed.</p>
              </div>
            )}
            {messages?.map((m) => (
              <ChatBubble
                key={m.id}
                m={m}
                mine={!m.from_admin}
                onReply={setReplyTo}
                onJump={jumpTo}
                highlighted={highlighted === m.id}
                label={`${m.from_admin ? 'Support · ' : ''}${timeAgo(m.created_at)}`}
              />
            ))}
          </div>
          <ChatComposer onSend={send} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
        </section>
      )}
    </>
  )
}
