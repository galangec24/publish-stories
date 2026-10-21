import { useCallback, useEffect, useState } from 'react'

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
