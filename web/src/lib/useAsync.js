import { useCallback, useEffect, useMemo, useState } from 'react'

/** Runs `fn` on mount and whenever `deps` change. Returns { data, error, loading, reload, setData }. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await run()
      setState({ data, error: null, loading: false })
      return data
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }))
      return undefined
    }
  }, [run])

  useEffect(() => {
    reload()
  }, [reload])

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }, [])

  return { ...state, reload, setData }
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

/**
 * Like useAsync, but starts from the last good response saved under `key` (or
 * `fallback`), so the page renders instantly while a sleeping server wakes up.
 */
export function useCachedAsync(key, fn, deps = [], fallback = undefined) {
  const result = useAsync(
    () =>
      fn().then((data) => {
        try {
          localStorage.setItem(key, JSON.stringify(data))
        } catch {
          /* storage full or blocked: just don't cache */
        }
        return data
      }),
    [key, ...deps],
  )
  const cached = useMemo(() => readCache(key) ?? fallback, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...result, data: result.data ?? cached }
}
