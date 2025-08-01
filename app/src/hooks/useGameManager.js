import { useCallback, useEffect, useMemo, useRef } from 'react'
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
  const { updateScore, setLoading, setError, clearAllTallies } = useGameActions()
  const { socket, isConnected } = useConnection()

  // Load game data
  const loadGame = useCallback(async () => {
    if (!sqid) return

    try {
      setLoading(true)
      setError(null)

      // Fetch game and stats in parallel
      const [gameData, statsData] = await Promise.all([
        gameAPI.getGame(sqid).catch(error => {
          // Handle 404 gracefully - no active game found
          if (error.status === 404) {
            return null
          }
          throw error
        }),
        gameAPI.getGameStats(sqid).catch(error => {
          // Handle 404 gracefully - no game stats found
          if (error.status === 404) {
            return []
          }
          throw error
        })
      ])

      dispatch({
        type: 'GAME_LOADED',
        payload: {
          game: gameData,
          stats: statsData || []
        }
      })
      
      if (typeof clearAllTallies === 'function') {
        clearAllTallies()
      }
    } catch (error) {
      console.error('Failed to load game:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [sqid, dispatch, setLoading, setError])

  // Check for winner based on game conditions
  const checkForWinner = useCallback((stats) => {
    if (!gameState.game || gameState.game.finalized) return

    const winCondition = gameState.game.win_condition_value
    const winConditionType = gameState.game.win_condition_type
    let gameWinner = null

    if (winConditionType === 'win') {
      // Win condition: first player to reach the target score
      const qualifiedPlayers = stats.filter(stat => stat.score >= winCondition)
      if (qualifiedPlayers.length > 0) {
        gameWinner = qualifiedPlayers.reduce((max, current) =>
          current.score > max.score ? current : max
        )
      }
    } else if (winConditionType === 'lose') {
      // Lose condition: when someone hits the target, lowest score wins
      const anyLoser = stats.some(stat => stat.score >= winCondition)
      if (anyLoser) {
        gameWinner = stats.reduce((min, current) =>
          current.score < min.score ? current : min
        )
      }
    }

    // Update winner state if detected
    if (gameWinner && gameWinner.player_id !== gameState.winner?.player_id) {
      dispatch({ type: 'WINNER_DETECTED', payload: { winner: gameWinner } })
    } else if (!gameWinner && gameState.winner) {
      dispatch({ type: 'WINNER_CLEARED' })
    }
  }, [gameState.game, gameState.winner, dispatch])

  // Update player score (optimistic update + server sync)
  // Single timer per player for rolling 3-second window
  const playerTallyTimeouts = useRef({}) // Per-player timeout management
  const localTallyAccumulator = useRef({}) // Track accumulated changes per player
  
  // Per-player timeout management for remote updates (moved to top level)
  const remoteTallyTimeouts = useRef({})
  
  const updatePlayerScore = useCallback(async (playerId, change) => {
    try {
      // Optimistic update - immediate UI feedback
      updateScore(playerId, change)
      
      // Accumulate tally locally
      const currentAccumulation = localTallyAccumulator.current[playerId] || 0
      const newAccumulation = currentAccumulation + change
      localTallyAccumulator.current[playerId] = newAccumulation
      
      dispatch({
        type: 'SCORE_TALLY_ACCUMULATE',
        payload: {
          playerId,
          change
        }
      })
      
      // Clear existing timer for this player (rolling window)
      if (playerTallyTimeouts.current[playerId]) {
        clearTimeout(playerTallyTimeouts.current[playerId])
      }
      
      // Set new 3-second timer for this specific player (rolling window)
      playerTallyTimeouts.current[playerId] = setTimeout(() => {
        // Reset the accumulator for this player
        localTallyAccumulator.current[playerId] = 0
        
        // Clear only this player's tally from UI
        dispatch({
          type: 'SCORE_TALLY_CLEARED',
          payload: { playerId }
        })
        
        // Clean up the timeout reference
        delete playerTallyTimeouts.current[playerId]
      }, 3000)

      // Get updated stats for winner checking
      const updatedStats = gameState.gameStats.map(stat => 
        stat.player_id === playerId 
          ? { ...stat, score: stat.score + change }
          : stat
      )

      // Check for winner after score update
      checkForWinner(updatedStats)

      // Sync with server (individual change) - this updates the database
      await gameAPI.updatePlayerScore(sqid, playerId, change)

      // Send WebSocket event immediately with accumulated total
      // Backend will exclude this client from receiving the broadcast
      if (socket?.connected) {
        const updatedPlayerScore = gameState.gameStats.find(s => s.player_id === playerId)?.score || 0
        
        socket.emit('update_score', {
          sqid,
          playerId,
          change: newAccumulation, // Send the total accumulated change
          newScore: updatedPlayerScore + change, // Updated score after this individual change
          isAccumulated: true, // Flag to indicate this is an accumulated total
          timestamp: Date.now() // Add timestamp to help with ordering
        })
      }

    } catch (error) {
      console.error('Failed to update score:', error)
      // Revert optimistic update
      updateScore(playerId, -change)
      
      // Also revert the accumulator
      const currentAccumulation = localTallyAccumulator.current[playerId] || 0
      localTallyAccumulator.current[playerId] = Math.max(0, currentAccumulation - change)
      
      // Clear the timeout for this player since the update failed
      if (playerTallyTimeouts.current[playerId]) {
        clearTimeout(playerTallyTimeouts.current[playerId])
        delete playerTallyTimeouts.current[playerId]
      }
      
      setError(`Failed to update score: ${error.message}`)
    }
  }, [sqid, socket, gameState.gameStats, updateScore, setError, checkForWinner, dispatch])

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
        console.debug('[WS] handleScoreUpdate received from another client:', data)
        
        // Display the accumulated total received from the sender
        // Use SCORE_TALLY_SET to show exactly what was sent (no local accumulation)
        dispatch({
          type: 'SCORE_TALLY_SET',
          payload: {
            playerId: data.playerId,
            change: data.change // This is the total accumulated change from the sender
          }
        })
        
        // Clear any existing timeout for this player (rolling window)
        if (remoteTallyTimeouts.current[data.playerId]) {
          clearTimeout(remoteTallyTimeouts.current[data.playerId])
        }
        
        // Set new 3-second timer for this specific player (rolling window)
        remoteTallyTimeouts.current[data.playerId] = setTimeout(() => {
          dispatch({
            type: 'SCORE_TALLY_CLEARED',
            payload: { playerId: data.playerId }
          })
          
          // Clean up the timeout reference
          delete remoteTallyTimeouts.current[data.playerId]
        }, 3000)
        
        // Fetch latest game stats immediately to sync with server state
        // No debouncing needed since this client won't receive its own events
        const refreshGameData = async () => {
          try {
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
            checkForWinner(statsData)
          } catch (error) {
            console.error('Failed to refresh game data after score update:', error)
          }
        }
        refreshGameData()
      }
    }

    // Listen for player reordering from other clients
    const handlePlayerReorder = (data) => {
      if (data.sqid === sqid) {
        // Refresh game data to get updated order
        // Use a fresh call instead of the loadGame callback to avoid dependency loop
        const refreshGameData = async () => {
          try {
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
            console.error('Failed to refresh game data:', error)
          }
        }
        refreshGameData()
      }
    }

    // Listen for dealer change from other clients (legacy event)
    const handleDealerChanged = (data) => {
      if (data.sqid === sqid) {
        // Fetch latest game and stats from API to ensure fresh state
        const refreshGameData = async () => {
          try {
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
            console.error('Failed to refresh game data after dealer_changed:', error)
          }
        }
        refreshGameData()
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

    socket.on('score_update', handleScoreUpdate)
    socket.on('player_activity', handlePlayerReorder) // If player_activity is used for reordering
    socket.on('player:reordered', handlePlayerReorder)
    socket.on('dealer_changed', handleDealerChanged)
    socket.on('game:finalized', handleGameFinalized)

    return () => {
      // Clean up remote tally timeouts
      Object.values(remoteTallyTimeouts.current).forEach(timeoutId => {
        clearTimeout(timeoutId)
      })
      remoteTallyTimeouts.current = {}
      
      // Clean up WebSocket listeners
      socket.off('score_update', handleScoreUpdate)
      socket.off('player_activity', handlePlayerReorder)
      socket.off('player:reordered', handlePlayerReorder)
      socket.off('dealer_changed', handleDealerChanged)
      socket.off('game:finalized', handleGameFinalized)
    }
  }, [socket, isConnected, sqid, dispatch, checkForWinner])

  // Load game on mount and sqid change
  useEffect(() => {
    if (sqid) {
      loadGame()
    }
  }, [sqid, loadGame])

  // Cleanup local player tally timeouts on unmount
  useEffect(() => {
    return () => {
      // Clean up all local player tally timeouts
      Object.values(playerTallyTimeouts.current).forEach(timeoutId => {
        clearTimeout(timeoutId)
      })
      playerTallyTimeouts.current = {}
    }
  }, [])

  // Set dealer function (moved from useDealerManager for convenience)
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
    setDealer,
    
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

  // Memoize the returned object to prevent unnecessary re-renders
  const gameManager = useMemo(() => ({
    ...gameState,
    loadGame,
    updatePlayerScore,
    finalizeGame,
    setDealer,
    loading: gameState.loading,
    error: gameState.error
  }), [
    gameState, 
    loadGame, 
    updatePlayerScore, 
    finalizeGame, 
    setDealer
  ])

  return gameManager
}
