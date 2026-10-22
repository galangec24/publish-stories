import { Info, LayoutDashboard, SunMoon } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'

import { LanguagePicker } from '../i18n/LanguagePicker'
import { useAuth } from '../lib/auth'
import { InstallButton } from '../pwa/InstallPrompt'
import { useLive } from '../realtime/LiveProvider'
import { SupportChat } from './SupportChat'
import { NotificationBell, ProfileMenu } from './HeaderMenus'

const Background3D = lazy(() => import('./Background3D'))

export function Layout() {
  const { user, isAdmin } = useAuth()
  const { setChatOpen } = useLive()
  const { pathname, hash } = useLocation()
  const [params, setParams] = useSearchParams()

  // In-page links such as /#about: scroll once the target has rendered.
  useEffect(() => {
    if (!hash) return
    const id = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }))
    return () => cancelAnimationFrame(id)
  }, [pathname, hash])

  // Links like "?chat=open" (from notifications or emails) open the support chat.
  useEffect(() => {
    if (params.get('chat') === 'open') {
      setChatOpen(true)
      params.delete('chat')
      setParams(params, { replace: true })
    }
  }, [params, setParams, setChatOpen])

  // The Studio is a full-screen workspace with its own chrome.
  const bare = /^\/admin\/stories\/\d+/.test(pathname)

  return (
    <div className="relative min-h-screen">
      {!bare && (
        <Suspense fallback={null}>
          <Background3D />
        </Suspense>
      )}
      {!bare && (
        <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4">
            <Link to="/" className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl shadow-lg shadow-brand/30" />
              <span className="notranslate hidden font-display text-xl tracking-tight sm:inline" translate="no">
                Publish <span className="text-accent">Stories</span>
              </span>
            </Link>
            <nav className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <Link to="/#about" className="hidden items-center gap-1.5 px-2 text-sm text-muted hover:text-ink md:flex">
                <Info className="h-4 w-4" /> About
              </Link>
              <LanguagePicker />
              <InstallButton />
              {isAdmin && (
                <NavLink to="/admin" className="btn-ghost hidden !px-3 !py-1.5 sm:inline-flex">
                  <LayoutDashboard className="h-4 w-4" /> Studio
                </NavLink>
              )}
              {user ? (
                <>
                  <NotificationBell />
                  <ProfileMenu />
                </>
              ) : (
                <>
                  <Link to="/settings" className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 hover:bg-line" title="Theme & display">
                    <SunMoon className="h-5 w-5" />
                  </Link>
                  <Link to="/login" className="btn-primary !px-4 !py-1.5">
                    Sign in
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
      )}
      <main className={bare ? '' : 'relative mx-auto max-w-7xl px-4 pb-24'}>
        <Outlet />
      </main>
      {!bare && (
        <footer className="relative border-t border-line/60 py-8 text-center text-sm text-muted">
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link to="/#about" className="hover:text-ink">About</Link>
            <Link to="/privacy" className="hover:text-ink">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-ink">Terms of Service</Link>
          </nav>
          <p className="mt-3 text-xs">
            &copy; {new Date().getFullYear()} <span className="notranslate" translate="no">Publish Stories</span> · Stories by Maria Gemima Valderrama
          </p>
        </footer>
      )}
      {!bare && !isAdmin && <SupportChat />}
    </div>
  )
}
