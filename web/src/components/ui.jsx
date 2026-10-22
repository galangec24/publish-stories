import { Check } from 'lucide-react'
import { createContext, useCallback, useContext, useState } from 'react'

export function Spinner({ className = '' }) {
  return (
    <div className={`flex justify-center py-16 ${className}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  )
}

export function GenreChips({ genres, selected, onToggle, by = 'id' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {genres.map((g) => {
        const on = selected.has(g[by])
        return (
          <button
            type="button"
            key={g.id}
            onClick={() => onToggle(g[by])}
            className="chip"
            style={{
              borderColor: `color-mix(in srgb, ${g.color} 60%, transparent)`,
              background: on ? `color-mix(in srgb, ${g.color} 28%, transparent)` : 'transparent',
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
            {g.name}
            {on && <Check className="h-3.5 w-3.5" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

export function GenreTags({ genres }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {genres.map((g) => (
        <span
          key={g.id}
          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ color: g.color, background: `color-mix(in srgb, ${g.color} 16%, transparent)` }}
        >
          {g.name}
        </span>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const toast = useCallback((message, tone = 'info') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message: String(message?.message || message), tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card animate-float-up px-4 py-3 text-sm ${t.tone === 'error' ? 'border-red-500/50' : ''}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
