// One WebSocket per tab for live events (notifications, support chat, admin feeds).
//
// The API's JWT access token authenticates the socket. Before every (re)connect
// we call `beforeConnect` (which fetches the notification backlog); that request
// also refreshes an expired access token, so the socket always gets a valid one.
// Reconnects back off from 1 s to 30 s; a ping every 25 s keeps proxies from
// closing an idle connection.

import { accessToken, API_BASE } from '../lib/api'

const WS_URL = `${API_BASE.replace(/^http/, 'ws').replace(/\/api$/, '')}/ws/`

const listeners = new Map() // event → Set<fn>
let socket = null
let wanted = false
let attempt = 0
let retryTimer = 0
let pingTimer = 0
let beforeConnect = async () => {}
let statusListener = () => {}

function emit(event, data) {
  listeners.get(event)?.forEach((fn) => fn(data))
  listeners.get('*')?.forEach((fn) => fn(event, data))
}

/** Subscribe to a server event ("notification", "support.message", …). Returns an unsubscribe fn. */
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(fn)
  return () => listeners.get(event).delete(fn)
}

async function open() {
  if (!wanted) return
  try {
    await beforeConnect()
  } catch {
    /* offline or signed out; retry below */
  }
  const token = accessToken()
  if (!wanted || !token) return scheduleRetry()

  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
  socket = ws
  ws.onopen = () => {
    attempt = 0
    statusListener('online')
    clearInterval(pingTimer)
    pingTimer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'ping' })), 25_000)
  }
  ws.onmessage = (e) => {
    try {
      const { event, data } = JSON.parse(e.data)
      if (event !== 'pong') emit(event, data)
    } catch {
      /* ignore malformed frames */
    }
  }
  ws.onclose = () => {
    clearInterval(pingTimer)
    if (socket === ws) socket = null
    statusListener('offline')
    scheduleRetry()
  }
}

function scheduleRetry() {
  if (!wanted) return
  clearTimeout(retryTimer)
  const delay = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500
  retryTimer = setTimeout(open, delay)
}

/** Start (or keep) the live connection for the signed-in user. */
export function connect({ onBeforeConnect, onStatus } = {}) {
  if (onBeforeConnect) beforeConnect = onBeforeConnect
  if (onStatus) statusListener = onStatus
  if (wanted) return
  wanted = true
  attempt = 0
  open()
}

export function disconnect() {
  wanted = false
  clearTimeout(retryTimer)
  clearInterval(pingTimer)
  socket?.close()
  socket = null
}

// Reconnect promptly when the device comes back online or the tab is shown again.
window.addEventListener('online', () => wanted && !socket && open())
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wanted && !socket) {
    clearTimeout(retryTimer)
    open()
  }
})
