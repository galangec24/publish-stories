import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api, ApiError, clearTokens, hasSession, refreshToken, saveTokens, setSessionExpiredHandler } from './api'

const AuthContext = createContext(null)

export class EmailNotVerified extends Error {
  constructor(email) {
    super('Verify your email first.')
    this.email = email
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  const refreshMe = useCallback(async () => {
    const me = await api.get('user/me/')
    setUser(me)
    return me
  }, [])

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
    if (!hasSession()) {
      setReady(true)
      return
    }
    refreshMe()
      .catch((e) => {
        if (e instanceof ApiError) clearTokens()
      })
      .finally(() => setReady(true))
  }, [refreshMe])

  const accept = useCallback((data) => {
    saveTokens(data.access, data.refresh)
    setUser(data.user)
    return data.user
  }, [])

  const value = useMemo(
    () => ({
      user,
      ready,
      isAdmin: Boolean(user?.is_admin),
      refreshMe,
      async login(email, password) {
        try {
          return accept(await api.post('auth/login/', { email, password }))
        } catch (e) {
          if (e instanceof ApiError && e.code === 'email_not_verified') throw new EmailNotVerified(email)
          throw e
        }
      },
      register: (email, password, display_name) => api.post('auth/register/', { email, password, display_name }),
      verifyEmail: async (email, code) => accept(await api.post('auth/verify-email/', { email, code })),
      resendCode: (email, purpose = 'verify_email') => api.post('auth/resend-code/', { email, purpose }),
      requestReset: (email) => api.post('auth/password/reset/', { email }),
      confirmReset: async (email, code, new_password) =>
        accept(await api.post('auth/password/reset/confirm/', { email, code, new_password })),
      /** `credential` is the ID token from Google Identity Services. */
      googleLogin: async (credential) => accept(await api.post('auth/google/', { id_token: credential })),
      async saveGenres(genreIds) {
        await api.put('user/genres/', { genre_ids: genreIds })
        return refreshMe()
      },
      async setTheme(theme_name) {
        setUser((u) => (u ? { ...u, theme: theme_name } : u))
        if (user) await api.put('user/theme/', { theme_name })
      },
      async logout() {
        const refresh = refreshToken()
        if (refresh) await api.post('auth/logout/', { refresh }).catch(() => {})
        clearTokens()
        window.google?.accounts?.id?.disableAutoSelect?.()
        setUser(null)
      },
    }),
    [user, ready, refreshMe, accept],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
