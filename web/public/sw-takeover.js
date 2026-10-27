// Loaded by the service worker (vite.config.js, workbox.importScripts).
// When a new site version takes over, it asks every open page whether it's running a current
// version. Pages that don't answer within a few seconds are an older copy (possibly one that
// crashed into a white page), so they are reloaded onto the new version without anyone pressing
// refresh. Current pages answer (src/pwa/updates.js) and are left alone.
const answered = new Set()

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'STORIES_ALIVE' && event.source) answered.add(event.source.id)
})

self.addEventListener('activate', () => {
  setTimeout(async () => {
    await self.clients.claim().catch(() => {})
    const pages = await self.clients.matchAll({ type: 'window' })
    pages.forEach((page) => page.postMessage({ type: 'STORIES_PING' }))
    setTimeout(() => {
      pages
        .filter((page) => !answered.has(page.id))
        .forEach((page) => page.navigate(page.url).catch(() => {}))
    }, 3000)
  }, 0)
})
