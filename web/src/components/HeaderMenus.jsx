import {
  AtSign,
  BadgeCheck,
  Bell,
  BookOpen,
  CheckCheck,
  ChevronRight,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  MailCheck,
  MailX,
  MessageCircle,
  ReceiptText,
  Settings as SettingsIcon,
  ScanLine,
  ShoppingCart,
  UserRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { fullName, initials, timeAgo } from '../lib/time'
import { useLive } from '../realtime/LiveProvider'

const KIND_ICON = {
  payment_paid: [BadgeCheck, 'bg-emerald-500'],
  checkout_started: [ShoppingCart, 'bg-amber-500'],
  payment_submitted: [ScanLine, 'bg-amber-500'],
  payment_rejected: [ShoppingCart, 'bg-rose-500'],
  new_story: [BookOpen, 'bg-brand'],
  support_message: [MessageCircle, 'bg-sky-500'],
  support_reply: [MessageCircle, 'bg-sky-500'],
  email_request: [Mail, 'bg-violet-500'],
  email_approved: [MailCheck, 'bg-emerald-500'],
  email_denied: [MailX, 'bg-rose-500'],
  email_changed: [AtSign, 'bg-emerald-500'],
  comment: [MessageCircle, 'bg-pink-500'],
  comment_reply: [MessageCircle, 'bg-pink-500'],
}

function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}

export function Avatar({ user, size = 'h-9 w-9', text = 'text-sm' }) {
  return user?.avatar_url ? (
    <img src={user.avatar_url} alt="" className={`${size} rounded-full object-cover`} referrerPolicy="no-referrer" />
  ) : (
    <span className={`grid ${size} place-items-center rounded-full bg-gradient-to-br from-brand to-accent font-semibold text-white ${text}`}>
      {initials(user)}
    </span>
  )
}

const panel = 'card absolute right-0 z-50 mt-2 w-[min(92vw,380px)] animate-float-up overflow-hidden p-0 shadow-2xl'

/** Bell with a red unread badge and a Facebook-style list of notifications. */
export function NotificationBell() {
  const { items, unread, hasMore, markRead, markAllRead, loadMore, setChatOpen, status } = useLive()
  const { open, setOpen, ref } = useDropdown()
  const [tab, setTab] = useState('all')
  const navigate = useNavigate()
  const shown = tab === 'unread' ? items.filter((n) => !n.is_read) : items

  function openItem(n) {
    if (!n.is_read) markRead(n.id)
    setOpen(false)
    if (n.link?.startsWith('?chat')) setChatOpen(true)
    else if (n.link) navigate(n.link)
  }

  return (
    <div ref={ref} className="relative">
      <button
        className={`relative grid h-10 w-10 place-items-center rounded-full transition ${open ? 'bg-brand/20 text-brand' : 'bg-surface-2 hover:bg-line'}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-bg">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={panel} role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="font-display text-2xl">Notifications</h2>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-brand hover:bg-surface-2">
                <CheckCheck className="h-4 w-4" /> Mark all as read
              </button>
            )}
          </div>
          <div className="flex gap-1 px-4 py-3">
            {['all', 'unread'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${tab === t ? 'bg-brand/15 text-brand' : 'text-muted hover:bg-surface-2'}`}
              >
                {t}
              </button>
            ))}
            <span className={`ml-auto self-center text-[10px] ${status === 'online' ? 'text-emerald-400' : 'text-muted'}`}>
              ● {status === 'online' ? 'Live' : 'Connecting…'}
            </span>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto px-2 pb-2">
            {shown.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted">
                <Bell className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {tab === 'unread' ? "You're all caught up." : 'No notifications yet.'}
              </li>
            )}
            {shown.map((n) => {
              const [Icon, color] = KIND_ICON[n.kind] || [Bell, 'bg-muted']
              return (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-surface-2"
                  >
                    <span className={`bevel-3d grid h-11 w-11 shrink-0 place-items-center rounded-full text-white ${color}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-snug ${n.is_read ? 'text-muted' : 'font-semibold'}`}>{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
                      <span className={`mt-1 block text-xs ${n.is_read ? 'text-muted' : 'font-semibold text-brand'}`}>
                        {timeAgo(n.created_at)}
                      </span>
                    </span>
                    {!n.is_read && <span className="mt-4 h-3 w-3 shrink-0 rounded-full bg-brand" aria-label="unread" />}
                  </button>
                </li>
              )
            })}
            {hasMore && tab === 'all' && (
              <li>
                <button onClick={loadMore} className="btn-ghost mt-1 w-full !py-2 text-sm">
                  See previous notifications
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Avatar button with the account menu. */
export function ProfileMenu() {
  const { user, isAdmin, logout } = useAuth()
  const { setChatOpen } = useLive()
  const { open, setOpen, ref } = useDropdown()
  const navigate = useNavigate()
  const go = (to) => {
    setOpen(false)
    navigate(to)
  }

  const row = 'group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium transition hover:bg-surface-2'
  const icon = 'tile-3d grid h-9 w-9 place-items-center rounded-full'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full ring-2 transition ${open ? 'ring-brand' : 'ring-transparent hover:ring-line'}`}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <Avatar user={user} size="h-10 w-10" />
      </button>
      {open && (
        <div className={`${panel} p-2`} role="menu">
          <button onClick={() => go('/profile')} className="card mb-2 flex w-full items-center gap-3 p-3 text-left shadow-md hover:bg-surface-2">
            <Avatar user={user} size="h-11 w-11" text="text-base" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{fullName(user)}</span>
              <span className="block truncate text-xs text-muted">{user.email}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted" />
          </button>
          <button className={row} onClick={() => go('/profile')}>
            <span className={icon}><UserRound className="h-5 w-5" /></span> Edit profile
          </button>
          {isAdmin && (
            <button className={row} onClick={() => go('/admin')}>
              <span className={icon}><LayoutDashboard className="h-5 w-5" /></span> Studio &amp; admin
            </button>
          )}
          <button className={row} onClick={() => go('/purchases')}>
            <span className={icon}><ReceiptText className="h-5 w-5" /></span> My purchases
          </button>
          <button className={row} onClick={() => go('/settings')}>
            <span className={icon}><SettingsIcon className="h-5 w-5" /></span> Settings &amp; display
          </button>
          {!isAdmin && (
            <button
              className={row}
              onClick={() => {
                setOpen(false)
                setChatOpen(true)
              }}
            >
              <span className={icon}><LifeBuoy className="h-5 w-5" /></span> Help &amp; support
            </button>
          )}
          <button
            className={row}
            onClick={async () => {
              setOpen(false)
              await logout()
              navigate('/')
            }}
          >
            <span className={icon}><LogOut className="h-5 w-5" /></span> Log out
          </button>
          <p className="px-3 pt-2 pb-1 text-[11px] text-muted">
            <Link to="/#about" onClick={() => setOpen(false)} className="hover:underline">About</Link> · Publish Stories
          </p>
        </div>
      )}
    </div>
  )
}
