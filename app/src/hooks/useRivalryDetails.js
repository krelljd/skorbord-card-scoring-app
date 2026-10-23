import { useEffect, useState } from 'react'
import gameAPI from '../services/gameAPI.js'

/**
 * The detail of one rivalry (players, finished-game timeline, per-type stats), or null while it loads,
 * when there is no rivalry, or if the request fails. Nothing here is essential, so a failure just
 * leaves the extra facts out.
 */
export default function useRivalryDetails(sqid, rivalryId) {
  const [state, setState] = useState({ id: null, details: null })

  useEffect(() => {
    if (!sqid || !rivalryId) return undefined
    let cancelled = false
    gameAPI.request(`/api/${sqid}/rivalries/${rivalryId}`)
      .then((res) => { if (!cancelled) setState({ id: rivalryId, details: res?.data || null }) })
      .catch(() => { if (!cancelled) setState({ id: rivalryId, details: null }) })
    return () => { cancelled = true }
  }, [sqid, rivalryId])

  // Never hand back another rivalry's details while a new one loads
  return state.id === rivalryId ? state.details : null
}
