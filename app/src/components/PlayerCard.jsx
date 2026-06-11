import React, { useState, useRef } from 'react'
import { getPlayerTextColorClass, getPlayerBadgeColorClass, getPlayerRingColorClass } from '../utils/playerColors'

const PlayerCard = ({ 
  player, // expects { id, name, color, ... }
  score, 
  onScoreChange, 
  disabled, 
  scoreTally,
  isWinner,
  isDealer,           // New prop
  onDealerChange,     // New prop
  playerNameProps     // New prop for drag behavior
}) => {
  if (!player) return null;
  const [isUpdating, setIsUpdating] = useState(false)
  const [glowingButton, setGlowingButton] = useState(null) // 'plus' or 'minus'
  const [dealerChanging, setDealerChanging] = useState(false)
  const [localIsDealer, setLocalIsDealer] = useState(isDealer) // Local state to prevent flashing
  const longPressTimer = useRef(null)
  const pointerStartTime = useRef(null)
  const longPressExecuted = useRef(false)
  const glowTimeoutRef = useRef(null)
  const currentPointerId = useRef(null)

  // Update local dealer state when prop changes, but with transition handling
  React.useEffect(() => {
    if (!dealerChanging) {
      setLocalIsDealer(isDealer)
    }
  }, [isDealer, dealerChanging])

  const handleScoreChange = async (change) => {
    if (disabled) return
    // Trigger button glow effect
    const buttonType = change > 0 ? 'plus' : 'minus'
    setGlowingButton(buttonType)
    // Clear any existing glow timeout
    if (glowTimeoutRef.current) {
      clearTimeout(glowTimeoutRef.current)
    }
    // Remove glow after brief period - reduced from 200ms to 150ms
    glowTimeoutRef.current = setTimeout(() => {
      setGlowingButton(null)
    }, 150)
    try {
      await onScoreChange(player.id, change)
    } catch (error) {
      // Handle error silently, onScoreChange should handle error display
    }
  }

  // Handle pointer events (unified touch/mouse handling)
  const handlePointerDown = (e, change) => {
    if (disabled) return
    
    // Prevent default behavior to stop iOS drag/selection
    e.preventDefault()
    
    // Capture the pointer to ensure we get all events
    e.currentTarget.setPointerCapture(e.pointerId)
    currentPointerId.current = e.pointerId
    
    // Reset state
    longPressExecuted.current = false
    pointerStartTime.current = Date.now()
    
    // Start long press timer
    longPressTimer.current = setTimeout(() => {
      if (currentPointerId.current === e.pointerId) {
        longPressExecuted.current = true
        handleScoreChange(change * 10)
      }
    }, 300) // 300ms long press duration for scoring
  }

  const handlePointerUp = (e, change) => {
    if (disabled || currentPointerId.current !== e.pointerId) return
    
    clearTimeout(longPressTimer.current)
    currentPointerId.current = null
    
    // Only execute single tap if long press wasn't executed
    if (!longPressExecuted.current) {
      const duration = Date.now() - (pointerStartTime.current || 0)
      // Ensure it was a reasonable tap duration (not just a touch and immediate release)
      if (duration < 300 && duration > 50) {
        handleScoreChange(change)
      }
    }
    
    // Reset after a brief delay
    setTimeout(() => {
      longPressExecuted.current = false
      pointerStartTime.current = null
    }, 100)
  }

  const handlePointerCancel = (e) => {
    if (currentPointerId.current === e.pointerId) {
      clearTimeout(longPressTimer.current)
      currentPointerId.current = null
      longPressExecuted.current = false
      pointerStartTime.current = null
    }
  }

  // Prevent click events when long press was executed
  const handleClick = (e, change) => {
    if (disabled) return
    
    // Prevent any click processing if we just did a long press
    if (longPressExecuted.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
  }

  const handleDealerClick = async (e) => {
    e.stopPropagation() // Prevent any parent click handlers
    
    if (disabled || !onDealerChange) return
    
    setDealerChanging(true)
    try {
      await onDealerChange() // No longer need to pass player.id since it cycles
    } catch (error) {
      console.error('Failed to change dealer:', error)
    } finally {
      // Reduced delay to prevent flashing when state updates - from 100ms to 75ms
      setTimeout(() => {
        setDealerChanging(false)
      }, 75)
    }
  }


  // Format tally as +# or -#, bold, colored, superscript
  const formatScoreTally = (tally) => {
    if (!tally) return ''
    const sign = tally.total > 0 ? '+' : tally.total < 0 ? '' : ''
    return `${sign}${tally.total}`
  }

  return (
    <div className={`player-card relative ${isWinner && player.color ? `ring-4 ${getPlayerRingColorClass(player)}` : ''}`}>


      {/* Winner Badge - adjust positioning since dealer icon is always present */}
      {isWinner && player.color && (
        <div className={`absolute -top-2 -left-3 badge ${getPlayerBadgeColorClass(player)}`}>
          🏆 Winner
        </div>
      )}

      {/* Player Name and Dealer Card Icon aligned */}
      <div 
        className="player-name-area py-2 px-1 rounded mb-1 flex items-center justify-center gap-2"
        {...(playerNameProps || {})}
      >
        <h3 className={`text-xl font-bold text-center ${getPlayerTextColorClass(player)}`}> 
          {player.name}
        </h3>
        {/* Dealer Card Icon - now on the right of name */}
        <div
          className={`w-8 h-8 flex items-center justify-center
            ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-110'}
            transition-all duration-200
            ${dealerChanging ? 'animate-pulse' : ''}
            ${localIsDealer && !dealerChanging ? 'opacity-100' : 'opacity-30 hover:opacity-60'}
          `}
          onClick={handleDealerClick}
          title={disabled ?
            'Dealer selection disabled (game finalized)' :
            'Tap to cycle to next dealer'
          }
          style={{ minWidth: '2rem' }}
        >
          {/* Playing Card SVG from RivalryStats timeline */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`h-6 w-6 drop-shadow-lg transition-colors duration-200 ${
              localIsDealer && !dealerChanging ? getPlayerTextColorClass(player) : 'text-gray-400'
            }`}
          >
            <rect x="3" y="5" width="11.2" height="14.4" rx="1.6" fill="#222" stroke="#fff" strokeWidth="1.2" />
            <rect x="7" y="1" width="11.2" height="14.4" rx="1.6" fill="#444" stroke="#fff" strokeWidth="1.2" />
            <text x="9" y="11" fontSize="5.6" fill="#fff" fontWeight="bold" fontFamily="monospace">D</text>
            <text x="13.5" y="6" fontSize="5.6" fill="#fff" fontWeight="bold" fontFamily="monospace">♠</text>
          </svg>
        </div>
      </div>

      {/* Score Display with Tally Superscript */}
      <div className="score-display relative flex items-center justify-center text-3xl font-bold">
        {typeof score !== 'undefined' ? score : (typeof player.score !== 'undefined' ? player.score : 0)}
        {scoreTally && scoreTally.total !== 0 && (
          <sup
            key={scoreTally.timestamp} // Force re-render and restart animation when timestamp changes
            className={`absolute -top-1 -right-2 text-sm font-bold
              ${scoreTally.total > 0 ? 'text-green-400' : 'text-red-400'}
              bg-base-200 px-1 py-0.5 rounded shadow-lg
              score-tally-animation
            `}
            style={{
              fontSize: '0.9em',
              zIndex: 10,
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
            aria-live="polite"
          >
            {formatScoreTally(scoreTally)}
          </sup>
        )}
      </div>

      {/* Score Control Buttons */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        {/* Minus Button */}
        <button
          className={`btn btn-error btn-lg text-4xl font-bold w-full max-w-20 mx-auto transition-all duration-200 ${
            glowingButton === 'minus' ? 'ring-4 ring-error ring-opacity-75 shadow-lg shadow-error/50 scale-105' : ''
          }`}
          style={{ 
            aspectRatio: '1', 
            minHeight: '5rem', 
            height: '5rem',
            touchAction: 'manipulation', // Prevents iOS zoom and improves touch responsiveness
            WebkitUserSelect: 'none', // Prevent text selection
            userSelect: 'none',
            WebkitTouchCallout: 'none', // Prevent iOS callout menu
            WebkitTapHighlightColor: 'transparent' // Remove tap highlight
          }}
          onPointerDown={(e) => handlePointerDown(e, -1)}
          onPointerUp={(e) => handlePointerUp(e, -1)}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerCancel}
          onClick={(e) => handleClick(e, -1)}
          onContextMenu={(e) => e.preventDefault()} // Prevent right-click/long-press context menu
          onDragStart={(e) => e.preventDefault()} // Prevent drag
          disabled={disabled}
          title="Tap: -1, Long press: -10"
        >
          -
        </button>

        {/* Plus Button */}
        <button
          className={`btn btn-success btn-lg text-4xl font-bold w-full max-w-20 mx-auto transition-all duration-200 ${
            glowingButton === 'plus' ? 'ring-4 ring-success ring-opacity-75 shadow-lg shadow-success/50 scale-105' : ''
          }`}
          style={{ 
            aspectRatio: '1', 
            minHeight: '5rem', 
            height: '5rem',
            touchAction: 'manipulation', // Prevents iOS zoom and improves touch responsiveness
            WebkitUserSelect: 'none', // Prevent text selection
            userSelect: 'none',
            WebkitTouchCallout: 'none', // Prevent iOS callout menu
            WebkitTapHighlightColor: 'transparent' // Remove tap highlight
          }}
          onPointerDown={(e) => handlePointerDown(e, 1)}
          onPointerUp={(e) => handlePointerUp(e, 1)}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerCancel}
          onClick={(e) => handleClick(e, 1)}
          onContextMenu={(e) => e.preventDefault()} // Prevent right-click/long-press context menu
          onDragStart={(e) => e.preventDefault()} // Prevent drag
          disabled={disabled}
          title="Tap: +1, Long press: +10"
        >
          +
        </button>
      </div>
    </div>
  )
}

export default PlayerCard
