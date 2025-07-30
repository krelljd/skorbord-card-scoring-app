import { useCallback, useEffect } from 'react'
import { useGameState, useGameDispatch, useGameActions } from '../contexts/GameStateContext.jsx'
import { useConnection } from '../contexts/ConnectionContext.jsx'
import gameAPI from '../services/gameAPI.js'

/**
 * Modern hook that integrates game state management with API and WebSocket services
 * Provides a clean interface for game operations while maintaining backwards compatibility
 */
export function useGameManager(sqid) {
  const gameState = useGameState()
  const dispatch = useGameDispatch()
  const { updateScore, setLoading, setError } = useGameActions()
  const { socket, isConnected } = useConnection()

  // Load game data
  const loadGame = useCallback(async () => {
    if (!sqid) return

    try {
      setLoading(true)
      setError(null)

      // Fetch game and stats in parallel
      const [gameData, statsData] = await Promise.all([
        gameAPI.getGame(sqid),
        gameAPI.getGameStats(sqid)
      ])

      dispatch({
        type: 'GAME_LOADED',
        payload: {
          game: gameData,
          stats: statsData
        }
      })
    } catch (error) {
      console.error('Failed to load game:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [sqid, dispatch, setLoading, setError])

  // Update player score (optimistic update + server sync)
  const updatePlayerScore = useCallback(async (playerId, change) => {
    try {
      // Optimistic update - immediate UI feedback
      updateScore(playerId, change)

      // Sync with server
      await gameAPI.updatePlayerScore(sqid, playerId, change)

      // Emit to WebSocket for real-time updates to other clients
      if (socket?.connected) {
        socket.emit('score:updated', {
          sqid,
          playerId,
          change,
          newScore: gameState.gameStats.find(s => s.player_id === playerId)?.score + change
        })
      }
    } catch (error) {
      console.error('Failed to update score:', error)
      // Revert optimistic update
      updateScore(playerId, -change)
      setError(`Failed to update score: ${error.message}`)
    }
  }, [sqid, socket, gameState.gameStats, updateScore, setError])

  // Finalize game
  const finalizeGame = useCallback(async () => {
    try {
      setLoading(true)
      
      const result = await gameAPI.finalizeGame(sqid)
      
      dispatch({
        type: 'GAME_FINALIZED',
        payload: {
          winner: result.winner
        }
      })

      // Emit to WebSocket
      if (socket?.connected) {
        socket.emit('game:finalized', { sqid, winner: result.winner })
      }
    } catch (error) {
      console.error('Failed to finalize game:', error)
      setError(`Failed to finalize game: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [sqid, socket, dispatch, setLoading, setError])

  // Update player order
  const updatePlayerOrder = useCallback(async (newOrder) => {
    try {
      const updatedStats = await gameAPI.updatePlayerOrder(sqid, newOrder)
      
      // Find which player was moved (for glow effect)
      const movedPlayerId = newOrder.find((id, index) => {
        const currentOrder = gameState.gameStats.map(s => s.player_id)
        return currentOrder[index] !== id
      })

      dispatch({
        type: 'PLAYER_ORDER_UPDATED',
        payload: {
          stats: updatedStats,
          movedPlayerId
        }
      })

      // Emit to WebSocket
      if (socket?.connected) {
        socket.emit('player:reordered', { sqid, newOrder })
      }

      // Clear glow effect after animation
      if (movedPlayerId) {
        setTimeout(() => {
          dispatch({
            type: 'GLOW_CLEARED',
            payload: { playerId: movedPlayerId }
          })
        }, 1000)
      }
    } catch (error) {
      console.error('Failed to update player order:', error)
      setError(`Failed to reorder players: ${error.message}`)
    }
  }, [sqid, socket, gameState.gameStats, dispatch, setError])

  // Set up WebSocket event listeners for real-time updates
  useEffect(() => {
    if (!socket || !isConnected) return

    const cleanupFunctions = []

    // Listen for score updates from other clients
    const handleScoreUpdate = (data) => {
      if (data.sqid === sqid) {
        dispatch({
          type: 'SCORE_UPDATED',
          payload: {
            playerId: data.playerId,
            change: data.change
          }
        })
      }
    }

    // Listen for player reordering from other clients
    const handlePlayerReorder = (data) => {
      if (data.sqid === sqid) {
        // Refresh game data to get updated order
        loadGame()
      }
    }

    // Listen for game finalization from other clients
    const handleGameFinalized = (data) => {
      if (data.sqid === sqid) {
        dispatch({
          type: 'GAME_FINALIZED',
          payload: {
            winner: data.winner
          }
        })
      }
    }

    socket.on('score:updated', handleScoreUpdate)
    socket.on('player:reordered', handlePlayerReorder)
    socket.on('game:finalized', handleGameFinalized)

    return () => {
      socket.off('score:updated', handleScoreUpdate)
      socket.off('player:reordered', handlePlayerReorder)
      socket.off('game:finalized', handleGameFinalized)
    }
  }, [socket, isConnected, sqid, dispatch, loadGame])

  // Load game on mount and sqid change
  useEffect(() => {
    if (sqid) {
      loadGame()
    }
  }, [sqid, loadGame])

  return {
    // State
    game: gameState.game,
    gameStats: gameState.gameStats,
    scoreTallies: gameState.scoreTallies,
    glowingCards: gameState.glowingCards,
    winner: gameState.winner,
    loading: gameState.loading,
    error: gameState.error,
    
    // Actions
    loadGame,
    updatePlayerScore,
    finalizeGame,
    updatePlayerOrder,
    
    // Utilities
    isConnected,
    clearError: () => setError(null)
  }
}

/**
 * Hook for managing dealer selection
 */
export function useDealerManager(sqid) {
  const dispatch = useGameDispatch()
  const { socket } = useConnection()

  const setDealer = useCallback(async (playerId) => {
    try {
      await gameAPI.setDealer(sqid, playerId)
      
      dispatch({
        type: 'DEALER_SET',
        payload: { playerId }
      })

      // Emit to WebSocket
      if (socket?.connected) {
        socket.emit('dealer:set', { sqid, playerId })
      }
    } catch (error) {
      console.error('Failed to set dealer:', error)
      throw error
    }
  }, [sqid, socket, dispatch])

  return { setDealer }
}
