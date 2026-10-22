import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { connect, disconnect, on } from './socket'

const LiveContext = createContext(null)

/**
 * Notifications state plus the live socket. Also a tiny event bus for the
 * support chat widget (`openChat`).
 */
export function LiveProvider({ children }) {
  const { user } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState('offline')
  const [chatOpen, setChatOpen] = useState(false)
  const loaded = useRef(false)

  const loadLatest = useCallback(async () => {
    const data = await api.get('notifications/')
    setItems(data.results)
    setUnread(data.unread_count)
    setHasMore(data.has_more)
    loaded.current = true
  }, [])

  useEffect(() => {
    if (!user) {
      disconnect()
      setItems([])
      setUnread(0)
      setStatus('offline')
      return
    }
    // The backlog fetch before each connect also refreshes the access token.
    connect({ onBeforeConnect: loadLatest, onStatus: setStatus })
    return () => disconnect()
  }, [user?.id, loadLatest]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      on('notification', (n) => {
        setItems((list) => [n, ...list.filter((x) => x.id !== n.id)])
        setUnread((u) => u + 1)
        toast(n.title)
      }),
    [toast],
  )

  const markRead = useCallback(async (id) => {
    let wasUnread = false
    setItems((list) =>
      list.map((n) => {
        if (n.id === id && !n.is_read) wasUnread = true
        return n.id === id ? { ...n, is_read: true } : n
      }),
    )
    if (wasUnread) setUnread((u) => Math.max(0, u - 1))
    const { unread_count } = await api.post(`notifications/${id}/read/`)
    setUnread(unread_count)
  }, [])

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((n) => ({ ...n, is_read: true })))
    setUnread(0)
    await api.post('notifications/read-all/')
  }, [])

  const loadMore = useCallback(async () => {
    const last = items[items.length - 1]
    if (!last) return
    const data = await api.get('notifications/', { before: last.id })
    setItems((list) => [...list, ...data.results])
    setHasMore(data.has_more)
  }, [items])

  const value = useMemo(
    () => ({ items, unread, hasMore, status, markRead, markAllRead, loadMore, chatOpen, setChatOpen }),
    [items, unread, hasMore, status, markRead, markAllRead, loadMore, chatOpen],
  )
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export const useLive = () => useContext(LiveContext)
export { on as onLiveEvent }
