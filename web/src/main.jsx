import './index.css'
import './lib/theme'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { ToastProvider } from './components/ui'
import { AuthProvider } from './lib/auth'
import { InstallProvider } from './pwa/InstallPrompt'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <InstallProvider>
            <App />
          </InstallProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
