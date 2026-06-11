import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useConnection } from '../contexts/ConnectionContext.jsx'
import { getPlayerBadgeColorClassById } from '../utils/playerColors'
import PlayerCard from './PlayerCard.jsx'

// Custom hook for managing score tallies with proper cleanup
function useScoreTallies() {
  const [scoreTallies, setScoreTallies] = useState({})
  const tallyTimeouts = useRef({})
  const isMounted = useRef(true)

  // Cleanup function for removing tally
  const clearTally = useCallback((playerId) => {
    if (isMounted.current && tallyTimeouts.current) {
      setScoreTallies(prev => {
        const updated = { ...prev }
        delete updated[playerId]
        return updated
      })
      delete tallyTimeouts.current[playerId]
    }
  }, [])

  // Add or update tally for a player
  const updateTally = useCallback((playerId, change) => {
    if (change === 0) return

    // Clear existing timeout
    if (tallyTimeouts.current[playerId]) {
      clearTimeout(tallyTimeouts.current[playerId])
    }

    // Update tally state
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
      clearTally(playerId)
    }, 3000)
  }, [clearTally])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false
      Object.values(tallyTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout)
      })
      tallyTimeouts.current = {}
    }
  }, [])

  return { scoreTallies, updateTally }
}

// Custom hook for managing pending updates tracking
function usePendingUpdates() {
  const pendingUpdates = useRef(new Set())

  const addPendingUpdate = useCallback((key) => {
    if (pendingUpdates.current) {
      pendingUpdates.current.add(key)
    }
  }, [])

  const removePendingUpdate = useCallback((key) => {
    if (pendingUpdates.current) {
      pendingUpdates.current.delete(key)
    }
  }, [])

  const hasPendingUpdate = useCallback((key) => {
    return pendingUpdates.current && pendingUpdates.current.has(key)
  }, [])

  const cleanupMatchingUpdates = useCallback((playerId, change) => {
    if (!pendingUpdates.current || typeof pendingUpdates.current.values !== 'function') return

    const toRemove = []
    for (const pending of pendingUpdates.current) {
      if (pending.startsWith(`${playerId}-${change}`)) {
        toRemove.push(pending)
      }
    }
    toRemove.forEach(key => pendingUpdates.current.delete(key))
  }, [])

  return {
    addPendingUpdate,
    removePendingUpdate,
    hasPendingUpdate,
    cleanupMatchingUpdates
  }
}

// Custom hook for managing reorder glow effects
function useReorderGlow() {
  const [glowingCards, setGlowingCards] = useState(new Set())
  const glowTimeouts = useRef({})

  // Trigger glow for a player
  const triggerGlow = useCallback((playerId) => {
    // Clear existing timeout
    if (glowTimeouts.current[playerId]) {
      clearTimeout(glowTimeouts.current[playerId])
    }

    // Add glow effect
    setGlowingCards(prev => new Set([...prev, playerId]))

    // Remove glow after animation duration (1200ms to match CSS animation)
    glowTimeouts.current[playerId] = setTimeout(() => {
      setGlowingCards(prev => {
        const next = new Set(prev)
        next.delete(playerId)
        return next
      })
      delete glowTimeouts.current[playerId]
    }, 1200)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(glowTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout)
      })
      glowTimeouts.current = {}
    }
  }, [])

  return { glowingCards, triggerGlow }
}

