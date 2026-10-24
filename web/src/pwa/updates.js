import { registerSW } from 'virtual:pwa-register'

// A new site version installs in the background and waits. It takes over at the
// next page change inside the site, so nobody is reloaded in the middle of a chapter.
let waiting = false

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    waiting = true
  },
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
  },
})

export function applyWaitingUpdate() {
  if (!waiting) return
  waiting = false
  updateSW(true)
}
