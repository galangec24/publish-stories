import './index.css'
import './lib/theme'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'

import App from './App'
import { ToastProvider } from './components/ui'
import { AuthProvider } from './lib/auth'
import { InstallProvider } from './pwa/InstallPrompt'
import { LiveProvider } from './realtime/LiveProvider'

// New site versions take over right away (the page reloads once), and open tabs check hourly.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
  },
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
