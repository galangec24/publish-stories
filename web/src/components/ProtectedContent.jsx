import { useEffect, useState } from 'react'

/**
 * Anti-capture wrapper for story text on the web.
 *
 * Browsers expose no API to block screenshots, so this is a deterrent:
 *  - the content is covered whenever the window loses focus or the tab is hidden.
 *    Win+Shift+S opens Snipping Tool, which takes focus, so the snip shows the
 *    cover, the same as if the reader had switched to another tab;
 *  - Print Screen / macOS screenshot shortcuts trigger the cover and overwrite the clipboard;
 *  - printing, saving, copying, right-click, long-press and text selection are disabled;
 *  - phones: covered when the page goes to the background (before the app-switcher
 *    snapshot) and on a three-finger touch, the screenshot gesture on many Android phones.
 * Mobile browsers give no signal for iPhone screenshots or screen recording, so those can't
 * be stopped here; the Android app (frontend/lib/security) blocks them with FLAG_SECURE.
 * The real protection is server-side: locked readers never receive the full text.
 */
export function ProtectedContent({ children }) {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && !document.hasFocus())

  useEffect(() => {
    document.body.classList.add('protected')
    let timer
    const hide = () => {
      clearTimeout(timer)
      setHidden(true)
    }
    const show = () => setHidden(!document.hasFocus() || document.hidden)
    // Coming back to the window: wait a moment before showing the text. Snipping Tool's "New"
    // briefly hands focus back to the browser right before it freezes the screen, so an instant
    // reveal would be captured. A click or tap on the page (a real reader) shows it at once.
    const showSoon = () => {
      clearTimeout(timer)
      timer = setTimeout(show, 1500)
    }
    const onVisibility = () => (document.hidden ? hide() : showSoon())
    const onPointer = () => {
      if (!document.hidden && document.hasFocus()) {
        clearTimeout(timer)
        show()
      }
    }
    const onKey = (e) => {
      const key = e.key
      // Windows / Cmd key: every screenshot shortcut starts with it (Win+Shift+S, Cmd+Shift+3/4/5),
      // so cover the text before the shortcut completes and the screen is frozen.
      if (key === 'Meta' || key === 'OS') {
        if (e.type === 'keydown') hide()
        else showSoon()
        return
      }
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
    // Three fingers on the screen: many Android phones take a screenshot with that swipe.
    const onTouch = (e) => {
      if (e.touches.length >= 3) {
        hide()
        clearTimeout(timer)
        timer = setTimeout(show, 2500)
      }
    }

    window.addEventListener('blur', hide)
    window.addEventListener('focus', showSoon)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', hide) // leaving / app switcher snapshot
    document.addEventListener('freeze', hide)
    window.addEventListener('pageshow', showSoon)
    document.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey) // browsers report PrintScreen only on keyup
    document.addEventListener('contextmenu', block)
    document.addEventListener('copy', block)
    document.addEventListener('dragstart', block)
    return () => {
      clearTimeout(timer)
      document.body.classList.remove('protected')
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', showSoon)
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', hide)
      document.removeEventListener('freeze', hide)
      window.removeEventListener('pageshow', showSoon)
      document.removeEventListener('touchstart', onTouch)
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

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" className="mx-auto h-12 w-12 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-0.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4" strokeLinecap="round" />
  </svg>
)
