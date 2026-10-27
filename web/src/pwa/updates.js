import { registerSW } from 'virtual:pwa-register'

// A new site version installs in the background and takes over by itself (skipWaiting in
// vite.config.js), so even a stored copy too old or broken to update itself gets replaced.
// If that happens right after the page opens (e.g. the reader pressed refresh), the page
// reloads straight away; later it waits for the next page change inside the site, so nobody
// is reloaded in the middle of a chapter.
const OPENED_AT = Date.now()
const TAKE_OVER_RIGHT_AWAY_MS = 8000
let waiting = false
let reloading = false

function reload() {
  if (reloading) return
  reloading = true
  window.location.reload()
}

if ('serviceWorker' in navigator) {
  // Tell a newly arrived version this page is current, so it isn't reloaded (public/sw-takeover.js).
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'STORIES_PING') event.source?.postMessage({ type: 'STORIES_ALIVE' })
  })
  navigator.serviceWorker.startMessages?.()

  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return // first visit: this page is already the newest version
    if (Date.now() - OPENED_AT < TAKE_OVER_RIGHT_AWAY_MS) reload()
    else waiting = true
  })
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    registration.update().catch(() => {}) // look for a new version as soon as the page opens
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
  },
})

export function applyWaitingUpdate() {
  if (waiting) reload()
}
