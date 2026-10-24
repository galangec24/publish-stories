import { Headset, LogIn, MessageCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { timeAgo } from '../lib/time'
import { onLiveEvent, useLive } from '../realtime/LiveProvider'
import { ChatComposer, MessageContent, sendChatMessage } from './ChatExtras'
import { useToast } from './ui'

/** Floating "Messenger-style" support chat for readers. Replies arrive live. */
export function SupportChat() {
  const { user } = useAuth()
  const { chatOpen: open, setChatOpen: setOpen } = useLive()
  const toast = useToast()
  const [messages, setMessages] = useState(null)
  const [badge, setBadge] = useState(0)
  const list = useRef(null)
  const openRef = useRef(open)
  openRef.current = open

  // Load (and mark read) when opened.
  useEffect(() => {
    if (!open || !user) return
    setBadge(0)
    api
      .get('support/')
      .then((c) => setMessages(c.messages))
      .catch((e) => toast(e, 'error'))
  }, [open, user, toast])

  // Live messages for my thread.
  useEffect(
    () =>
      onLiveEvent('support.message', (conversation) => {
        const m = conversation.last_message
        if (!m) return
        setMessages((list) => (list && !list.some((x) => x.id === m.id) ? [...list, m] : list))
        if (m.from_admin && !openRef.current) setBadge((b) => b + 1)
      }),
    [],
  )

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  async function send(message) {
    const m = await sendChatMessage('support/messages/', message)
    setMessages((list) => (list?.some((x) => x.id === m.id) ? list : [...(list || []), m]))
  }

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

          {!user ? (
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div>
                <MessageCircle className="mx-auto h-10 w-10 text-muted" />
                <p className="mt-3 font-semibold">Sign in to chat with us</p>
                <p className="mt-1 text-sm text-muted">So we can reply to your account and email.</p>
                <Link to="/login" onClick={() => setOpen(false)} className="btn-primary mt-4">
                  <LogIn className="h-4 w-4" /> Sign in
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div ref={list} className="flex-1 space-y-2 overflow-y-auto bg-bg-2/40 px-3 py-4">
                {messages === null && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
                {messages?.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted">
                    <p className="font-medium text-ink">Hi {user.first_name || 'there'}!</p>
                    <p className="mt-1">Questions about a story, payment or your account? Send us a message.</p>
                  </div>
                )}
                {messages?.map((m) => (
                  <div key={m.id} className={`flex ${m.from_admin ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                        m.from_admin ? 'rounded-bl-md bg-surface-2' : 'rounded-br-md bg-brand text-white'
                      }`}
                      title={new Date(m.created_at).toLocaleString()}
                    >
                      <MessageContent m={m} mine={!m.from_admin} />
                      <span className={`mt-0.5 block text-[10px] ${m.from_admin ? 'text-muted' : 'text-white/70'}`}>
                        {m.from_admin ? 'Support · ' : ''}
                        {timeAgo(m.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <ChatComposer onSend={send} />
            </>
          )}
        </section>
      )}
    </>
  )
}
