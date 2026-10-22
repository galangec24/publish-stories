import { BookOpen, ChevronRight, ScrollText } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { READING_MODES, useReadingMode } from '../lib/readingMode'
import { setTheme, THEMES, useTheme } from '../lib/theme'
import { InstallButton, useInstall } from '../pwa/InstallPrompt'

export function Settings() {
  const { user, logout, setTheme: saveTheme } = useAuth()
  const theme = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const { installed } = useInstall()
  const [mode, setMode] = useReadingMode()

  async function pick(id) {
    setTheme(id)
    try {
      await saveTheme(id)
    } catch (e) {
      toast(e, 'error')
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-10">
      <h1 className="font-display text-3xl">Settings</h1>

      {user && (
        <div className="card flex items-center gap-4 p-5">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-14 w-14 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand text-xl font-semibold text-white">
              {(user.display_name || user.email)[0].toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.display_name || user.email}</p>
            <p className="truncate text-sm text-muted">
              {user.email} · {user.auth_provider === 'google' ? 'Google' : 'Email'}
            </p>
          </div>
        </div>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">Reading theme</h2>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`rounded-xl border p-3 text-sm transition ${
                theme === t.id ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-muted'
              }`}
            >
              <span className="mb-2 block h-10 rounded-lg border border-line" style={{ background: t.swatch }} />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Page style</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {READING_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id).catch((e) => toast(e, 'error'))}
              className={`rounded-xl border p-4 text-left transition ${
                mode === m.id ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-muted'
              }`}
            >
              {m.id === 'book' ? <BookOpen className="h-6 w-6 text-brand" /> : <ScrollText className="h-6 w-6 text-brand" />}
              <p className="mt-2 font-medium">{m.label}</p>
              <p className="text-xs text-muted">{m.hint}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="card flex items-center justify-between p-5">
        <div>
          <h2 className="font-semibold">App</h2>
          <p className="text-sm text-muted">{installed ? 'Installed on this device.' : 'Install for full-screen reading.'}</p>
        </div>
        <InstallButton />
      </section>

      {user && (
        <section className="card divide-y divide-line">
          <Link to="/welcome" className="flex items-center justify-between p-5 hover:bg-surface-2">
            <div>
              <h2 className="font-semibold">Favourite genres</h2>
              <p className="text-sm text-muted">
                {user.preferred_genres?.length ? user.preferred_genres.map((g) => g.name).join(', ') : 'None picked yet'}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted" />
          </Link>
          <button
            className="w-full p-5 text-left font-semibold text-red-400 hover:bg-surface-2"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
          >
            Sign out
          </button>
        </section>
      )}
    </div>
  )
}
