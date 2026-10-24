import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import { setTheme } from './lib/theme'
import { Home } from './pages/Home'
import { Login, Register, ResetPassword, VerifyEmail } from './pages/auth'
import { Privacy, Terms } from './pages/Legal'
import { Onboarding } from './pages/Onboarding'
import { Profile } from './pages/Profile'
import { Settings } from './pages/Settings'
import { StoryPage } from './pages/StoryPage'
import { applyWaitingUpdate } from './pwa/updates'

// The admin area pulls in Quill; load it only for admins.
const Admin = lazy(() => import('./pages/admin/AdminRoutes'))

export default function App() {
  const { user, ready, isAdmin } = useAuth()
  const location = useLocation()

  // A new site version that's waiting takes over when the reader moves to another page.
  useEffect(() => {
    applyWaitingUpdate()
  }, [location.pathname])

  // The account's theme follows the reader across devices.
  useEffect(() => {
    if (user?.theme) setTheme(user.theme)
  }, [user?.theme])

  if (!ready) return <Spinner className="min-h-screen items-center" />

  // Signed-in readers who haven't picked genres yet go through onboarding first.
  if (user && !user.onboarded && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="stories/:slug" element={<StoryPage />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="verify" element={<VerifyEmail />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="welcome" element={user ? <Onboarding /> : <Navigate to="/login" replace />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route
          path="admin/*"
          element={
            isAdmin ? (
              <Suspense fallback={<Spinner />}>
                <Admin />
              </Suspense>
            ) : (
              <Navigate to={user ? '/' : '/login'} replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
