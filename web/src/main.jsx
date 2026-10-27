import './index.css'
import './lib/theme'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './pwa/updates'

import App from './App'
import { ToastProvider } from './components/ui'
import { AuthProvider } from './lib/auth'
import { InstallProvider } from './pwa/InstallPrompt'
import { LiveProvider } from './realtime/LiveProvider'

// A page file missing after a release (stale stored copy): fetch the new version instead of failing.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  let tried = false
  try {
    tried = sessionStorage.getItem('chunk-retry') === '1'
    sessionStorage.setItem('chunk-retry', '1')
  } catch {
    /* ignore */
  }
  if (!tried) (window.__clearSiteCopy?.() ?? Promise.resolve()).then(() => window.location.reload())
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <LiveProvider>
            <InstallProvider>
              <App />
            </InstallProvider>
          </LiveProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Tells the safety net in index.html that the app started.
window.__storiesStarted = true
try {
  sessionStorage.removeItem('start-retry')
} catch {
  /* ignore */
}
