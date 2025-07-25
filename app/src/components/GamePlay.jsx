
import React, { useState, useEffect, useRef } from 'react'
import { LayoutGroup, motion } from 'framer-motion'
import { useConnection } from '../contexts/ConnectionContext.jsx'
import { getPlayerBadgeColorClassById } from '../utils/playerColors'
import PlayerCard from './PlayerCard.jsx'

// Component to handle reorder mode for player cards
// PlayerCardsList now animates reordering using framer-motion layout animations
function PlayerCardsList({
  gameStats,
  updateScore,
  updatePlayerOrder,
  loading,
  gameFinalized,
  scoreTallies,
  winner,
  dealer,
  cycleDealer,
  isReorderMode
}) {
  // Custom hook for iOS Safari animation timing optimization
  const useForceLayoutUpdate = () => {
    const forceUpdate = React.useCallback(() => {
      // Force layout recalculation for consistent iOS Safari animations
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        const container = document.querySelector('.player-cards-container')
        if (container) {
          // Force style recalculation and reflow
          window.getComputedStyle(container).transform
          container.offsetHeight
        }
      }
    }, [])
    
    return forceUpdate
  }
  
  const forceLayoutUpdate = useForceLayoutUpdate()
  
  // iOS Safari optimized reorder functions
  // Use proper touch event handling and timing for consistent animations
  const moveUp = React.useCallback((index) => {
    if (index === 0) return // Already at top
    
    const newItems = [...gameStats]
    const [movedItem] = newItems.splice(index, 1)
    newItems.splice(index - 1, 0, movedItem)
    
    // iOS Safari optimization: Ensure proper timing and force layout recalculation
    // Use double RAF to ensure DOM is ready for animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        forceLayoutUpdate()
        updatePlayerOrder(newItems)
      })
    })
  }, [gameStats, updatePlayerOrder, forceLayoutUpdate])

  const moveDown = React.useCallback((index) => {
    if (index === gameStats.length - 1) return // Already at bottom
    
    const newItems = [...gameStats]
    const [movedItem] = newItems.splice(index, 1)
    newItems.splice(index + 1, 0, movedItem)
    
    // iOS Safari optimization: Ensure proper timing and force layout recalculation
    // Use double RAF to ensure DOM is ready for animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        forceLayoutUpdate()
        updatePlayerOrder(newItems)
      })
    })
  }, [gameStats, updatePlayerOrder, forceLayoutUpdate])

  return (
    <LayoutGroup>
      <motion.div 
        className="space-y-2 player-cards-container" 
        layout
        transition={{
          layout: {
            type: "tween",
            duration: 0.25, // Slightly shorter for more responsive feel
            ease: [0.4, 0, 0.2, 1] // Custom cubic-bezier for better iOS performance
          }
        }}
        style={{
          // iOS Safari optimization: Force GPU acceleration
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden'
        }}
      >
        <motion.div 
          className="grid gap-2" 
          layout
          transition={{
            layout: {
              type: "tween", 
              duration: 0.25, // Match parent duration
              ease: [0.4, 0, 0.2, 1] // Custom cubic-bezier for better iOS performance
            }
          }}
          style={{
            // iOS Safari optimization: Force GPU acceleration
            willChange: 'transform',
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden'
          }}
        >
          {gameStats.map((stat, index) => {
            // Construct player object for PlayerCard
            const player = {
              id: stat.player_id,
              name: stat.player_name,
              color: stat.color || 'primary',
              score: stat.score
            };
            return (
              <motion.div
                key={player.id}
                layoutId={String(player.id)}
                layout
                transition={{ 
                  layout: { 
                    type: "tween",
                    duration: 0.25, // Shorter duration for snappier feel
                    ease: [0.4, 0, 0.2, 1] // Custom cubic-bezier optimized for iOS
                  }
                }}
                className={[
                  'player-card-container',
                  isReorderMode ? 'flex items-center gap-2 bg-base-200/10 rounded-lg p-1' : '',
                ].join(' ').trim()}
                style={{
                  // iOS Safari optimization: Force hardware acceleration and consistent behavior
                  willChange: isReorderMode ? 'transform' : 'auto',
                  transform: 'translate3d(0, 0, 0)', // Force GPU acceleration on iOS
                  backfaceVisibility: 'hidden', // Prevent flickering on iOS
                  // Additional iOS optimizations for touch events
                  WebkitTapHighlightColor: 'transparent',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none'
                }}
              >
                {/* Reorder buttons - left side */}
                {isReorderMode && (
                  <div className="flex flex-col gap-1 ml-1">
                    <button
                      onClick={() => moveUp(index)}
                      onTouchStart={(e) => {
                        // Prevent iOS Safari delays and ensure immediate response
                        e.preventDefault()
                        e.currentTarget.style.transform = 'scale(0.95)'
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault()
                        e.currentTarget.style.transform = 'scale(1)'
                        // Ensure the click fires after touch handling
                        setTimeout(() => moveUp(index), 0)
                      }}
                      onTouchCancel={(e) => {
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                      disabled={index === 0}
                      className={`btn btn-xs btn-primary ${
                        index === 0 ? 'btn-disabled opacity-30' : ''
                      }`}
                      style={{
                        minHeight: '1.75rem',
                        minWidth: '1.75rem',
                        touchAction: 'manipulation',
                        // iOS Safari optimizations
                        WebkitTapHighlightColor: 'transparent',
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        transform: 'translate3d(0, 0, 0)', // Force GPU acceleration
                        backfaceVisibility: 'hidden', // Prevent flickering
                        transition: 'transform 0.1s ease-out' // Smooth scale transition
                      }}
                      title="Move up"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      onTouchStart={(e) => {
                        // Prevent iOS Safari delays and ensure immediate response
                        e.preventDefault()
                        e.currentTarget.style.transform = 'scale(0.95)'
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault()
                        e.currentTarget.style.transform = 'scale(1)'
                        // Ensure the click fires after touch handling
                        setTimeout(() => moveDown(index), 0)
                      }}
                      onTouchCancel={(e) => {
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                      disabled={index === gameStats.length - 1}
                      className={`btn btn-xs btn-primary ${
                        index === gameStats.length - 1 ? 'btn-disabled opacity-30' : ''
                      }`}
                      style={{
                        minHeight: '1.75rem',
                        minWidth: '1.75rem',
                        touchAction: 'manipulation',
                        // iOS Safari optimizations
                        WebkitTapHighlightColor: 'transparent',
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        transform: 'translate3d(0, 0, 0)', // Force GPU acceleration
                        backfaceVisibility: 'hidden', // Prevent flickering
                        transition: 'transform 0.1s ease-out' // Smooth scale transition
                      }}
                      title="Move down"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                )}
                {/* Player card - full width when not in reorder mode */}
                <div className={isReorderMode ? 'flex-1 mr-1' : 'w-full'}>
                  <PlayerCard
                    player={player}
                    score={stat.score}
                    onScoreChange={updateScore}
                    disabled={loading || gameFinalized || isReorderMode}
                    scoreTally={scoreTallies[player.id]}
                    isWinner={winner?.player_id === player.id}
                    isDealer={dealer === player.id}
                    onDealerChange={gameFinalized || isReorderMode ? null : cycleDealer}
                    playerNameProps={{}}
                  />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </motion.div>
    </LayoutGroup>
  );
}

const GamePlay = ({ 
  sqid, 
  game, 
  setCurrentGame, 
  setCurrentView, 
  onGameComplete,
  backToSetup 
}) => {
  const { socket } = useConnection()
  
  // Game state
  const [gameStats, setGameStats] = useState([])
  const [winner, setWinner] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dealer, setDealer] = useState(null)
  
  // Local game metadata state to prevent flashing during updates
  const [gameMetadata, setGameMetadata] = useState({
    game_type_name: game?.game_type_name,
    win_condition_type: game?.win_condition_type,
    win_condition_value: game?.win_condition_value
  })
  
  // Add reorder mode state
  const [isReorderMode, setIsReorderMode] = useState(false)
  
  // Score tally state and refs for tracking pending updates
  const [scoreTallies, setScoreTallies] = useState({})
  const pendingUpdates = useRef(new Set())
  const tallyTimeouts = useRef({})
  
  // Remove modal state, use winner state to control finalize button
  
  // Initialize game state and socket listeners
  useEffect(() => {
    if (!game || !socket) return

    // Initialize game metadata state to prevent flashing
    setGameMetadata({
      game_type_name: game.game_type_name,
      win_condition_type: game.win_condition_type,
      win_condition_value: game.win_condition_value
    })

    // Initialize dealer if available
    if (game.dealer_id) {
      setDealer(game.dealer_id)
    }

    // Set up socket event listeners
    socket.on('score_updated', handleScoreUpdate)
    socket.on('game_completed', handleGameCompleted)
    socket.on('player_order_updated', handlePlayerOrderUpdate)

    // Clean up socket listeners on unmount
    return () => {
      socket.off('score_updated', handleScoreUpdate)
      socket.off('game_completed', handleGameCompleted)
      socket.off('player_order_updated', handlePlayerOrderUpdate)
    }
  }, [game, socket])

  // Check for winner whenever gameStats changes
  useEffect(() => {
    if (gameStats.length > 0) {
      checkForWinner(gameStats)
    }
  }, [gameStats, game?.win_condition_value, game?.win_condition_type, game?.finalized])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all score tally timeouts
      Object.values(tallyTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout)
      })
      tallyTimeouts.current = {}
    }
  }, [])

  // Fetch initial game stats
  useEffect(() => {
    const fetchGameStats = async () => {
      if (!sqid || !game?.id) return

      try {
        setLoading(true)
        const response = await fetch(`/api/${sqid}/games/${game.id}/stats`)
        if (response.ok) {
          const result = await response.json()
          setGameStats(result.data || [])
        }
      } catch (err) {
        console.error('Failed to fetch game stats:', err)
        setError('Failed to load game stats')
      } finally {
        setLoading(false)
      }
    }

    fetchGameStats()
  }, [sqid, game?.id])

  const initializeRandomDealer = async () => {
    if (gameStats.length === 0) return
    
    const randomIndex = Math.floor(Math.random() * gameStats.length)
    const randomPlayer = gameStats[randomIndex]
    await updateDealer(randomPlayer.player_id)
  }

  const updateDealer = async (playerId) => {
    // Prevent multiple simultaneous dealer updates
    if (loading) return
    
    try {
      setLoading(true)
      
      const response = await fetch(`/api/${sqid}/games/${game.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealer_id: playerId })
      })
      
      if (response.ok) {
        const result = await response.json()
        // Only update state after successful API response to prevent flashing
        setDealer(result.data.dealer_id) // Use server response instead of optimistic update
        
        // Update current game with new dealer, but preserve existing game data to prevent flashing
        setCurrentGame(prevGame => ({
          ...prevGame,
          ...result.data,
          // Ensure critical display fields are preserved if missing from response
          game_type_name: result.data.game_type_name || prevGame.game_type_name,
          win_condition_type: result.data.win_condition_type || prevGame.win_condition_type,
          win_condition_value: result.data.win_condition_value !== undefined ? result.data.win_condition_value : prevGame.win_condition_value
        }))
        
        // No need to emit socket event here - the server now broadcasts dealer changes
        // This prevents race conditions and ensures all clients get the same authoritative update
      }
    } catch (err) {
      console.error('Failed to update dealer:', err)
      setError('Failed to update dealer')
    } finally {
      setLoading(false)
    }
  }

  const cycleDealer = async () => {
    if (gameStats.length === 0 || loading) return
    
    // Find current dealer index in the gameStats array
    const currentDealerIndex = gameStats.findIndex(stat => stat.player_id === dealer)
    
    // Calculate next dealer index (cycle to start if at end)
    const nextDealerIndex = (currentDealerIndex + 1) % gameStats.length
    const nextDealer = gameStats[nextDealerIndex]
    
    await updateDealer(nextDealer.player_id)
  }

  const handleScoreUpdate = (data) => {
    if (data.game_id === game.id) {
      setGameStats(data.stats)
      // Handle score tally mini-session
      const playerId = data.player_id
      const change = data.score_change
      const updateKey = `${playerId}-${change}-${Date.now()}`
      
      // Only update tally if this isn't a pending update from this client
      if (change !== 0 && !pendingUpdates.current.has(`${playerId}-${change}`)) {
        // Clear existing timeout for this player
        if (tallyTimeouts.current[playerId]) {
          clearTimeout(tallyTimeouts.current[playerId])
        }
        // Update tally
        setScoreTallies(prev => {
          const current = prev[playerId]?.total || 0
          return {
            ...prev,
            [playerId]: {
              total: current + change,
              timestamp: Date.now()
            }
          }
        })
        // Set timeout to clear tally after 3 seconds
        tallyTimeouts.current[playerId] = setTimeout(() => {
          setScoreTallies(prev => {
            const updated = { ...prev }
            delete updated[playerId]
            return updated
          })
          delete tallyTimeouts.current[playerId]
        }, 3000)
      }
      
      // Clean up any matching pending updates
      const toRemove = []
      for (const pending of pendingUpdates.current) {
        if (pending.startsWith(`${playerId}-${change}`)) {
          toRemove.push(pending)
        }
      }
      toRemove.forEach(key => pendingUpdates.current.delete(key))
    }
  }

  const handleGameCompleted = (data) => {
    if (data.game_id === game.id) {
      // Update current game preserving metadata to prevent flashing
      setCurrentGame(prevGame => ({
        ...prevGame,
        ...data.game,
        // Ensure critical display fields are preserved if missing from response
        game_type_name: data.game.game_type_name || prevGame.game_type_name,
        win_condition_type: data.game.win_condition_type || prevGame.win_condition_type,
        win_condition_value: data.game.win_condition_value !== undefined ? data.game.win_condition_value : prevGame.win_condition_value
      }))
      setWinner(data.winner)
      onGameComplete()
    }
  }

  const handlePlayerOrderUpdate = (data) => {
    if (data.game_id === game.id) {
      setGameStats(data.stats || [])
    }
  }

  const checkForWinner = (stats) => {
    if (game.finalized) return

    const winCondition = game.win_condition_value
    const winConditionType = game.win_condition_type

    let gameWinner = null

    if (winConditionType === 'win') {
      // For win conditions: first player to reach or exceed the win condition wins
      // If multiple players reach it, highest score wins
      const qualifiedPlayers = stats.filter(stat => stat.score >= winCondition)
      if (qualifiedPlayers.length > 0) {
        gameWinner = qualifiedPlayers.reduce((max, current) =>
          current.score > max.score ? current : max
        )
      }
    } else if (winConditionType === 'lose') {
      // For loss conditions: if any player meets or exceeds the loss condition,
      // the winner is the player with the lowest score (among all players)
      const anyLoser = stats.some(stat => stat.score >= winCondition)
      if (anyLoser) {
        gameWinner = stats.reduce((min, current) =>
          current.score < min.score ? current : min
        )
      }
    }

    // Always update winner state to reflect current game state
    // This allows for dynamic winner changes as scores are updated
    setWinner(gameWinner)
  }

  // Update a player's score by sending only the delta to the backend
  const updateScore = async (playerId, change) => {
    setLoading(true)
    setError('')

    // Track this update to prevent double-counting when we receive the WebSocket event
    const updateKey = `${playerId}-${change}`
    pendingUpdates.current.add(updateKey)

    // Update tally locally for immediate feedback
    if (change !== 0) {
      if (tallyTimeouts.current[playerId]) {
        clearTimeout(tallyTimeouts.current[playerId])
      }
      setScoreTallies(prev => {
        const current = prev[playerId]?.total || 0
        return {
          ...prev,
          [playerId]: {
            total: current + change,
            timestamp: Date.now()
          }
        }
      })
      tallyTimeouts.current[playerId] = setTimeout(() => {
        setScoreTallies(prev => {
          const updated = { ...prev }
          delete updated[playerId]
          return updated
        })
        delete tallyTimeouts.current[playerId]
      }, 3000)
    }

    try {
      const response = await fetch(`/api/${sqid}/games/${game.id}/stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          stats: [
            { player_id: playerId, score: change } // score is the delta
          ]
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update score')
      }

      const result = await response.json()
      // Update local state with backend's authoritative stats
      setGameStats(result.data || [])

      // Note: We don't emit socket event here because the backend already broadcasts it
      // The pendingUpdates tracking prevents double-counting the tally

    } catch (err) {
      // Improved error handling: show backend error message or full error object
      let errorMsg = 'Failed to update score';
      if (err && typeof err === 'object') {
        if (err.message) {
          errorMsg = err.message;
        } else if (err.toString) {
          errorMsg = err.toString();
        } else {
          errorMsg = JSON.stringify(err);
        }
      }
      console.error('Failed to update score:', err);
      setError(errorMsg);
      // Remove the pending update on error
      pendingUpdates.current.delete(updateKey)
    } finally {
      setLoading(false)
    }
  }

  const finalizeGame = async () => {
    if (!window.confirm('Are you sure you want to finalize this game? This action cannot be undone.')) {
      return;
    }
    setLoading(true)
    setError('')

    try {
      // Find the winner's player_id if available
      const winnerId = winner?.player_id || null;
      const endedAt = new Date().toISOString();
      const response = await fetch(`/api/${sqid}/games/${game.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ finalized: true, ended_at: endedAt, winner_id: winnerId })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to finalize game')
      }

      const result = await response.json()
      // Update current game preserving metadata to prevent flashing
      setCurrentGame(prevGame => ({
        ...prevGame,
        ...result.data,
        // Ensure critical display fields are preserved if missing from response
        game_type_name: result.data.game_type_name || prevGame.game_type_name,
        win_condition_type: result.data.win_condition_type || prevGame.win_condition_type,
        win_condition_value: result.data.win_condition_value !== undefined ? result.data.win_condition_value : prevGame.win_condition_value
      }))

      // Emit socket event to notify all clients to show rivalry stats
      if (socket) {
        socket.emit('show_rivalry_stats', {
          sqid,
          game: result.data,
          winner: winner
        })
      }

      // Locally navigate to rivalry stats screen
      setCurrentView('rivalry-stats')

    } catch (err) {
      console.error('Failed to finalize game:', err)
      setError(err.message || 'Failed to finalize game')
    } finally {
      setLoading(false)
    }
  }

  // Function to update player order
  // Only update local state in response to the player_order_updated WebSocket event
  const updatePlayerOrder = async (reorderedStats) => {
    if (loading || game.finalized) {
      return
    }

    try {
      setLoading(true)
      // Extract player IDs in the new order
      const playerOrder = reorderedStats.map(stat => stat.player_id)
      // Call API to update order, but do NOT update local state here
      const response = await fetch(`/api/${sqid}/games/${game.id}/stats/order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ playerOrder })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update player order')
      }
      // Do not update local state here; wait for WebSocket event
      // const result = await response.json()
    } catch (err) {
      console.error('Failed to update player order:', err)
      setError(err.message || 'Failed to update player order')
    } finally {
      setLoading(false)
    }
  }

  if (!game) {
    return (
      <div className="text-center">
        <p>No active game found.</p>
        <button className="btn btn-primary mt-2" onClick={backToSetup}>
          Start New Game
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2 pb-6">
      {/* Game Header with Reorder Button - Memoized to prevent flashing */}
      {React.useMemo(() => (
        <div className="relative">
          <div className="text-center">
            <h2 className="text-2xl font-bold">{gameMetadata.game_type_name || <span className="text-error">[No game_type_name]</span>}</h2>
            <p className="text-sm opacity-75">
              {(gameMetadata.win_condition_type === 'win' ? 'First to' : gameMetadata.win_condition_type === 'lose' ? 'Lose at' : '[No win_condition_type]')}
              {typeof gameMetadata.win_condition_value !== 'undefined' ? ` ${gameMetadata.win_condition_value}` : ' [No win_condition_value]'}
            </p>
            {winner && (
              <div className={`badge ${getPlayerBadgeColorClassById(winner.player_id)} badge-lg mt-1`}>
                🏆 {winner.player_name} Wins!
              </div>
            )} 
          </div>
          
          {/* Reorder Button */}
          {!game.finalized && gameStats.length > 1 && (
            <button
              onClick={() => setIsReorderMode(!isReorderMode)}
              className={`absolute top-0 left-0 btn btn-sm btn-soft gap-1 ${
                isReorderMode ? 'btn-primary btn-active' : ''
              }`}
              style={{
                minHeight: '2.5rem',
                minWidth: '2.5rem',
                touchAction: 'manipulation',
                // iOS Safari optimizations
                WebkitTapHighlightColor: 'transparent',
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                transform: 'translate3d(0, 0, 0)', // Force GPU acceleration
                backfaceVisibility: 'hidden' // Prevent flickering
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
              <span className="hidden sm:inline">{isReorderMode ? 'Done' : 'Reorder'}</span>
            </button>
          )}
        </div>
      ), [gameMetadata.game_type_name, gameMetadata.win_condition_type, gameMetadata.win_condition_value, winner, game.finalized, gameStats.length, isReorderMode])}

      {error && (
        <div className="error-state">
          <p>{error}</p>
        </div>
      )}

      {/* Player Cards Container */}
      <div className="mb-4">
        <PlayerCardsList
          gameStats={gameStats}
          updateScore={updateScore}
          updatePlayerOrder={updatePlayerOrder}
          loading={loading}
          gameFinalized={game.finalized}
          scoreTallies={scoreTallies}
          winner={winner}
          dealer={dealer}
          cycleDealer={cycleDealer}
          isReorderMode={isReorderMode}
        />
      </div>

      {/* Finalize Button Container (fixed bottom) */}
      <div className="fixed bottom-0 left-0 w-full bg-base-200 bg-opacity-95 z-50 flex flex-col justify-center items-center py-2 shadow-lg">
        {/* New Game Button (only shown when game is finalized) */}
        {game.finalized ? (
          <div className="flex gap-2 w-11/12 max-w-md mb-2">
            <button 
              className="btn btn-primary flex-1"
              onClick={backToSetup}
            >
              New Game
            </button>
          </div>
        ) : null}
        {/* Finalize Game Button (appears when winner is determined) */}
        {winner && (() => {
          const hasUnsavedScores = Object.values(scoreTallies).some(tally => tally && tally.total !== 0)
          return (
            <>
              <button
                className="btn btn-primary btn-lg w-11/12 max-w-md text-lg"
                onClick={finalizeGame}
                disabled={loading || hasUnsavedScores}
                style={{ fontSize: '5vw', minHeight: '2.5rem' }}
                title={hasUnsavedScores ? 'Waiting for score changes to be saved' : ''}
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Finalizing...
                  </>
                ) : (
                  'Finalize Game'
                )}
              </button>
              {hasUnsavedScores && (
                <div className="text-warning text-xs mt-1 text-center" style={{ fontSize: '2vw' }}>
                  Please wait for all score changes to be saved before finalizing.
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

export default GamePlay
