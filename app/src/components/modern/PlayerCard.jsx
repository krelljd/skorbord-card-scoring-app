import { useState, useCallback, memo, useRef } from 'react'
import { useGameState } from '../../contexts/GameStateContext.jsx'
import { usePointerInteraction } from '../../hooks/usePointerInteraction.js'

// DaisyUI semantic color mapping for players
const getPlayerColor = (index) => {
  const colors = [
    'btn-primary',    // Blue
    'btn-secondary',  // Purple
    'btn-accent',     // Green
    'btn-warning',    // Yellow
    'btn-error',      // Red
    'btn-info',       // Cyan
    'btn-success',    // Green variant
    'btn-neutral'     // Gray
  ]
  return colors[index % colors.length]
}

const getPlayerBgColor = (index) => {
  const colors = [
    'bg-primary/10',    // Light blue
    'bg-secondary/10',  // Light purple
    'bg-accent/10',     // Light green
    'bg-warning/10',    // Light yellow
    'bg-error/10',      // Light red
    'bg-info/10',       // Light cyan
    'bg-success/10',    // Light green variant
    'bg-neutral/10'     // Light gray
  ]
  return colors[index % colors.length]
}

/**
 * Modern PlayerCard component with defensive programming and DaisyUI styling
 * 
 * @param {Object} player - Player object with id, name, score properties
 * @param {number} playerIndex - Index for color assignment (defaults to 0)
 * @param {boolean} isDealer - Whether this player is the dealer
 * @param {boolean} isWinner - Whether this player is the winner
 * @param {Object} gameState - Current game state (unused but kept for compatibility)
 * @param {Function} onScoreUpdate - Callback for score updates (playerId, newScore)
 * @param {Function} onDealerClick - Callback for dealer badge clicks
 * @param {boolean} disabled - Whether interactions are disabled
 */
