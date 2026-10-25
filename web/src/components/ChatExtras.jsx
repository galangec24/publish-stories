import { Download, FileText, ImagePlay, Paperclip, Reply, Search, Send, Smile, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { api } from '../lib/api'
import { useToast } from './ui'

const EMOJIS = {
  Smileys: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 😴 🥱 😪 🤤 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠 🤬 😈 💀 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾',
  People: '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 💪 🦾 👀 👁️ 👄 🧠 👶 🧒 👦 👧 🧑 👩 👨 🧓 👵 👴 👩‍🏫 👨‍🏫 👩‍🎓 👨‍🎓 👩‍💻 ✍🏽 🙇 🙋 🙆 🙅 🤷 🤦 💃 🕺 👪 💑 💏',
  Hearts: '❤️ 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💌 💋 💯 💢 💥 💫 💦 💨 🕊️',
  Nature: '🌸 💮 🌹 🥀 🌺 🌻 🌼 🌷 🌱 🪴 🌲 🌳 🌴 🌵 🌾 🌿 ☘️ 🍀 🍁 🍂 🍃 🌍 🌏 🌙 🌛 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌊 💧 ☔ 🐶 🐱 🐰 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦋 🐝 🐞 🐢 🐠 🐬 🐳 🦀',
  Food: '☕ 🍵 🧋 🥤 🍰 🎂 🧁 🍩 🍪 🍫 🍬 🍭 🍯 🍞 🥐 🍳 🍚 🍜 🍲 🍛 🍣 🍱 🥟 🍢 🍡 🍧 🍨 🍦 🥭 🍌 🍍 🥥 🍉 🍓 🍒 🍎 🍊 🍋',
  Things: '📚 📖 📕 📗 📘 📙 📓 📔 📒 📝 ✏️ 🖊️ 🖋️ ✒️ 📜 📰 🗞️ 🔖 🏷️ 📌 📍 📎 🖇️ ✂️ 🗂️ 📅 🗓️ ⏰ ⌛ 🕯️ 💡 🔍 🔑 🗝️ 🎁 🎀 🎈 🎉 🎊 🏆 🥇 🎵 🎶 🎤 🎧 🎬 🎨 🖼️ 📷 📱 💻 ✉️ 📨 🏠 🏫 ⛪ 🕌 🏖️ 🏝️ ⛵ ✈️ 🚌 🚲 🇵🇭',
  Symbols: '✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ❓ ❔ ❗ ‼️ ⁉️ ⚠️ 🚫 💤 💬 💭 🗯️ ♻️ ⭕ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🔶 🔷 🔺 🔻 ▶️ ⏸️ ⏹️ 🔁 🔂 🆕 🆓 🆒 🆗 🔝 🔜 ♾️ ™️ ©️ ®️',
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Sends a chat message with optional GIF and file (multipart when there's a file). */
export function sendChatMessage(path, { body, gif_url, file, reply_to }) {
  if (!file) return api.post(path, { body, gif_url, reply_to })
  const form = new FormData()
  if (body) form.append('body', body)
  if (gif_url) form.append('gif_url', gif_url)
  if (reply_to) form.append('reply_to', reply_to)
  form.append('file', file)
  return api.upload(path, form)
}

/** Text of a message for previews (inbox list). */
export function previewOf(m) {
  if (!m) return ''
  if (m.body) return m.body
  if (m.file) return `📎 ${m.file.name}`
  return m.gif_url ? 'GIF' : ''
}

function Attachment({ file, mine }) {
  const [src, setSrc] = useState(null)
  const isImage = file.type.startsWith('image/') && file.type !== 'image/heic'
  useEffect(() => {
    if (!isImage) return
    let url
    api.blobUrl(file.url).then((u) => setSrc((url = u))).catch(() => {})
    return () => url && URL.revokeObjectURL(url)
  }, [file.url, isImage])

  async function download() {
    const url = await api.blobUrl(file.url)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  if (isImage) {
    return src ? (
      <button type="button" onClick={download} title={`Download ${file.name}`} className="mt-1 block">
        <img src={src} alt={file.name} className="max-h-60 rounded-xl" />
      </button>
    ) : (
      <div className="mt-1 h-32 w-44 animate-pulse rounded-xl bg-black/10" />
    )
  }
  return (
    <button
      type="button"
      onClick={download}
      className={`mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-left ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-surface hover:bg-line'}`}
    >
      <FileText className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block max-w-48 truncate font-medium">{file.name}</span>
        <span className="block text-[11px] opacity-70">{formatSize(file.size)}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-70" />
    </button>
  )
}

/** The inside of a chat bubble: text, GIF and/or attachment. */
export function MessageContent({ m, mine, onJump }) {
  return (
    <>
      {m.reply_to && (
        <button
          type="button"
          onClick={() => m.reply_to.id && onJump?.(m.reply_to.id)}
          className={`mb-1 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs ${
            mine ? 'border-white/60 bg-white/15 text-white/85' : 'border-brand bg-surface text-muted'
          }`}
        >
          <span className="block font-semibold">{m.reply_to.sender_name}</span>
          <span className="line-clamp-2">{m.reply_to.text}</span>
        </button>
      )}
      {m.body && <span className="whitespace-pre-wrap">{m.body}</span>}
      {m.gif_url && <img src={m.gif_url} alt="GIF" className="mt-1 max-h-48 rounded-xl" loading="lazy" />}
      {m.file && <Attachment file={m.file} mine={mine} />}
    </>
  )
}

/**
 * One chat message, Messenger-style: hover (or tap) for Reply; quotes jump to the original.
 * `mine` puts it on the right, in the brand colour.
 */
export const REACTIONS = ['❤️', '😆', '😮', '😢', '😡', '👍']

/**
 * One chat message, Messenger-style: React and Reply buttons beside it,
 * quotes that jump to the original, reactions under the bubble and an optional "Seen" mark.
 * `side` is who is looking ("reader" or "admin"), so their own reaction is highlighted.
 */
export function ChatBubble({ m, mine, side, onReply, onReact, onJump, label, highlighted = false, status = null }) {
  const [picking, setPicking] = useState(false)
  const box = useRef(null)
  const reactions = [m.reactions?.reader, m.reactions?.admin].filter(Boolean)
  const myReaction = m.reactions?.[side] || ''

  useEffect(() => {
    if (!picking) return
    const close = (e) => !box.current?.contains(e.target) && setPicking(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [picking])

  const action = 'shrink-0 rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink'
  return (
    <div id={`msg-${m.id}`} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <div ref={box} className={`relative flex w-full items-center gap-0.5 ${mine ? 'flex-row-reverse' : ''}`}>
        {/* leaves room for the two buttons, so nothing spills out of the chat on a phone */}
        <div className={`relative min-w-0 max-w-[calc(100%-4.75rem)] ${reactions.length ? 'mb-3' : ''}`}>
          <div
            className={`rounded-2xl px-3.5 py-2 text-sm break-words transition ${
              mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-surface-2'
            } ${highlighted ? 'ring-2 ring-accent' : ''}`}
            title={new Date(m.created_at).toLocaleString()}
          >
            <MessageContent m={m} mine={mine} onJump={onJump} />
            <span className={`mt-0.5 block text-[10px] ${mine ? 'text-white/70' : 'text-muted'}`}>{label}</span>
          </div>
          {reactions.length > 0 && (
            <span
              className={`absolute -bottom-3 flex items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-px text-sm shadow ${mine ? 'right-2' : 'left-2'}`}
              title={[m.reactions.reader && `Reader: ${m.reactions.reader}`, m.reactions.admin && `Support: ${m.reactions.admin}`].filter(Boolean).join(' · ')}
            >
              {reactions.join('')}
            </span>
          )}
        </div>
        {onReact && (
          <button type="button" onClick={() => setPicking((p) => !p)} className={action} aria-label="React to this message" title="React">
            <Smile className="h-4 w-4" />
          </button>
        )}
        {onReply && (
          <button type="button" onClick={() => onReply(m)} className={action} aria-label="Reply to this message" title="Reply">
            <Reply className="h-4 w-4" />
          </button>
        )}
        {picking && (
          <div className={`absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-line bg-surface p-1 shadow-xl ${mine ? 'right-0' : 'left-0'}`} role="menu">
            {REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPicking(false)
                  onReact(m, e)
                }}
                className={`rounded-full p-1 text-xl transition hover:scale-125 ${myReaction === e ? 'bg-brand/20' : ''}`}
                aria-label={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {status && <span className="mt-0.5 px-1 text-[10px] text-muted">{status}</span>}
    </div>
  )
}

/** Put an updated message (e.g. new reactions) into a list of messages. */
export function replaceMessage(list, message) {
  return list?.map((x) => (x.id === message.id ? { ...x, ...message } : x))
}

/** Scrolls to a quoted message and flashes it. Returns [highlightedId, jump]. */
export function useJumpToMessage(container) {
  const [highlighted, setHighlighted] = useState(null)
  const jump = (id) => {
    const el = container.current?.querySelector(`#msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlighted(id)
    setTimeout(() => setHighlighted(null), 1500)
  }
  return [highlighted, jump]
}

export function EmojiPanel({ onPick }) {
  return (
    <div className="max-h-64 overflow-y-auto p-2">
      {Object.entries(EMOJIS).map(([group, list]) => (
        <div key={group}>
          <p className="px-1 pt-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{group}</p>
          <div className="grid grid-cols-8 gap-0.5">
            {list.split(' ').map((e) => (
              <button key={e} type="button" onClick={() => onPick(e)} className="rounded-lg p-1 text-xl hover:bg-surface-2">
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function GifPanel({ onPick }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      api
        .get('support/gifs/', { q: q.trim() })
        .then((d) => live && setData(d))
        .catch(() => live && setData({ enabled: true, results: [] }))
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  if (data && !data.enabled) return <p className="p-4 text-center text-sm text-muted">GIF search isn&apos;t switched on yet.</p>
  return (
    <div className="p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input !py-1.5 !pl-8 text-sm" placeholder="Search GIFs" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="mt-2 grid max-h-52 grid-cols-3 gap-1 overflow-y-auto">
        {!data && Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-lg bg-surface-2" />)}
        {data?.results.map((g) => (
          <button key={g.id} type="button" onClick={() => onPick(g.url)} title={g.title} className="overflow-hidden rounded-lg">
            <img src={g.preview} alt={g.title} className="aspect-square w-full object-cover" loading="lazy" />
          </button>
        ))}
        {data && !data.results.length && <p className="col-span-3 py-6 text-center text-xs text-muted">No GIFs found.</p>}
      </div>
      <p className="mt-1 text-right text-[10px] text-muted">Powered by GIPHY</p>
    </div>
  )
}

/** Message box with emoji, GIF and file buttons. `onSend({ body, gif_url, file })` returns a promise. */
export function ChatComposer({ onSend, placeholder = 'Write a message…', disabled = false, replyTo = null, onCancelReply }) {
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState(null)
  const [panel, setPanel] = useState(null) // 'emoji' | 'gif'
  const [sending, setSending] = useState(false)
  const box = useRef(null)
  const fileInput = useRef(null)
  const area = useRef(null)

  useEffect(() => {
    if (!panel) return
    const onDown = (e) => !box.current?.contains(e.target) && setPanel(null)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [panel])

  async function send(extra = {}) {
    const body = draft.trim()
    if (!body && !file && !extra.gif_url) return
    setSending(true)
    try {
      await onSend({ body, file, ...(replyTo && { reply_to: replyTo.id }), ...extra })
      onCancelReply?.()
      setDraft('')
      setFile(null)
      setPanel(null)
    } catch (err) {
      toast(err, 'error')
    } finally {
      setSending(false)
    }
  }

  function addEmoji(emoji) {
    const el = area.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    setDraft(draft.slice(0, start) + emoji + draft.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const iconButton = (active) => `grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${active ? 'bg-brand/15 text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink'}`

  return (
    <div ref={box} className="relative border-t border-line p-2">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border-l-2 border-brand bg-surface-2 px-3 py-1.5 text-xs">
          <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Replying to {replyTo.from_admin ? 'Support' : replyTo.sender_name || 'message'}</span>
            <span className="line-clamp-1 text-muted">{previewOf(replyTo)}</span>
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="rounded-full p-0.5 hover:bg-line">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {panel && (
        <div className="card absolute right-2 bottom-full left-2 z-10 mb-2 overflow-hidden p-0 shadow-2xl">
          {panel === 'emoji' ? <EmojiPanel onPick={addEmoji} /> : <GifPanel onPick={(url) => send({ gif_url: url })} />}
        </div>
      )}
      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
          <Paperclip className="h-4 w-4 text-brand" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-xs text-muted">{formatSize(file.size)}</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="rounded-full p-0.5 hover:bg-line">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <form
        className="flex items-end gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <button type="button" className={iconButton(panel === 'emoji')} onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')} aria-label="Emoji">
          <Smile className="h-5 w-5" />
        </button>
        <button type="button" className={iconButton(panel === 'gif')} onClick={() => setPanel(panel === 'gif' ? null : 'gif')} aria-label="GIF">
          <ImagePlay className="h-5 w-5" />
        </button>
        <button type="button" className={iconButton(false)} onClick={() => fileInput.current?.click()} aria-label="Attach a file">
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xlsx,.txt"
          onChange={(e) => {
            setFile(e.target.files[0] || null)
            e.target.value = ''
          }}
        />
        <textarea
          ref={area}
          className="input max-h-28 min-h-10 flex-1 resize-none !rounded-2xl !py-2"
          rows={1}
          placeholder={placeholder}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button className="btn-primary h-10 w-10 shrink-0 !p-0" disabled={disabled || sending || (!draft.trim() && !file)} aria-label="Send">
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
