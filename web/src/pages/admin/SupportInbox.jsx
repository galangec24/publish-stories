import { ArrowLeft, Inbox, Mail } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ChatBubble, ChatComposer, previewOf, replaceMessage, sendChatMessage, useJumpToMessage } from '../../components/ChatExtras'
import { Avatar } from '../../components/HeaderMenus'
import { Spinner, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { timeAgo } from '../../lib/time'
import { onLiveEvent } from '../../realtime/LiveProvider'

/** Two-pane support inbox: threads (first name + email) and the live conversation. */
export function SupportInbox() {
  const toast = useToast()
  const [threads, setThreads] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [thread, setThread] = useState(null)
  const list = useRef(null)
  const [replyTo, setReplyTo] = useState(null)
  const [highlighted, jumpTo] = useJumpToMessage(list)
  const activeRef = useRef(null)
  activeRef.current = activeId

  const loadThreads = useCallback(() => api.get('admin/support/').then((d) => setThreads(d.results)), [])

  useEffect(() => {
    loadThreads().catch((e) => toast(e, 'error'))
  }, [loadThreads, toast])

  // From a notification: /admin/support?c=12 opens that conversation.
  const [params] = useSearchParams()
  const wanted = Number(params.get('c'))
  useEffect(() => {
    if (wanted && wanted !== activeRef.current) openThread(wanted).catch(() => {})
  }, [wanted]) // eslint-disable-line react-hooks/exhaustive-deps

  const openThread = useCallback(
    async (id) => {
      setActiveId(id)
      setReplyTo(null)
      setThread(null)
      const data = await api.get(`admin/support/${id}/`)
      setThread(data)
      setThreads((ts) => ts?.map((t) => (t.id === id ? { ...t, unread_for_admin: 0 } : t)))
    },
    [],
  )

  // Live: new messages update the list and the open thread.
  useEffect(
    () =>
      onLiveEvent('support.message', (conv) => {
        setThreads((ts) => {
          const rest = (ts || []).filter((t) => t.id !== conv.id)
          const isOpen = conv.id === activeRef.current
          return [{ ...conv, unread_for_admin: isOpen ? 0 : conv.unread_for_admin }, ...rest]
        })
        if (conv.id === activeRef.current && conv.last_message) {
          setThread((t) => (t && !t.messages.some((m) => m.id === conv.last_message.id) ? { ...t, messages: [...t.messages, conv.last_message] } : t))
          if (!conv.last_message.from_admin) api.get(`admin/support/${conv.id}/`).catch(() => {}) // mark read
        }
      }),
    [],
  )

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [thread])

  async function reply(message) {
    const m = await sendChatMessage(`admin/support/${activeId}/messages/`, message)
    setThread((t) =>
      t.messages.some((x) => x.id === m.id) ? t : { ...t, unread_for_user: (t.unread_for_user || 0) + 1, messages: [...t.messages, m] },
    )
  }

  async function reactTo(m, emoji) {
    try {
      const updated = await api.post(`admin/support/messages/${m.id}/react/`, { emoji })
      setThread((t) => ({ ...t, messages: replaceMessage(t.messages, updated) }))
    } catch (e) {
      toast(e, 'error')
    }
  }

  // The reader reacted, or opened (saw) their chat.
  useEffect(() => {
    const offReaction = onLiveEvent('support.reaction', ({ conversation, message }) =>
      setThread((t) => (t && t.id === conversation ? { ...t, messages: replaceMessage(t.messages, message) } : t)),
    )
    const offSeen = onLiveEvent('support.seen', ({ id, by }) =>
      setThread((t) => (t && t.id === id && by === 'reader' ? { ...t, unread_for_user: 0 } : t)),
    )
    return () => {
      offReaction()
      offSeen()
    }
  }, [])

  if (!threads) return <Spinner />

  return (
    <div>
      <h1 className="mb-5 font-display text-3xl">Support inbox</h1>
      <div className="card grid h-[calc(100dvh-14rem)] min-h-[480px] overflow-hidden p-0 md:grid-cols-[320px_1fr]">
        <aside className={`overflow-y-auto border-r border-line ${activeId ? 'hidden md:block' : ''}`}>
          {threads.length === 0 && (
            <div className="p-8 text-center text-sm text-muted">
              <Inbox className="mx-auto mb-2 h-8 w-8 opacity-50" /> No messages yet.
            </div>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => openThread(t.id)}
              className={`flex w-full items-start gap-3 border-b border-line/60 p-3 text-left transition hover:bg-surface-2 ${t.id === activeId ? 'bg-brand/10' : ''}`}
            >
              <Avatar user={t.user} size="h-11 w-11" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate ${t.unread_for_admin ? 'font-bold' : 'font-medium'}`}>
                    {t.user.first_name} {t.user.last_name}
                    {t.user.is_guest && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-semibold text-muted">Guest</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{t.last_message_at && timeAgo(t.last_message_at)}</span>
                </span>
                <span className="block truncate text-xs text-muted">{t.user.email || (t.user.is_guest ? 'No email left' : '')}</span>
                <span className={`mt-0.5 block truncate text-sm ${t.unread_for_admin ? 'font-semibold text-ink' : 'text-muted'}`}>
                  {t.last_message?.from_admin ? 'You: ' : ''}
                  {previewOf(t.last_message)}
                </span>
              </span>
              {t.unread_for_admin > 0 && (
                <span className="mt-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                  {t.unread_for_admin}
                </span>
              )}
            </button>
          ))}
        </aside>

        <section className={`flex min-h-0 flex-col ${activeId ? '' : 'hidden md:flex'}`}>
          {!activeId ? (
            <div className="grid flex-1 place-items-center text-sm text-muted">Select a conversation</div>
          ) : !thread ? (
            <Spinner />
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-line p-3">
                <button className="rounded-full p-1.5 hover:bg-surface-2 md:hidden" onClick={() => setActiveId(null)} aria-label="Back">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Avatar user={thread.user} size="h-10 w-10" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {thread.user.first_name} {thread.user.last_name}
                  </p>
                  {thread.user.email ? (
                    <a href={`mailto:${thread.user.email}`} className="flex items-center gap-1 truncate text-xs text-brand hover:underline">
                      <Mail className="h-3.5 w-3.5" /> {thread.user.email}
                    </a>
                  ) : (
                    <p className="text-xs text-muted">No email left. They see your reply when they open the chat on their device.</p>
                  )}
                </div>
              </header>
              <div ref={list} className="flex-1 space-y-2 overflow-y-auto bg-bg-2/40 p-4">
                {thread.messages.map((m, i) => (
                  <ChatBubble
                    key={m.id}
                    m={m}
                    mine={m.from_admin}
                    side="admin"
                    onReply={setReplyTo}
                    onReact={reactTo}
                    onJump={jumpTo}
                    highlighted={highlighted === m.id}
                    label={`${m.from_admin ? '' : `${m.sender_name} · `}${timeAgo(m.created_at)}`}
                    status={i === thread.messages.length - 1 && m.from_admin ? (thread.unread_for_user ? 'Sent' : 'Seen ✓✓') : null}
                  />
                ))}
              </div>
              <ChatComposer
                onSend={reply}
                placeholder={`Reply to ${thread.user.first_name}…`}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
