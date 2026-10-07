import { useCallback, memo, useRef, forwardRef } from 'react'
import { usePointerInteraction } from '../../hooks/usePointerInteraction.js'

/**
 * Modern PlayerCard component with defensive programming and DaisyUI styling
 * 
 * @param {Object} player - Player object with id, name, score properties
 * @param {number} playerIndex - Index for color assignment (defaults to 0)
 * @param {boolean} isDealer - Whether this player is the dealer
 * @param {boolean} partsMode - Cribbage: Hand and Crib buttons replace + and - (play has its own shared sheet)
 * @param {{play:number,hand:number,crib:number}|null} draftParts - This round's points by part
 * @param {Function} onPartClick - (playerId, part) when a part button is tapped
 * @param {boolean} showCrib - Mark the dealer as owner of this round's crib (cribbage)
 * @param {boolean} isWinner - Whether this player is the winner
 * @param {number|null} target - Score that ends the game, for the progress bar (omit when there is none)
 * @param {number} draft - Points entered so far in the open round
 * @param {Function} onDraftClick - Opens the number pad for this player's round points
 * @param {Function} onScoreUpdate - Callback for score updates (playerId, newScore)
 * @param {Function} onDealerClick - Callback for dealer badge clicks
 * @param {boolean} disabled - Whether interactions are disabled
 */
const PlayerCard = forwardRef(({
  player,
  playerIndex = 0, // Default to 0 if not provided
  isDealer,
  showCrib = false,
  partsMode = false,
  draftParts = null,
  onPartClick,
  isWinner,
  draft = 0,
  target = null,
  onDraftClick,
  onScoreUpdate,
  onDealerClick,
  disabled = false
}, ref) => {
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

  const color = `var(--pc-${safePlayerIndex % 8})`
  const progress = target > 0 ? Math.max(0, Math.min(100, Math.round((safePlayer.score / target) * 100))) : null
  const roundLabel = `${draft > 0 ? '+' : ''}${draft}`

  return (
    <div
      ref={ref}
      className={`pc-card ${disabled ? 'opacity-60' : ''}`}
      style={{ '--c': color }}
      data-dealer={isDealer ? 'true' : 'false'}
      data-winner={isWinner ? 'true' : 'false'}
      role="region"
      aria-label={`Player ${safePlayer.name}${isDealer ? ' (Dealer)' : ''}${isWinner ? ' (Winner)' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div className="pc-avatar" aria-hidden="true">
          {safePlayer.name.trim().charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold leading-tight">{safePlayer.name}</h3>
          {isWinner ? (
            <span className="pc-label font-bold">Winner</span>
          ) : isDealer ? (
            <button
              type="button"
              className="pc-label font-bold underline decoration-dotted underline-offset-2 min-h-6"
              onClick={onDealerClick}
              disabled={disabled}
              title="Tap to pass the deal to the next player"
              aria-label="Cycle to next dealer"
            >
              Dealer{showCrib ? ' · Crib' : ''}
            </button>
          ) : null}
        </div>

        {/* This round's points: stays until the round is saved. Tap to type an exact value */}
        <button
          type="button"
          className={`pc-chip ${draft < 0 ? 'text-error' : draft === 0 ? 'text-base-content/70' : ''}`}
          style={draft > 0 ? { color: 'var(--c)' } : undefined}
          onClick={() => onDraftClick?.(safePlayer.id)}
          disabled={disabled}
          aria-label={`Points this round for ${safePlayer.name}: ${draft}. Tap to enter`}
          data-testid="round-chip"
        >
          {roundLabel}
        </button>

        <div className={`pc-score ${safePlayer.score < 0 ? 'text-error' : ''}`}>{safePlayer.score}</div>
      </div>

      {progress !== null && (
        <div
          className="pc-track"
          role="progressbar"
          aria-label={`${safePlayer.name} progress to ${target}`}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.max(0, safePlayer.score)}
        >
          <i style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Cribbage: Hand and Crib buttons, each opens the number pad */}
      {!disabled && partsMode && (
        <div className="flex gap-2" data-testid="part-buttons">
          {['hand', 'crib'].filter((part) => part !== 'crib' || isDealer).map((part) => {
            const value = draftParts ? draftParts[part] : part === 'play' ? draft : 0
            return (
              <button
                key={part}
                type="button"
                className={`pc-btn ${value > 0 ? '' : 'pc-btn-outline'}`}
                onClick={() => onPartClick?.(safePlayer.id, part)}
                aria-label={`${part} points for ${safePlayer.name}: ${value}`}
              >
                <span className="capitalize">{part}</span>
                <span className="text-xs font-medium opacity-90">{value > 0 ? `+${value}` : value}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Score Controls */}
      {!disabled && !partsMode && (
        <div className="flex gap-2">
          <button
            type="button"
            className={`pc-btn pc-btn-outline text-2xl ${minusPointer.glowingButton === 'minus' ? 'opacity-70' : ''}`}
            onPointerDown={(e) => minusPointer.handlePointerDown(e, -1)}
            onPointerMove={minusPointer.handlePointerMove}
            onPointerUp={(e) => minusPointer.handlePointerUp(e, -1)}
            onPointerCancel={minusPointer.handlePointerCancel}
            onPointerLeave={minusPointer.handlePointerLeave}
            onKeyDown={(e) => handleKeyDown(e, -1)}
            disabled={safePlayer.score <= -999 || disabled}
            aria-label={`Subtract point from ${safePlayer.name}`}
            style={{ touchAction: 'manipulation' }}
          >
            <span aria-hidden="true">−</span>
          </button>

          <button
            type="button"
            className={`pc-btn text-2xl ${plusPointer.glowingButton === 'plus' ? 'opacity-80' : ''}`}
            onPointerDown={(e) => plusPointer.handlePointerDown(e, 1)}
            onPointerMove={plusPointer.handlePointerMove}
            onPointerUp={(e) => plusPointer.handlePointerUp(e, 1)}
            onPointerCancel={plusPointer.handlePointerCancel}
            onPointerLeave={plusPointer.handlePointerLeave}
            onKeyDown={(e) => handleKeyDown(e, 1)}
            disabled={safePlayer.score >= 999 || disabled}
            aria-label={`Add point to ${safePlayer.name}`}
            style={{ touchAction: 'manipulation' }}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      )}
    </div>
  )
})

PlayerCard.displayName = 'PlayerCard'

// Memoize PlayerCard to prevent unnecessary re-renders
// Only re-render when player data, state, or callbacks change
export default memo(PlayerCard)
