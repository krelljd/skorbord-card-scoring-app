import { useState, useEffect, useCallback } from 'react'

/**
 * Hook for loading initial app data (game types, players, rivalries)
 * Used by the main app components to populate initial state
 */
export function useAppData(sqid) {
  const [gameTypes, setGameTypes] = useState([])
  const [players, setPlayers] = useState([])
  const [rivalries, setRivalries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load initial data
  const loadAppData = useCallback(async () => {
    if (!sqid) {
      console.warn('No sqid provided to useAppData')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Use relative paths since we have Vite proxy configured
      const API_URL = ''
      
      const [gameTypesRes, playersRes, rivalriesRes] = await Promise.all([
        fetch(`${API_URL}/api/game_types`),
        fetch(`${API_URL}/api/${sqid}/players`),
        fetch(`${API_URL}/api/${sqid}/rivalries`)
      ])

      // Handle responses
      if (!gameTypesRes.ok) {
        throw new Error(`Failed to load game types: ${gameTypesRes.status} ${gameTypesRes.statusText}`)
      }

      // Accept 404 for players/rivalries as valid empty responses
      const parseEmpty = async (res) => {
        if (res.status === 404 || res.status === 204) {
          return { data: [] }
        }
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status} ${res.statusText}`)
        }
        return res.json()
      }

      const [gameTypesData, playersData, rivalriesData] = await Promise.all([
        gameTypesRes.json(),
        parseEmpty(playersRes),
        parseEmpty(rivalriesRes)
      ])

      // Update state
      setGameTypes(gameTypesData.data || [])
      setPlayers(playersData.data || [])
      setRivalries(rivalriesData.data || [])

      console.log('App data loaded successfully:', {
        gameTypes: gameTypesData.data?.length || 0,
        players: playersData.data?.length || 0,
        rivalries: rivalriesData.data?.length || 0
      })

    } catch (err) {
      console.error('Failed to load app data:', err)
      setError(err.message)
      // Don't use toast here - let the parent component handle error display
    } finally {
      setLoading(false)
    }
  }, [sqid])

  // Load data when sqid changes
  useEffect(() => {
    if (sqid) {
      loadAppData()
    }
  }, [sqid, loadAppData])

  return {
    gameTypes,
    players,
    rivalries,
    setGameTypes,
    setPlayers,
    setRivalries,
    loading,
    error,
    reload: loadAppData
  }
}

export default useAppData
