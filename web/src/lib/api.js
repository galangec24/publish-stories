// JSON client for the Django API. Holds the JWT pair and refreshes the access
// token on 401 (concurrent 401s share one refresh call).
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(status, body) {
    super(messageFrom(status, body))
    this.status = status
    this.body = body
  }
  get code() {
    return this.body && typeof this.body === 'object' ? this.body.code : undefined
  }
}

function messageFrom(status, body) {
  if (body && typeof body === 'object') {
    if (typeof body.detail === 'string') return body.detail
    for (const value of Object.values(body)) {
      if (Array.isArray(value) && value.length) return String(value[0])
      if (typeof value === 'string') return value
    }
  }
  if (typeof body === 'string' && body && body.length < 200) return body
  return `Something went wrong (${status}).`
}

const store = {
  get access() {
    return safeGet('access')
  },
  get refresh() {
    return safeGet('refresh')
  },
}

function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveTokens(access, refresh) {
  try {
    localStorage.setItem('access', access)
    localStorage.setItem('refresh', refresh)
  } catch {
    /* private mode: session-only login */
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
  } catch {
    /* ignore */
  }
}

export const hasSession = () => Boolean(store.refresh)
export const accessToken = () => store.access
export const refreshToken = () => store.refresh

let onExpired = () => {}
export function setSessionExpiredHandler(fn) {
  onExpired = fn
}

function url(path, query) {
  const u = new URL(`${API_BASE}/${path.replace(/^\//, '')}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') u.searchParams.set(key, value)
  }
  return u
}

async function decode(response) {
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!response.ok) throw new ApiError(response.status, data)
  return data
}

let refreshing = null
function refreshAccess() {
  refreshing ??= (async () => {
    try {
      const response = await fetch(url('auth/token/refresh/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: store.refresh }),
      })
      if (!response.ok) {
        clearTokens()
        onExpired()
        return false
      }
      const data = await response.json()
      saveTokens(data.access, data.refresh || store.refresh)
      return true
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Random per-browser id so guest views can be counted once per day without tracking anyone. */
function viewerId() {
  try {
    let id = localStorage.getItem('viewer-id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('viewer-id', id)
    }
    return id
  } catch {
    return undefined
  }
}

async function send(method, path, { body, query, form, retry = true } = {}) {
  const headers = { Accept: 'application/json' }
  const vid = viewerId()
  if (vid) headers['X-Viewer-Id'] = vid
  if (store.access) headers.Authorization = `Bearer ${store.access}`
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json'
  const response = await fetch(url(path, query), {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  if (response.status === 401 && retry && store.refresh && !path.startsWith('auth/')) {
    if (await refreshAccess()) return send(method, path, { body, query, form, retry: false })
  }
  return decode(response)
}

export const api = {
  get: (path, query) => send('GET', path, { query }),
  post: (path, body) => send('POST', path, { body }),
  put: (path, body) => send('PUT', path, { body }),
  patch: (path, body) => send('PATCH', path, { body }),
  delete: (path) => send('DELETE', path),
  /** multipart/form-data upload; `form` is a FormData. */
  upload: (path, form, method = 'POST') => send(method, path, { form }),
  /** Signed-in download (e.g. admin-only images) → an object URL for <img src>. */
  blobUrl: async (path, retry = true) => {
    const response = await fetch(url(path), { headers: store.access ? { Authorization: `Bearer ${store.access}` } : {} })
    if (response.status === 401 && retry && (await refreshAccess())) return api.blobUrl(path, false)
    if (!response.ok) throw new ApiError(response.status, null)
    return URL.createObjectURL(await response.blob())
  },
}
