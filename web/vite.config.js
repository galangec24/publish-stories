import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const SITE = 'https://publish-stories-ph.web.app'

export default defineConfig({
  // Run on older Macs and phones too (Safari 14+), not only the newest browsers.
  build: { target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'] },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt', // the page switches versions itself (src/pwa/updates.js)
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Publish Stories',
        short_name: 'Stories',
        description: 'Stories from Filipino writers. Free columns, previews, and full stories unlocked with QR Ph.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0e0b1a',
        theme_color: '#0e0b1a',
        categories: ['books', 'entertainment'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Lets navigator.getInstalledRelatedApps() report this PWA as installed.
        related_applications: [{ platform: 'webapp', url: `${SITE}/manifest.webmanifest` }],
      },
      workbox: {
        // A new version takes over without waiting for every tab to close, so a stored copy
        // that is too old (or broken) to update itself is still replaced.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Reloads open pages of an older version (e.g. one stuck on a white page): public/sw-takeover.js
        importScripts: ['sw-takeover.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Uploaded pictures have unique ids and never change, so the cached copy is always right.
            // Story text is never cached: it is paywalled per user.
            urlPattern: ({ request, url }) => request.destination === 'image' && url.pathname.startsWith('/api/media/'),
            handler: 'CacheFirst',
            options: { cacheName: 'images', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 } },
          },
          {
            // Anything else (site photos, outside covers) can be replaced under the same name: show the
            // cached copy, then refresh it in the background.
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'site-images', expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
})
