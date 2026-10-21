import { useEffect, useState } from 'react'

/**
 * Anti-capture wrapper for story text on the web.
 *
 * Browsers expose no API to block screenshots, so this is a deterrent:
 *  - the content is covered whenever the window loses focus or the tab is hidden.
 *    Win+Shift+S opens Snipping Tool, which takes focus, so the snip shows the
 *    cover, the same as if the reader had switched to another tab;
 *  - Print Screen / macOS screenshot shortcuts trigger the cover and overwrite the clipboard;
 *  - printing, saving, copying, right-click and text selection are disabled;
 *  - a faint watermark with the reader's email makes leaks traceable.
 * The real protection is server-side: locked readers never receive the full text.
 */
export function ProtectedContent({ watermark, children }) {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && !document.hasFocus())

  useEffect(() => {
    document.body.classList.add('protected')
    let timer
    const hide = () => setHidden(true)
    const show = () => setHidden(!document.hasFocus() || document.hidden)
    const onVisibility = () => (document.hidden ? hide() : show())
    const onKey = (e) => {
      const key = e.key
      const screenshot =
        key === 'PrintScreen' || (e.metaKey && e.shiftKey && ['s', 'S', '3', '4', '5'].includes(key))
      const saveOrPrint = (e.ctrlKey || e.metaKey) && ['p', 'P', 's', 'S'].includes(key)
      if (screenshot) {
        hide()
        navigator.clipboard?.writeText('Screenshots are disabled for this content.').catch(() => {})
        clearTimeout(timer)
        timer = setTimeout(show, 2000)
      }
      if (screenshot || saveOrPrint) e.preventDefault()
    }
    const block = (e) => e.preventDefault()

    window.addEventListener('blur', hide)
    window.addEventListener('focus', show)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey) // browsers report PrintScreen only on keyup
    document.addEventListener('contextmenu', block)
    document.addEventListener('copy', block)
    document.addEventListener('dragstart', block)
    return () => {
      clearTimeout(timer)
      document.body.classList.remove('protected')
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', show)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('copy', block)
      document.removeEventListener('dragstart', block)
    }
  }, [])

  return (
    <div className="relative">
      <div className={hidden ? 'invisible' : ''} aria-hidden={hidden}>
        {children}
      </div>
      {watermark && !hidden && <Watermark text={watermark} />}
      {hidden && (
        <div className="absolute inset-0 z-10 flex min-h-[50vh] items-start justify-center bg-page pt-32">
          <div className="text-center">
            <EyeOffIcon />
            <p className="mt-3 font-display text-xl">Content hidden</p>
            <p className="text-sm text-muted">Click here to keep reading.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Watermark({ text }) {
  const tiles = Array.from({ length: 60 })
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      <div className="grid -rotate-[22deg] grid-cols-3 gap-x-10 gap-y-24 opacity-[0.06] [width:140%] [margin-left:-20%]">
        {tiles.map((_, i) => (
          <span key={i} className="whitespace-nowrap text-sm font-semibold text-page-ink">
            {text}
          </span>
        ))}
      </div>
    </div>
  )
}

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" className="mx-auto h-12 w-12 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-0.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4" strokeLinecap="round" />
  </svg>
)
