import { useState, useEffect, useCallback } from 'react'

export function useFetch(fetcher, deps = []) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [tick, setTick]       = useState(0)

  const run = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetcher()
      .then(d  => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  useEffect(run, [run])

  const refresh = useCallback(() => setTick(t => t + 1), [])

  return { data, loading, error, refresh }
}
