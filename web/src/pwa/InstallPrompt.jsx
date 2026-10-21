import { createContext, useContext, useState } from 'react'

import { useInstallPrompt } from './useInstallPrompt'

const InstallContext = createContext(null)

export function InstallProvider({ children }) {
  const value = useInstallPrompt()
  const [showIos, setShowIos] = useState(false)
  return (
    <InstallContext.Provider value={{ ...value, showIos, setShowIos }}>
      {children}
      <InstallBanner />
      {showIos && <IosSheet onClose={() => setShowIos(false)} />}
    </InstallContext.Provider>
  )
}

export const useInstall = () => useContext(InstallContext)

/** Header button. Renders nothing when the app is installed or can't be installed. */
export function InstallButton({ className = '' }) {
  const { canInstall, install, iosInstructions, setShowIos } = useInstall()
  if (!canInstall) return null
  return (
    <button
      className={`btn-ghost !px-3 !py-1.5 ${className}`}
      onClick={() => (iosInstructions ? setShowIos(true) : install())}
      title="Install the app on this device"
    >
      <DownloadIcon /> <span className="hidden sm:inline">Install app</span>
    </button>
  )
}

function InstallBanner() {
  const { showBanner, install, dismiss, iosInstructions, setShowIos } = useInstall()
  if (!showBanner) return null
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md animate-float-up sm:bottom-5">
      <div className="card flex items-center gap-3 p-3 pr-2">
        <img src="/icon.svg" alt="" className="h-12 w-12 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Install Publish Stories</p>
          <p className="text-sm text-muted">Read offline-ready, full screen, one tap from your home screen.</p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            className="btn-primary !px-3 !py-1.5"
            onClick={() => (iosInstructions ? setShowIos(true) : install())}
          >
            Install
          </button>
          <button className="text-xs text-muted hover:text-ink" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

function IosSheet({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <div className="card w-full max-w-sm animate-float-up p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl">Add to Home Screen</h2>
        <ol className="mt-3 space-y-2 text-sm">
          <li>
            1. Tap the <strong>Share</strong> button <ShareIcon /> in Safari&apos;s toolbar.
          </li>
          <li>
            2. Scroll and choose <strong>Add to Home Screen</strong>.
          </li>
          <li>
            3. Tap <strong>Add</strong>. Open Publish Stories from your home screen from now on.
          </li>
        </ol>
        <button className="btn-primary mt-5 w-full" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
