import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameState, useGameDispatch, useGameActions } from '../contexts/GameStateContext.jsx'
import { useConnection } from '../contexts/ConnectionContext.jsx'
import gameAPI from '../services/gameAPI.js'
import { createOpQueue, flushQueue, isNetworkError } from '../services/opQueue.js'

/**
 * Modern hook that integrates game state management with API and WebSocket services
 * Provides a clean interface for game operations while maintaining backwards compatibility
 */
export function useGameManager(sqid) {
  const gameState = useGameState()
  const dispatch = useGameDispatch()
  const { setLoading, setError } = useGameActions()
  const { socket, isConnected } = useConnection()

  // Round state: taps go into the open round's draft. Each write returns the
  // full authoritative round state. While taps are in flight we hold off applying
  // server state so a slow reply cannot move a total backwards under the player.
  const inflight = useRef(0)
  // Taps made while the server cannot be reached wait here and replay in order
  const queue = useRef(null)
  if (!queue.current) queue.current = createOpQueue()
  const [pendingTaps, setPendingTaps] = useState(0)
  const flushing = useRef(false)

  const applyRoundState = useCallback((roundState) => {
    if (roundState && inflight.current === 0 && queue.current.size === 0) dispatch({ type: 'ROUND_STATE_SET', payload: { roundState } })
  }, [dispatch])

  const refreshRounds = useCallback(async (gameId) => {
    if (!sqid || !gameId) return
    applyRoundState(await gameAPI.getRounds(sqid, gameId))
  }, [sqid, applyRoundState])

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

      if (gameData?.id) {
        await refreshRounds(gameData.id)
      }
    } catch (error) {
      console.error('Failed to load game:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [sqid, dispatch, setLoading, setError, refreshRounds])

  const gameId = gameState.game?.id

  // Replay queued taps, then pull the authoritative state
  const flushPending = useCallback(async () => {
    if (flushing.current || queue.current.size === 0 || !gameId) return
    flushing.current = true
    try {
      const { dropped, stalled } = await flushQueue(queue.current, (op) =>
        gameAPI.addToDraft(sqid, gameId, op.playerId, op.delta, socket?.id || null, op.opId)
      )
      setPendingTaps(queue.current.size)
      if (dropped.length > 0) {
        setError(`${dropped.length} offline score change${dropped.length > 1 ? 's' : ''} could not be saved: ${dropped[0].error.message}`)
      }
      if (!stalled) await refreshRounds(gameId)
    } catch (error) {
      console.error('Failed to sync offline taps:', error)
    } finally {
      flushing.current = false
    }
  }, [sqid, gameId, socket, refreshRounds, setError])

  // Add points to the open round. Optimistic. If the server cannot be reached the
  // tap is queued with its opId and replays once the connection is back.
  const updatePlayerScore = useCallback(async (playerId, change) => {
    const opId = gameAPI.newOpId()
    dispatch({ type: 'DRAFT_ADJUSTED', payload: { playerId, change } })

    const enqueue = () => {
      queue.current.push({ opId, gameId, playerId, delta: change, at: Date.now() })
      setPendingTaps(queue.current.size)
    }

    // Behind earlier queued taps, or known offline: keep order by queueing
    if (queue.current.size > 0 || !isConnected) {
      enqueue()
      flushPending()
      return
    }

    inflight.current += 1
    try {
      const state = await gameAPI.addToDraft(sqid, gameId, playerId, change, socket?.id || null, opId)
      inflight.current -= 1
      applyRoundState(state)
    } catch (error) {
      inflight.current -= 1
      if (isNetworkError(error)) {
        enqueue()
        return
      }
      refreshRounds(gameId).catch(() => {})
      throw error
    }
  }, [sqid, gameId, socket, isConnected, dispatch, applyRoundState, refreshRounds, flushPending])

  // Run a round write that is not a tap, apply the reply, and pass errors up.
  const roundAction = useCallback(async (call) => {
    try {
      const state = await call()
      applyRoundState(state)
      return state
    } catch (error) {
      refreshRounds(gameId).catch(() => {})
      throw error
    }
  }, [applyRoundState, refreshRounds, gameId])

  const setDraftPoints = useCallback((playerId, points) =>
    roundAction(() => gameAPI.setDraft(sqid, gameId, playerId, points, socket?.id || null)),
  [roundAction, sqid, gameId, socket])

  const nextRound = useCallback(({ winnerId = null } = {}) =>
    roundAction(() => gameAPI.commitRound(sqid, gameId, {
      expectedRound: gameState.roundState?.open_round ?? undefined,
      winnerId,
      socketId: socket?.id || null
    })),
  [roundAction, sqid, gameId, socket, gameState.roundState?.open_round])

  const undoRound = useCallback(() =>
    roundAction(() => gameAPI.undoCommit(sqid, gameId, socket?.id || null)),
  [roundAction, sqid, gameId, socket])

  const editRound = useCallback((roundNumber, playerId, points, expectedRevision) =>
    roundAction(() => gameAPI.editRound(sqid, gameId, roundNumber, playerId, points, expectedRevision, socket?.id || null)),
  [roundAction, sqid, gameId, socket])

  // Finalize game
  const finalizeGame = useCallback(async () => {
    try {
      setLoading(true)
      
      // Get current winner before finalizing
      const currentWinner = gameState.winner
      const winnerId = currentWinner?.player_id || null
      
      const result = await gameAPI.finalizeGame(sqid, gameState.game?.id, winnerId)
      
      dispatch({
        type: 'GAME_FINALIZED',
        payload: {
          winner: result.winner || currentWinner
        }
      })

      // Emit to WebSocket
      if (socket?.connected) {
        socket.emit('game:finalized', { sqid, winner: result.winner || currentWinner })
      }
    } catch (error) {
      console.error('Failed to finalize game:', error)
      setError(`Failed to finalize game: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [sqid, socket, dispatch, setLoading, setError, gameState.winner, gameState.game?.id])

  // Update player order
  const updatePlayerOrder = useCallback(async (newOrder) => {
    if (!gameState.game?.id) {
      throw new Error('No active game found')
    }

    try {
      const response = await gameAPI.updatePlayerOrder(sqid, gameState.game.id, newOrder)
      
      // Don't update state immediately - rely on WebSocket event for consistency
      // This matches the pattern used in the original GamePlay component
      
      // Emit to WebSocket
      if (socket?.connected) {
        socket.emit('player_order_update', { 
          sqid, 
          gameId: gameState.game.id,
          newOrder 
        })
      }

      return response
    } catch (error) {
      console.error('Failed to update player order:', error)
      setError(`Failed to reorder players: ${error.message}`)
    }
  }, [sqid, socket, gameState.gameStats, dispatch, setError])

  // Set up WebSocket event listeners for real-time updates
  useEffect(() => {
    if (!socket || !isConnected) return

    const cleanupFunctions = []

    // Authoritative round state from any device, including this one. The acting
    // device already applied its own reply, so applying the broadcast again is a no-op.
    const handleRoundUpdate = (data) => {
      if (data.sqid !== sqid) return
      applyRoundState(data.state)
    }

    // Listen for player reorder from other clients
    const handlePlayerReorder = (data) => {
      // Accept the event if sqid matches (more robust than checking both sqid and game ID)
      if (data.sqid_id === sqid) {
        // Update player order with the new stats from the event
        dispatch({
          type: 'PLAYER_ORDER_UPDATED',
          payload: {
            stats: data.stats,
            movedPlayerId: null // We don't need glow effect for remote updates
          }
        })
        
        // Don't update game state during reordering - it should already be loaded
        // The reorder WebSocket event should only update the stats, not the game
      }
    }    // Dealer changed by hand on another device (a saved round sends its own round_update)
    const handleDealerChanged = (data) => {
      if (data.sqid === sqid && data.dealer_id) {
        dispatch({ type: 'DEALER_SET', payload: { playerId: data.dealer_id } })
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

    socket.on('round_update', handleRoundUpdate)
    socket.on('player_order_updated', handlePlayerReorder)
    socket.on('dealer_changed', handleDealerChanged)
    socket.on('game:finalized', handleGameFinalized)

    return () => {
      // Clean up WebSocket listeners
      socket.off('round_update', handleRoundUpdate)
      socket.off('player_order_updated', handlePlayerReorder)
      socket.off('dealer_changed', handleDealerChanged)
      socket.off('game:finalized', handleGameFinalized)
    }
  }, [socket, isConnected, sqid, dispatch, applyRoundState])

  // Load game on mount and sqid change only
  useEffect(() => {
    if (sqid) {
      loadGame()
    }
  }, [sqid, loadGame]) // Can include loadGame now since checkForWinner is stable

  // Taps saved from an earlier visit belong to this game only
  useEffect(() => {
    if (gameId) setPendingTaps(queue.current.load(gameId))
  }, [gameId])

  // Back online: replay queued taps (then refresh). Rejoining the room after a
  // drop can also miss broadcasts, so with nothing queued just pull fresh state.
  useEffect(() => {
    if (!isConnected || !gameId) return
    if (queue.current.size > 0) flushPending()
    else refreshRounds(gameId).catch(() => {})
  }, [isConnected, gameId, refreshRounds, flushPending])

  // The socket can look connected while the API is unreachable, so keep retrying
  useEffect(() => {
    if (pendingTaps === 0) return
    const timer = setInterval(() => flushPending(), 5000)
    return () => clearInterval(timer)
  }, [pendingTaps, flushPending])

  useEffect(() => {
    const onOnline = () => flushPending()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flushPending])

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
    roundState: gameState.roundState,
    glowingCards: gameState.glowingCards,
    winner: gameState.winner,
    loading: gameState.loading,
    error: gameState.error,
    
    // Actions
    loadGame,
    updatePlayerScore,
    setDraftPoints,
    nextRound,
    undoRound,
    editRound,
    finalizeGame,
    updatePlayerOrder,
    setDealer,
    
    // Utilities
    isConnected,
    pendingTaps,
    clearError: () => setError(null)
  }
}

