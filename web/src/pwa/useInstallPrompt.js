import { useCallback, useEffect, useState } from 'react'

const INSTALLED_KEY = 'pwa-installed'
const DISMISSED_KEY = 'pwa-install-dismissed-at'
const SNOOZE_MS = 7 * 24 * 3600 * 1000

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

/** True when the page itself is running as the installed app. */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true // iOS Safari home-screen app
  )
}

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS reports as Mac

/**
 * Decides whether to offer installation. Several signals mean "already installed,
 * don't ask":
 *  1. we're running in standalone mode (opened from the home screen / app list);
 *  2. the browser fired `appinstalled` earlier (remembered in localStorage);
 *  3. navigator.getInstalledRelatedApps() lists this PWA (Chromium on Android/desktop);
 *  4. Chromium never fires `beforeinstallprompt` for an installed app, so on those
 *     browsers the button only appears when installation is actually possible.
 * If `beforeinstallprompt` does fire, the app was uninstalled, so the remembered
 * flag is cleared. iOS has no install API, so it gets Share → Add to Home Screen steps.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [installed, setInstalled] = useState(() => isStandalone() || read(INSTALLED_KEY) === '1')
  const [dismissed, setDismissed] = useState(() => Date.now() - Number(read(DISMISSED_KEY) || 0) < SNOOZE_MS)

  useEffect(() => {
    if (isStandalone()) {
      write(INSTALLED_KEY, '1')
      return
    }
    const onPrompt = (event) => {
      event.preventDefault() // we show our own UI instead of the mini-infobar
      write(INSTALLED_KEY, null)
      setInstalled(false)
      setDeferred(event)
    }
    const onInstalled = () => {
      write(INSTALLED_KEY, '1')
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    navigator.getInstalledRelatedApps?.()
      .then((apps) => {
        if (apps.length) onInstalled()
      })
      .catch(() => {})

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return false
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    if (outcome === 'accepted') {
      write(INSTALLED_KEY, '1')
      setInstalled(true)
    }
    return outcome === 'accepted'
  }, [deferred])

  const dismiss = useCallback(() => {
    write(DISMISSED_KEY, String(Date.now()))
    setDismissed(true)
  }, [])

  const ios = isIos() && !installed
  return {
    /** Show the install banner/button. */
    canInstall: !installed && (Boolean(deferred) || ios),
    /** Banner may auto-appear (not snoozed). The header button ignores the snooze. */
    showBanner: !installed && !dismissed && (Boolean(deferred) || ios),
    iosInstructions: ios && !deferred,
    installed,
    install,
    dismiss,
  }
}
