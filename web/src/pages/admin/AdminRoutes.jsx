import { BarChart3, FileUp, FolderKanban, History, Library, MailQuestion, MessageSquareText, MessagesSquare, QrCode, ReceiptText, ScanLine, Tags, UserRoundPen, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

import { api } from '../../lib/api'
import { onLiveEvent } from '../../realtime/LiveProvider'
import { AboutEditor } from './AboutEditor'
import { ActivityLog } from './ActivityLog'
import { BulkImport } from './BulkImport'
import { CommentsAdmin } from './CommentsAdmin'
import { EmailRequests } from './EmailRequests'
import { Columns, Genres, Payments } from './Managers'
import { PaymentMethods, QrPayments } from './QrPayments'
import { SalesReport } from './SalesReport'
import { ReadersMonitor } from './ReadersMonitor'
import { StoryList } from './StoryList'
import { StoryStudio } from './StoryStudio'
import { SupportInbox } from './SupportInbox'

/** Live counts for the sidebar badges (unread chats, pending email requests, QR payments to check). */
function useBadges() {
  const [badges, setBadges] = useState({ support: 0, email: 0, qr: 0 })
  useEffect(() => {
    const load = () =>
      Promise.all([
        api.get('admin/support/'),
        api.get('admin/email-requests/', { status: 'pending' }),
        api.get('admin/payments/manual/', { status: 'pending' }),
      ])
        .then(([s, e, q]) => setBadges({ support: s.unread_total, email: e.pending_count, qr: q.pending_count }))
        .catch(() => {})
    load()
    const offs = ['support.message', 'support.read', 'email_request', 'payments.changed'].map((ev) => onLiveEvent(ev, load))
    return () => offs.forEach((off) => off())
  }, [])
  return badges
}

function AdminShell({ children }) {
  const badges = useBadges()
  const sections = [
    { to: '/admin', label: 'Stories', icon: Library, end: true },
    { to: '/admin/import', label: 'Bulk import', icon: FileUp },
    { to: '/admin/qr-payments', label: 'QR payments', icon: ScanLine, badge: badges.qr },
    { to: '/admin/sales', label: 'Sales report', icon: BarChart3 },
    { to: '/admin/payment-methods', label: 'Your QR codes', icon: QrCode },
    { to: '/admin/readers', label: 'Readers & payments', icon: UsersRound },
    { to: '/admin/support', label: 'Support inbox', icon: MessagesSquare, badge: badges.support },
    { to: '/admin/comments', label: 'Comments', icon: MessageSquareText },
    { to: '/admin/email-requests', label: 'Email requests', icon: MailQuestion, badge: badges.email },
    { to: '/admin/about', label: 'About me', icon: UserRoundPen },
    { to: '/admin/genres', label: 'Genres', icon: Tags },
    { to: '/admin/columns', label: 'Columns', icon: FolderKanban },
    { to: '/admin/payments', label: 'Payment logs', icon: ReceiptText },
    { to: '/admin/activity', label: 'Activity log', icon: History },
  ]
  return (
    <div className="grid gap-6 pt-8 md:grid-cols-[220px_1fr]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {sections.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                isActive ? 'bg-brand/15 font-semibold text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="stories/:id" element={<StoryStudio />} />
      <Route path="import" element={<AdminShell><BulkImport /></AdminShell>} />
      <Route path="qr-payments" element={<AdminShell><QrPayments /></AdminShell>} />
      <Route path="sales" element={<AdminShell><SalesReport /></AdminShell>} />
      <Route path="payment-methods" element={<AdminShell><PaymentMethods /></AdminShell>} />
      <Route path="readers" element={<AdminShell><ReadersMonitor /></AdminShell>} />
      <Route path="support" element={<AdminShell><SupportInbox /></AdminShell>} />
      <Route path="comments" element={<AdminShell><CommentsAdmin /></AdminShell>} />
      <Route path="email-requests" element={<AdminShell><EmailRequests /></AdminShell>} />
      <Route path="about" element={<AdminShell><AboutEditor /></AdminShell>} />
      <Route path="genres" element={<AdminShell><Genres /></AdminShell>} />
      <Route path="columns" element={<AdminShell><Columns /></AdminShell>} />
      <Route path="payments" element={<AdminShell><Payments /></AdminShell>} />
      <Route path="activity" element={<AdminShell><ActivityLog /></AdminShell>} />
      <Route index element={<AdminShell><StoryList /></AdminShell>} />
    </Routes>
  )
}
