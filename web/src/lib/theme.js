import { useSyncExternalStore } from 'react'

export const THEMES = [
  { id: 'light', label: 'Light', swatch: '#f7f5fc' },
  { id: 'dark', label: 'Dark', swatch: '#0e0b1a' },
  { id: 'sepia', label: 'Sepia', swatch: '#efe4cc' },
]

const META_COLORS = Object.fromEntries(THEMES.map((t) => [t.id, t.swatch]))
const listeners = new Set()

function stored() {
  try {
    return localStorage.getItem('theme')
  } catch {
    return null
  }
}

let current = META_COLORS[stored()] ? stored() : 'dark'
apply(current)

function apply(theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme])
}

/** Applies instantly; the caller also persists it to the account when signed in. */
export function setTheme(theme) {
  if (!META_COLORS[theme] || theme === current) return
  current = theme
  apply(theme)
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener())
}

export function useTheme() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
