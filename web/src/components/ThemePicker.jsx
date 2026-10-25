import { useAuth } from '../lib/auth'
import { setTheme, THEMES, useTheme } from '../lib/theme'

/** Light / Dark / Sepia swatches. Applies at once; signed-in readers keep it on every device. */
export function ThemePicker({ compact = false }) {
  const theme = useTheme()
  const { user, setTheme: saveToAccount } = useAuth()

  function pick(id) {
    setTheme(id)
    if (user) saveToAccount(id).catch(() => {})
  }

  return (
    <div className={`grid grid-cols-3 gap-1 ${compact ? '' : 'rounded-xl border border-line p-1'}`} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => pick(t.id)}
          title={`${t.label} theme`}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition ${
            theme === t.id ? 'bg-brand text-white shadow' : 'text-muted hover:text-ink'
          }`}
        >
          <span className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: t.swatch }} />
          {!compact && t.label}
        </button>
      ))}
    </div>
  )
}
