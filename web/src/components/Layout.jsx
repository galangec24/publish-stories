import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { LanguagePicker } from '../i18n/LanguagePicker'
import { useAuth } from '../lib/auth'
import { InstallButton } from '../pwa/InstallPrompt'

export function Layout() {
  const { user, isAdmin } = useAuth()
  const { pathname, hash } = useLocation()

  // In-page links such as /#about: scroll once the target has rendered.
  useEffect(() => {
    if (!hash) return
    const id = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }))
    return () => cancelAnimationFrame(id)
  }, [pathname, hash])
  // The Studio is a full-screen workspace with its own chrome.
  const bare = /^\/admin\/stories\/\d+/.test(pathname)

  return (
    <div className="min-h-screen">
      {!bare && (
        <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
            <Link to="/" className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl shadow-lg shadow-brand/30" />
              <span className="notranslate font-display text-xl tracking-tight" translate="no">
                Publish <span className="text-accent">Stories</span>
              </span>
            </Link>
            <nav className="ml-auto flex items-center gap-2">
              <Link to="/#about" className="hidden px-2 text-sm text-muted hover:text-ink md:inline">
                About
              </Link>
              <LanguagePicker />
              <InstallButton />
              {isAdmin && (
                <NavLink to="/admin" className="btn-ghost !px-3 !py-1.5">
                  Studio
                </NavLink>
              )}
              {user ? (
                <Link to="/settings" className="flex items-center gap-2 rounded-full p-1 pr-3 hover:bg-surface-2">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-brand font-semibold text-white">
                      {(user.display_name || user.email)[0].toUpperCase()}
                    </span>
                  )}
                  <span className="hidden text-sm sm:inline">{user.display_name || 'Account'}</span>
                </Link>
              ) : (
                <>
                  <Link to="/settings" className="btn-ghost !px-3 !py-1.5" title="Theme">
                    Aa
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
      <main className={bare ? '' : 'mx-auto max-w-7xl px-4 pb-24'}>
        <Outlet />
      </main>
    </div>
  )
}