// Optimized PlayerCardsList component with memoization
const PlayerCardsList = React.memo(function PlayerCardsList({
  gameStats,
  updateScore,
  updatePlayerOrder,
  loading,
  gameFinalized,
  scoreTallies,
  winner,
  dealer,
  cycleDealer,
  isReorderMode,
  glowingCards,
  onReorderMove,
  moveUp,
  moveDown
}) {
  return (
    <div className="space-y-2 player-cards-container">
      <div className="grid gap-2">
        {gameStats.map((stat, index) => {
          // Construct player object - memoized within map
          const player = {
            id: stat.player_id,
            name: stat.player_name,
            color: stat.color || 'primary',
            score: stat.score
          };

          const isGlowing = glowingCards.has(player.id);

          // Debug logging for glow state
          if (isGlowing) {
            console.log(`Player ${player.name} (${player.id}) is glowing - applying modern Tailwind CSS animations`);
          }

          return (
            <div
              key={player.id}
              className={[
                'player-card-container',
                isReorderMode ? 'flex items-center gap-2 bg-base-200/10 rounded-lg p-1' : '',
                isGlowing ? 'animate-in fade-in-25 zoom-in-95 duration-300 shadow-[0_0_16px_4px_var(--tw-shadow-color)] shadow-primary/70 ring-4 ring-primary/60 ring-offset-2 ring-offset-base-200 bg-primary/20 border-2 border-primary player-reorder-highlight player-reorder-status' : ''
              ].filter(Boolean).join(' ')}
              style={
                isGlowing
                  ? {
                      transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      zIndex: 50,
                      '--tw-shadow-color': '#3b82f6'
                    }
                  : undefined
              }
            >
              {/* Reorder buttons - left side */}
              {isReorderMode && (
                <div className="flex flex-col gap-1 ml-1">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className={`btn btn-xs btn-primary${index === 0 ? ' btn-disabled opacity-30' : ''}`}
                    style={{ minHeight: '1.75rem', minWidth: '1.75rem', touchAction: 'manipulation' }}
                    title="Move up"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === gameStats.length - 1}
                    className={`btn btn-xs btn-primary${index === gameStats.length - 1 ? ' btn-disabled opacity-30' : ''}`}
                    style={{ minHeight: '1.75rem', minWidth: '1.75rem', touchAction: 'manipulation' }}
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
            </div>
          );
        })}
      </div>
    </div>
  );
});

const GamePlay = ({ 
  sqid, 
  game, 
  setCurrentGame, 
  setCurrentView, 
  onGameComplete,
  backToSetup 
}) => {
  const { socket } = useConnection()
  const [gameStats, setGameStats] = useState([])
  const [loading, setLoading] = useState(false)
  const [dealer, setDealer] = useState(null)
  const [isReorderMode, setIsReorderMode] = useState(false)
  const [error, setError] = useState('')
  const [winner, setWinner] = useState(null)
  const [gameMetadata, setGameMetadata] = useState(() => ({
    game_type_name: game?.game_type_name,
    win_condition_type: game?.win_condition_type,
    win_condition_value: game?.win_condition_value
  }))
  const { scoreTallies, updateTally } = useScoreTallies()
  const {
    addPendingUpdate,
    removePendingUpdate,
    hasPendingUpdate,
    cleanupMatchingUpdates
  } = usePendingUpdates()
  const { glowingCards, triggerGlow } = useReorderGlow()
  
  // Memoized winner calculation function
  const checkForWinner = useCallback((stats) => {
    if (game?.finalized) return
  
    const winCondition = game?.win_condition_value
    const winConditionType = game?.win_condition_type
    let gameWinner = null
  
    if (winConditionType === 'win') {
      const qualifiedPlayers = stats.filter(stat => stat.score >= winCondition)
      if (qualifiedPlayers.length > 0) {
        gameWinner = qualifiedPlayers.reduce((max, current) =>
          current.score > max.score ? current : max
        )
      }
    } else if (winConditionType === 'lose') {
      const anyLoser = stats.some(stat => stat.score >= winCondition)
      if (anyLoser) {
        gameWinner = stats.reduce((min, current) =>
          current.score < min.score ? current : min
        )
      }
    }
  
    setWinner(gameWinner)
  }, [game?.finalized, game?.win_condition_value, game?.win_condition_type])
  
  // Optimized socket event handlers with useCallback
  const handleScoreUpdate = useCallback((data) => {
    if (data.game_id === game?.id) {
      setGameStats(data.stats)
      
      const playerId = data.player_id
      const change = data.score_change
      
      if (change !== 0 && !hasPendingUpdate(`${playerId}-${change}`)) {
        updateTally(playerId, change)
      }
      
      cleanupMatchingUpdates(playerId, change)
    }
  }, [game?.id, hasPendingUpdate, updateTally, cleanupMatchingUpdates])
  
  const handleGameCompleted = useCallback((data) => {
    if (data.game_id === game?.id) {
      setCurrentGame(prevGame => ({
        ...prevGame,
        ...data.game,
        game_type_name: data.game.game_type_name || prevGame.game_type_name,
        win_condition_type: data.game.win_condition_type || prevGame.win_condition_type,
        win_condition_value: data.game.win_condition_value !== undefined ? data.game.win_condition_value : prevGame.win_condition_value
      }))
      setWinner(data.winner)
      onGameComplete()
    }
  }, [game?.id, setCurrentGame, onGameComplete])
  
  const handlePlayerOrderUpdate = useCallback((data) => {
    if (data.game_id === game?.id) {
      setGameStats(data.stats || [])
      
      if (data.moved_player_id) {
        triggerGlow(data.moved_player_id)
      } else if (data.stats && data.stats.length > 0) {
        const playerId = data.stats[0].player_id
        triggerGlow(playerId)
      }
    }
  }, [game?.id, triggerGlow])
  
  // Initialize game state and socket listeners
  useEffect(() => {
    if (!game || !socket) return
  
    setGameMetadata({
      game_type_name: game?.game_type_name,
      win_condition_type: game?.win_condition_type,
      win_condition_value: game?.win_condition_value
    })
  
    if (game?.dealer_id) {
      setDealer(game?.dealer_id)
    }
  
    socket.on('score_update', handleScoreUpdate)
    socket.on('game_completed', handleGameCompleted)
    socket.on('player_order_updated', handlePlayerOrderUpdate)
  
    return () => {
      socket.off('score_update', handleScoreUpdate)
      socket.off('game_completed', handleGameCompleted)
      socket.off('player_order_updated', handlePlayerOrderUpdate)
    }
  }, [game, socket, handleScoreUpdate, handleGameCompleted, handlePlayerOrderUpdate])
  
  useEffect(() => {
    if (gameStats.length > 0) {
      checkForWinner(gameStats)
    }
  }, [gameStats, checkForWinner])
  
  useEffect(() => {
    const fetchGameStats = async () => {
      if (!sqid || !game?.id) return
  
      try {
        setLoading(true)
        const response = await fetch(`/api/${sqid}/games/${game?.id}/stats`)
        if (response.ok) {
          const result = await response.json()
          setGameStats(result.data || [])
        }
      } catch (err) {
        console.error('Failed to fetch game stats:', err)
      } finally {
        setLoading(false)
      }
    }
  
    fetchGameStats()
  }, [sqid, game?.id])
  
  const updateScore = useCallback(async (playerId, change) => {
    setLoading(true)
  
    const updateKey = `${playerId}-${change}`
    addPendingUpdate(updateKey)
  
    updateTally(playerId, change)
  
    try {
      const response = await fetch(`/api/${sqid}/games/${game?.id}/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats: [{ player_id: playerId, score: change }]
        })
      })
  
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update score')
      }
  
      const result = await response.json()
      setGameStats(result.data || [])
  
    } catch (err) {
      console.error('Failed to update score:', err)
      removePendingUpdate(updateKey)
    } finally {
      setLoading(false)
    }
  }, [sqid, game?.id, addPendingUpdate, removePendingUpdate, updateTally])
  
  const updatePlayerOrder = useCallback(async (reorderedStats) => {
    if (loading || game?.finalized) return
  
    try {
      setLoading(true)
      const playerOrder = reorderedStats.map(stat => stat.player_id)
      
      const response = await fetch(`/api/${sqid}/games/${game?.id}/stats/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerOrder })
      })
  
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update player order')
      }
    } catch (err) {
      console.error('Failed to update player order:', err)
    } finally {
      setLoading(false)
    }
  }, [loading, game?.finalized, game?.id, sqid])

  // Reorder functions - defined after updatePlayerOrder to avoid temporal dead zone
  const moveUp = useCallback((index) => {
    if (index === 0) return
    const newStats = [...gameStats]
    const temp = newStats[index]
    newStats[index] = newStats[index - 1]
    newStats[index - 1] = temp
    setGameStats(newStats)
    updatePlayerOrder(newStats)
  }, [gameStats, updatePlayerOrder])

  const moveDown = useCallback((index) => {
    if (index === gameStats.length - 1) return
    const newStats = [...gameStats]
    const temp = newStats[index]
    newStats[index] = newStats[index + 1]
    newStats[index + 1] = temp
    setGameStats(newStats)
    updatePlayerOrder(newStats)
  }, [gameStats, updatePlayerOrder])
  
  const finalizeGame = useCallback(async () => {
    if (!window.confirm('Are you sure you want to finalize this game? This action cannot be undone.')) {
      return;
    }
    try {
      const winnerId = winner?.player_id || null
      const endedAt = new Date().toISOString()
      const response = await fetch(`/api/${sqid}/games/${game?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalized: true, ended_at: endedAt, winner_id: winnerId })
      })
  
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to finalize game')
      }
  
      const result = await response.json()
      setCurrentGame(prevGame => ({
        ...prevGame,
        ...result.data,
        game_type_name: result.data.game_type_name || prevGame.game_type_name,
        win_condition_type: result.data.win_condition_type || prevGame.win_condition_type,
        win_condition_value: result.data.win_condition_value !== undefined ? result.data.win_condition_value : prevGame.win_condition_value
      }))
  
      if (socket) {
        socket.emit('show_rivalry_stats', {
          sqid,
          game: result.data,
          winner: winner
        })
      }
  
      setCurrentView('rivalry-stats')
    } catch (err) {
      console.error('Failed to finalize game:', err)
    } finally {
      setLoading(false)
    }
  }, [winner, sqid, game?.id, setCurrentGame, socket, setCurrentView])

  // Dealer management functions
  const updateDealer = useCallback(async (playerId) => {
    if (loading) return
    
    try {
      setLoading(true)
      
      const response = await fetch(`/api/${sqid}/games/${game?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealer_id: playerId })
      })
      
      if (response.ok) {
        const result = await response.json()
        setDealer(result.data.dealer_id)
        
        // Update current game with new dealer, preserving existing data
        setCurrentGame(prevGame => ({
          ...prevGame,
          ...result.data,
          game_type_name: result.data.game_type_name || prevGame.game_type_name,
          win_condition_type: result.data.win_condition_type || prevGame.win_condition_type,
          win_condition_value: result.data.win_condition_value !== undefined ? result.data.win_condition_value : prevGame.win_condition_value
        }))
      }
    } catch (err) {
      console.error('Failed to update dealer:', err)
      setError('Failed to update dealer')
    } finally {
      setLoading(false)
    }
  }, [loading, sqid, game?.id, setCurrentGame])

  const cycleDealer = useCallback(async () => {
    if (gameStats.length === 0 || loading) return
    
    const currentDealerIndex = gameStats.findIndex(stat => stat.player_id === dealer)
    const nextDealerIndex = (currentDealerIndex + 1) % gameStats.length
    const nextDealer = gameStats[nextDealerIndex]
    
    await updateDealer(nextDealer.player_id)
  }, [gameStats, dealer, loading, updateDealer])
  
  const hasUnsavedScores = useMemo(() => 
    Object.values(scoreTallies).some(tally => tally && tally.total !== 0),
    [scoreTallies]
  )
  
  const gameHeader = useMemo(() => (
    <div className="relative">
      <div className="text-center">
        <h2 className="text-2xl font-bold">
          {gameMetadata.game_type_name || <span className="text-error">[No game_type_name]</span>}
        </h2>
        <p className="text-sm opacity-75">
          {(gameMetadata.win_condition_type === 'win' ? 'First to' : 
            gameMetadata.win_condition_type === 'lose' ? 'Lose at' : '[No win_condition_type]')}
          {typeof gameMetadata.win_condition_value !== 'undefined' ? ` ${gameMetadata.win_condition_value}` : ' [No win_condition_value]'}
        </p>
        {winner && (
          <div className={`badge ${getPlayerBadgeColorClassById(winner.player_id)} badge-lg mt-1`}>
            🏆 {winner.player_name} Wins!
          </div>
        )} 
      </div>
      
      {!game?.finalized && gameStats.length > 1 && (
        <button
          onClick={() => setIsReorderMode(!isReorderMode)}
          className={`absolute top-0 left-0 btn btn-sm btn-soft gap-1 ${
            isReorderMode ? 'btn-primary btn-active' : ''
          }`}
          style={{
            minHeight: '2.5rem',
            minWidth: '2.5rem',
            touchAction: 'manipulation'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
          <span className="hidden sm:inline">{isReorderMode ? 'Done' : 'Reorder'}</span>
        </button>
      )}
    </div>
  ), [gameMetadata, winner, game?.finalized, gameStats.length, isReorderMode])
  
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
  
  if (loading && gameStats.length === 0) {
    return (
      <div className="space-y-2 pb-6">
        <div className="relative">
          <div className="text-center">
            <h2 className="text-2xl font-bold">{gameMetadata.game_type_name || 'Loading...'}</h2>
            <p className="text-sm opacity-75">
              {gameMetadata.win_condition_type === 'win' ? 'First to' : 
               gameMetadata.win_condition_type === 'lose' ? 'Lose at' : 'Loading...'}
              {typeof gameMetadata.win_condition_value !== 'undefined' ? ` ${gameMetadata.win_condition_value}` : ''}
            </p>
          </div>
        </div>
        
        <div className="mb-4">
          <div className="space-y-2 player-cards-container">
            <div className="grid gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="player-card-container animate-pulse"
                >
                  <div className="bg-base-200 rounded-lg p-4 h-48"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="space-y-2 pb-6">
      {gameHeader}
      
      {error && (
        <div className="alert alert-error text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
  
      {winner && !game?.finalized && (
        <div className="text-center">
          <button
            onClick={finalizeGame}
            disabled={loading || hasUnsavedScores}
            className="btn btn-success btn-lg gap-2"
            style={{ touchAction: 'manipulation' }}
          >
            🏆 Finalize Game
            {hasUnsavedScores && (
              <span className="text-xs opacity-75">(Unsaved scores pending)</span>
            )}
          </button>
        </div>
      )}
  
      <div className="mb-4">
        <PlayerCardsList
          gameStats={gameStats}
          updateScore={updateScore}
          updatePlayerOrder={updatePlayerOrder}
          loading={loading}
          gameFinalized={game?.finalized}
          scoreTallies={scoreTallies}
          winner={winner}
          dealer={dealer}
          cycleDealer={cycleDealer}
          isReorderMode={isReorderMode}
          glowingCards={glowingCards}
          onReorderMove={triggerGlow}
          moveUp={moveUp}
          moveDown={moveDown}
        />
      </div>
  
      <div className="flex gap-2 justify-center">
        {!dealer && gameStats.length > 0 && !game?.finalized && (
          <button
            onClick={async () => {
              if (gameStats.length === 0) return
              const randomIndex = Math.floor(Math.random() * gameStats.length)
              const randomPlayer = gameStats[randomIndex]
              await updateDealer(randomPlayer.player_id)
            }}
            disabled={loading}
            className="btn btn-soft btn-sm"
          >
            Random Dealer
          </button>
        )}
        
        {process.env.NODE_ENV === 'development' && gameStats.length > 0 && (
          <button
            onClick={() => {
              const randomPlayer = gameStats[Math.floor(Math.random() * gameStats.length)]
              triggerGlow(randomPlayer.player_id)
            }}
            className="btn btn-accent btn-sm"
          >
            Test Glow
          </button>
        )}
      </div>
    </div>
  )
}

export default GamePlay