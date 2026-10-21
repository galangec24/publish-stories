import { useCallback, useState } from 'react'

import { api } from './api'
import { useAuth } from './auth'

export const READING_MODES = [
  { id: 'book', label: 'Book', hint: 'Turn pages: swipe, tap the edges or use ← →' },
  { id: 'scroll', label: 'Long page', hint: 'Scroll through the whole chapter' },
]

function stored() {
  try {
    return localStorage.getItem('reading-mode')
  } catch {
    return null
  }
}

/** The reader's page style. Saved to the account when signed in, else per browser. */
export function useReadingMode() {
  const { user, refreshMe } = useAuth()
  const [guestMode, setGuestMode] = useState(() => stored() || 'scroll')
  const mode = user?.reading_mode || guestMode

  const setMode = useCallback(
    async (next) => {
      try {
        localStorage.setItem('reading-mode', next)
      } catch {
        /* ignore */
      }
      setGuestMode(next)
      if (user) {
        await api.patch('user/me/', { reading_mode: next })
        await refreshMe()
      }
    },
    [user, refreshMe],
  )

  return [mode, setMode]
}

export function formatCount(n) {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}
