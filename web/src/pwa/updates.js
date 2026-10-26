import { registerSW } from 'virtual:pwa-register'

// A new site version installs in the background. If it's found right after the page opens
// (e.g. the reader pressed refresh), it takes over straight away; later it waits for the
// next page change inside the site, so nobody is reloaded in the middle of a chapter.
const OPENED_AT = Date.now()
const TAKE_OVER_RIGHT_AWAY_MS = 8000
let waiting = false

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    waiting = true
    if (Date.now() - OPENED_AT < TAKE_OVER_RIGHT_AWAY_MS) applyWaitingUpdate()
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    registration.update().catch(() => {}) // look for a new version as soon as the page opens
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
  },
})

export function applyWaitingUpdate() {
  if (!waiting) return
  waiting = false
  updateSW(true)
}
