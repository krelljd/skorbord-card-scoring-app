import { useCallback, useEffect, useState } from 'react'
import { SNARK_LEVELS, DEFAULT_SNARK } from '../utils/snark.js'

const KEY = 'skorbord-snark'
const listeners = new Set()

function read() {
  try {
    const value = window.localStorage.getItem(KEY)
    return SNARK_LEVELS.includes(value) ? value : DEFAULT_SNARK
  } catch {
    return DEFAULT_SNARK
  }
}

let current = null

/**
 * The snark setting (off, mild or spicy), saved on this phone. Every screen using it updates together.
 * Storage can be blocked or empty, in which case it stays on the default for the session.
 */
export default function useSnarkSetting() {
  const [level, setLevel] = useState(() => (current ??= read()))

  useEffect(() => {
    listeners.add(setLevel)
    return () => { listeners.delete(setLevel) }
  }, [])

  const update = useCallback((next) => {
    if (!SNARK_LEVELS.includes(next)) return
    current = next
    try { window.localStorage.setItem(KEY, next) } catch { /* the choice lasts until the page reloads */ }
    listeners.forEach((fn) => fn(next))
  }, [])

  return [level, update]
}

/** Test helper: forget the in-memory value so the next read goes back to storage. */
export const resetSnarkSetting = () => { current = null }
