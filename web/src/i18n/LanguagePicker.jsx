import { Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useToast } from '../components/ui'
import { api } from '../lib/api'
import { onTranslatorStatus, setLanguage } from './liveTranslator'

// Shown immediately; replaced by the server's list (which may add languages).
const FALLBACK = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'fil', name: 'Filipino', native: 'Filipino' },
  { code: 'ceb', name: 'Cebuano', native: 'Bisaya' },
]

function storedLang() {
  try {
    return localStorage.getItem('lang') || 'en'
  } catch {
    return 'en'
  }
}

// Apply the saved language as soon as the app loads.
const initial = storedLang()
if (initial !== 'en') setLanguage(initial)

/** Globe button in the header; translates the whole app live. */
export function LanguagePicker() {
  const toast = useToast()
  const [languages, setLanguages] = useState(FALLBACK)
  const [lang, setLang] = useState(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    api
      .get('translate/languages/')
      .then((d) => setLanguages(d.languages))
      .catch(() => {})
    return onTranslatorStatus(({ busy: b, error }) => {
      setBusy(Boolean(b))
      if (error) toast(error, 'error')
    })
  }, [toast])

  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function choose(code) {
    setLang(code)
    setOpen(false)
    try {
      localStorage.setItem('lang', code)
    } catch {
      /* ignore */
    }
    setLanguage(code)
  }

  const current = languages.find((l) => l.code === lang) || FALLBACK[0]
  return (
    <div ref={box} className="relative" translate="no">
      <button
        className="btn-ghost !px-3 !py-1.5"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Language"
      >
        <Globe className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
        <span className="hidden text-xs sm:inline">{current.native}</span>
      </button>
      {open && (
        <ul role="listbox" className="card absolute right-0 z-50 mt-2 max-h-80 w-52 overflow-y-auto p-1.5 animate-float-up">
          {languages.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={l.code === lang}
                onClick={() => choose(l.code)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  l.code === lang ? 'bg-brand/15 font-semibold' : 'hover:bg-surface-2'
                }`}
              >
                <span>{l.native}</span>
                <span className="text-xs text-muted">{l.name}</span>
              </button>
            </li>
          ))}
          <li className="px-3 pt-2 pb-1 text-[11px] text-muted">Machine translation · stories included</li>
        </ul>
      )}
    </div>
  )
}