const PlayerCard = ({ 
  player, 
  playerIndex = 0, // Default to 0 if not provided
  isDealer, 
  isWinner,
  onScoreUpdate, 
  onDealerClick,
  disabled = false 
}) => {
  const gameState = useGameState()
  const lastUpdateRef = useRef(0)

  // Guard clause - return null if player is not provided
  if (!player) {
    console.warn('PlayerCard: player prop is undefined')
    return null
  }

  // Ensure playerIndex is a valid number
  const safePlayerIndex = typeof playerIndex === 'number' ? playerIndex : 0

  // Ensure player has required properties with defaults
  const safePlayer = {
    id: player.id || `player-${safePlayerIndex}`,
    name: player.name || `Player ${safePlayerIndex + 1}`,
    score: player.score || 0,
    gamesWon: player.gamesWon,
    ...player
  }

  // Handle score updates with debouncing for rapid taps
  const handleScoreChange = useCallback((delta) => {
    if (disabled) return
    
    // Debounce rapid taps (prevent double-taps within 100ms)
    const now = Date.now()
    if (now - lastUpdateRef.current < 100) {
      console.debug('PlayerCard: Debounced rapid tap')
      return
    }
    lastUpdateRef.current = now
    
    // Only call onScoreUpdate if it's provided
    if (typeof onScoreUpdate === 'function') {
      onScoreUpdate(safePlayer.id, delta)
    }
  }, [safePlayer.id, onScoreUpdate, disabled])

  // Handle long press for bigger score changes
  const handleLongPress = useCallback((delta) => {
    if (disabled) return
    
    // Long press - bigger change (10x)
    const longPressChange = delta * 10
    
    // Vibrate if available (mobile)
    if (navigator.vibrate) {
      navigator.vibrate([50, 100, 50]) // Triple vibration for long press
    }
    
    if (typeof onScoreUpdate === 'function') {
      onScoreUpdate(safePlayer.id, longPressChange)
    }
  }, [safePlayer.id, onScoreUpdate, disabled])

  // Use the improved pointer interaction hook
  const minusPointer = usePointerInteraction({
    onSingleTap: (change) => handleScoreChange(change),
    onLongPress: (change) => handleLongPress(change),
    disabled,
    longPressDelay: 500
  })

  const plusPointer = usePointerInteraction({
    onSingleTap: (change) => handleScoreChange(change),
    onLongPress: (change) => handleLongPress(change), 
    disabled,
    longPressDelay: 500
  })

  const handleKeyDown = useCallback((e, delta) => {
    if (disabled) return
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleScoreChange(delta)
    }
  }, [handleScoreChange, disabled])

  const playerColorClass = getPlayerColor(safePlayerIndex)
  const playerBgClass = getPlayerBgColor(safePlayerIndex)

  // Debug: log tally state for this player
  if (gameState.scoreTallies[safePlayer.id]) {
    console.debug('PlayerCard tally:', safePlayer.id, gameState.scoreTallies[safePlayer.id])
  }
  return (
    <div 
      className={`card ${playerBgClass} border-2 ${
        isWinner ? 'border-success border-solid shadow-success/50 shadow-lg animate-pulse' :
        isDealer ? 'border-primary border-dashed' : 'border-base-300'
      } ${disabled ? 'opacity-60' : ''}`}
      role="region"
      aria-label={`Player ${safePlayer.name}${isDealer ? ' (Dealer)' : ''}${isWinner ? ' (Winner)' : ''}`}
    >
      <div className="card-body p-4">
        {/* Player Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className={`text-lg font-bold ${isWinner ? 'text-success' : 'text-base-content'}`}>
              {safePlayer.name}
              {isWinner && ' 🏆'}
            </h3>
            {isDealer && (
              <button
                className="badge badge-primary badge-sm hover:badge-primary-focus active:badge-primary-focus active:scale-95 transition-all duration-150 cursor-pointer"
                onClick={onDealerClick}
                disabled={disabled}
                title="Click to cycle to next dealer"
                aria-label="Cycle to next dealer"
              >
                🃏 Dealer
              </button>
            )}
            {isWinner && (
              <div className="badge badge-success badge-sm">
                Winner
              </div>
            )}
          </div>
          <div className="text-right relative">
                <div className="flex items-center justify-end gap-3">
              {/* Score Tally - Left of Score */}
              {gameState.scoreTallies[safePlayer.id] && (
                <div
                  key={gameState.scoreTallies[safePlayer.id].timestamp}
                  className={`text-xl font-bold score-tally-animation ${
                    gameState.scoreTallies[safePlayer.id].total > 0 
                      ? 'text-success' 
                      : 'text-error'
                  }`}
                >
                  {gameState.scoreTallies[safePlayer.id].total > 0 ? '+' : ''}
                  {gameState.scoreTallies[safePlayer.id].total}
                </div>
              )}
              
              {/* Main Score */}
              <div className={`text-2xl font-bold ${isWinner ? 'text-success' : 'text-base-content'}`}>
                {safePlayer.score}
              </div>
            </div>
            
            <div className="text-xs text-base-content/60">
              points
            </div>
          </div>
        </div>

        {/* Score Controls */}
        {!disabled && (
          <div className="flex gap-2 justify-center">
            {/* Subtract Points */}
            <button
              className={`btn btn-lg ${playerColorClass} btn-outline flex-1 ${
                minusPointer.glowingButton === 'minus' ? 'btn-active' : ''
              }`}
              onPointerDown={(e) => minusPointer.handlePointerDown(e, -1)}
              onPointerMove={minusPointer.handlePointerMove}
              onPointerUp={(e) => minusPointer.handlePointerUp(e, -1)}
              onPointerCancel={minusPointer.handlePointerCancel}
              onPointerLeave={minusPointer.handlePointerLeave}
              onKeyDown={(e) => handleKeyDown(e, -1)}
              disabled={safePlayer.score === 0 || disabled}
              aria-label={`Subtract point from ${safePlayer.name}`}
              style={{ touchAction: 'manipulation' }}
            >
              <span className="text-lg">-</span>
            </button>

            {/* Add Points */}
            <button
              className={`btn btn-lg ${playerColorClass} flex-1 ${
                plusPointer.glowingButton === 'plus' ? 'btn-active' : ''
              }`}
              onPointerDown={(e) => plusPointer.handlePointerDown(e, 1)}
              onPointerMove={plusPointer.handlePointerMove}
              onPointerUp={(e) => plusPointer.handlePointerUp(e, 1)}
              onPointerCancel={plusPointer.handlePointerCancel}
              onPointerLeave={plusPointer.handlePointerLeave}
              onKeyDown={(e) => handleKeyDown(e, 1)}
              disabled={disabled}
              aria-label={`Add point to ${safePlayer.name}`}
              style={{ touchAction: 'manipulation' }}
            >
              <span className="text-lg">+</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Memoize PlayerCard to prevent unnecessary re-renders
// Only re-render when player data, state, or callbacks change
export default memo(PlayerCard)
