import { Eye, EyeOff, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Open modals, top last, so Esc only closes the one on top.
const stack = []

/** Accessible modal: Esc / backdrop closes, focus moves inside, page scroll is locked. */
export function Modal({ open, onClose, title, subtitle, icon: Icon, children, footer, size = 'max-w-lg' }) {
  const panel = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const token = {}
    stack.push(token)
    const onKey = (e) => e.key === 'Escape' && stack[stack.length - 1] === token && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus the first field (or the panel) when opening.
    requestAnimationFrame(() => (panel.current?.querySelector('input, textarea, select, button[data-autofocus]') || panel.current)?.focus())
    return () => {
      stack.splice(stack.indexOf(token), 1)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full ${size} animate-[modal-in_0.28s_cubic-bezier(0.2,0.8,0.2,1)] flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl outline-none sm:rounded-3xl`}
      >
        <header className="flex items-start gap-3 border-b border-line/70 px-6 pt-5 pb-4">
          {Icon && (
            <span className="tile-3d grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-2xl leading-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 bg-surface-2/40 px-6 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Text box with an icon inside. `type="password"` gets a show/hide toggle.
 * Extra props go to the <input> (or <textarea> when `multiline`).
 */
export function IconInput({ icon: Icon, label, hint, error, type = 'text', multiline = false, className = '', ...props }) {
  const id = useId()
  const [reveal, setReveal] = useState(false)
  const isPassword = type === 'password'
  const Field = multiline ? 'textarea' : 'input'
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
      )}
      <div className="group relative">
        {Icon && (
          <Icon
            className={`pointer-events-none absolute left-3.5 h-5 w-5 text-muted transition group-focus-within:text-brand ${multiline ? 'top-3' : 'top-1/2 -translate-y-1/2'}`}
            aria-hidden
          />
        )}
        <Field
          id={id}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={Boolean(error)}
          className={`input ${Icon ? '!pl-11' : ''} ${isPassword ? '!pr-11' : ''} ${error ? '!border-rose-400' : ''} ${multiline ? 'min-h-24 resize-y' : ''}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
            aria-label={reveal ? 'Hide password' : 'Show password'}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}
