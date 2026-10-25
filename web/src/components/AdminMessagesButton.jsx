import { MessagesSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { api } from '../lib/api'
import { onLiveEvent } from '../realtime/LiveProvider'
import { previewOf } from './ChatExtras'
import { useToast } from './ui'

/** Admins: unread support messages on every page, with a pop-up when a reader writes. */
export function AdminMessagesButton() {
  const toast = useToast()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const onInbox = useRef(false)
  onInbox.current = location.pathname.startsWith('/admin/support')

  useEffect(() => {
    const load = () => api.get('admin/support/').then((d) => setUnread(d.unread_total)).catch(() => {})
    load()
    const offRead = onLiveEvent('support.read', load)
    const offMessage = onLiveEvent('support.message', (conversation) => {
      load()
      const m = conversation.last_message
      if (m && !m.from_admin && !onInbox.current) {
        toast(`New message from ${conversation.user?.first_name || 'a reader'}: ${previewOf(m).slice(0, 60)}`)
      }
    })
    return () => {
      offRead()
      offMessage()
    }
  }, [toast])

  // "(3) Publish Stories" in the browser tab while messages wait.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '')
    document.title = unread > 0 ? `(${unread}) ${base}` : base
  }, [unread])

  return (
    <Link
      to="/admin/support"
      className="relative grid h-10 w-10 place-items-center rounded-full bg-surface-2 transition hover:bg-line"
      aria-label={`Support messages${unread ? `, ${unread} unread` : ''}`}
      title="Support messages"
    >
      <MessagesSquare className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-bg">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
