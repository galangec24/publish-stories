import { NavLink, Route, Routes } from 'react-router-dom'

import { BulkImport } from './BulkImport'
import { Columns, Genres, Payments } from './Managers'
import { StoryList } from './StoryList'
import { StoryStudio } from './StoryStudio'

const SECTIONS = [
  { to: '/admin', label: 'Stories', icon: '📚', end: true },
  { to: '/admin/import', label: 'Bulk import', icon: '⬆️' },
  { to: '/admin/genres', label: 'Genres', icon: '🏷️' },
  { to: '/admin/columns', label: 'Columns', icon: '🗂️' },
  { to: '/admin/payments', label: 'Payments', icon: '🧾' },
]

function AdminShell({ children }) {
  return (
    <div className="grid gap-6 pt-8 md:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={s.end}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                isActive ? 'bg-brand/15 font-semibold text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`
            }
          >
            <span aria-hidden>{s.icon}</span>
            {s.label}
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
      <Route path="genres" element={<AdminShell><Genres /></AdminShell>} />
      <Route path="columns" element={<AdminShell><Columns /></AdminShell>} />
      <Route path="payments" element={<AdminShell><Payments /></AdminShell>} />
      <Route index element={<AdminShell><StoryList /></AdminShell>} />
    </Routes>
  )
}
