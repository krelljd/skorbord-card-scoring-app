import React, { memo } from 'react'
import { getPlayerTextColorClass } from '../utils/playerColors'
import { usePointerInteraction } from '../hooks/usePointerInteraction'

/**
 * Modern DaisyUI-first PlayerCard component following semantic design principles
 * Uses DaisyUI semantic colors and component classes for better theming
 */
const PlayerCard = memo(function PlayerCard({ 
  player, 
  score, 
  onScoreChange, 
  disabled = false, 
  scoreTally,
  isWinner = false,
  isDealer = false,
  onDealerChange,
  className = ''
}) {
  const {
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    glowingButton
  } = usePointerInteraction({
    onSingleTap: onScoreChange,
    onLongPress: (change) => onScoreChange(change * 10),
    disabled
  })

  if (!player) return null

  return (
    <div className={`
      card bg-base-100 shadow-xl border border-base-300
      ${isWinner ? 'ring-4 ring-success ring-offset-2 ring-offset-base-100' : ''}
      ${className}
    `}>
      <div className="card-body p-4">
        {/* Winner Badge */}
        {isWinner && (
          <div className="badge badge-success badge-lg absolute -top-2 -left-2">
            🏆 Winner
          </div>
        )}

        {/* Player Name Section */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <h3 className={`text-xl font-bold ${getPlayerTextColorClass(player)}`}>
            {player.name}
          </h3>
          
          {/* Dealer Indicator - Semantic DaisyUI approach */}
          <button
            onClick={onDealerChange}
            disabled={disabled}
            className={`
              btn btn-sm btn-circle
              ${isDealer ? 'btn-primary' : 'btn-ghost btn-outline'}
              ${disabled ? 'btn-disabled' : ''}
            `}
            title={disabled ? 'Dealer selection disabled' : 'Tap to cycle dealer'}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="5" width="11.2" height="14.4" rx="1.6" fill="currentColor" />
              <text x="9" y="13" fontSize="6" fill="white" fontWeight="bold">D</text>
            </svg>
          </button>
        </div>

        {/* Score Display with Tally */}
        <div className="relative text-center mb-4">
          <div className="text-4xl font-bold text-base-content">
            {score ?? player.score ?? 0}
          </div>
          
          {/* Score Tally - Using DaisyUI badge with semantic colors */}
          {scoreTally && scoreTally.total !== 0 && (
            <div 
              key={scoreTally.timestamp}
              className={`
                badge badge-sm absolute -top-2 -right-2
                ${scoreTally.total > 0 ? 'badge-success' : 'badge-error'}
                animate-in fade-in-25 zoom-in-95 duration-300
              `}
            >
              {scoreTally.total > 0 ? '+' : ''}{scoreTally.total}
            </div>
          )}
        </div>

        {/* Score Control Buttons - DaisyUI button group */}
        <div className="join w-full">
          <button
            className={`
              btn btn-error join-item flex-1 text-2xl font-bold
              ${glowingButton === 'minus' ? 'btn-active ring-4 ring-error ring-opacity-50' : ''}
            `}
            onPointerDown={(e) => handlePointerDown(e, -1)}
            onPointerUp={(e) => handlePointerUp(e, -1)}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerCancel}
            disabled={disabled}
            title="Tap: -1, Long press: -10"
          >
            −
          </button>
          
          <button
            className={`
              btn btn-success join-item flex-1 text-2xl font-bold
              ${glowingButton === 'plus' ? 'btn-active ring-4 ring-success ring-opacity-50' : ''}
            `}
            onPointerDown={(e) => handlePointerDown(e, 1)}
            onPointerUp={(e) => handlePointerUp(e, 1)}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerCancel}
            disabled={disabled}
            title="Tap: +1, Long press: +10"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
})

export default PlayerCard
