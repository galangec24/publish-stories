import { Component } from 'react'

/** Drops the saved copies of pages (they may be from an older version of the site). */
function clearSavedPages() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('cache:'))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage blocked */
  }
}

/**
 * If a page crashes (usually saved data from an older version), clear the saved copies and
 * reload once; if it crashes again, show a short message instead of a white page.
 */
export class CrashRecovery extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error(error)
    let tried = false
    try {
      tried = sessionStorage.getItem('crash-retry') === '1'
      sessionStorage.setItem('crash-retry', '1')
    } catch {
      /* ignore */
    }
    clearSavedPages()
    if (!tried) window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-display text-2xl">Something went wrong</h1>
        <p className="mt-2 text-muted">Please reload the page.</p>
        <button className="btn-primary mt-6" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
