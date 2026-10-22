import './index.css'
import './lib/theme'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { ToastProvider } from './components/ui'
import { AuthProvider } from './lib/auth'
import { InstallProvider } from './pwa/InstallPrompt'
import { LiveProvider } from './realtime/LiveProvider'

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
