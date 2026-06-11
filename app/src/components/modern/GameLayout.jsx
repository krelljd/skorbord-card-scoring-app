import React, { memo } from 'react'
import { useGameState } from '../contexts/GameStateContext'
import PlayerCard from './modern/PlayerCard'

/**
 * Modern GameLayout component using DaisyUI semantic patterns
 * Focuses on layout and presentation, delegating state to context
 */
const GameLayout = memo(function GameLayout({ 
  onScoreChange, 
  onDealerChange,
  onReorderToggle 
}) {
  const { 
    game, 
    gameStats, 
    scoreTallies, 
    winner, 
    dealer, 
    loading, 
    error,
    isReorderMode,
    glowingCards 
  } = useGameState()

  if (!game) {
    return (
      <div className="hero min-h-96 bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold text-base-content">No Game Found</h1>
            <p className="py-6 text-base-content/70">
              Start a new game to begin playing
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loading && gameStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="text-base-content/70">Loading game...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-6">
      {/* Game Header */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <h2 className="card-title text-2xl justify-center">
                {game.game_type_name || 'Unknown Game'}
              </h2>
              <p className="text-base-content/70">
                {game.win_condition_type === 'win' ? 'First to' : 'Lose at'} {game.win_condition_value}
              </p>
              
              {/* Winner Announcement */}
              {winner && (
                <div className="alert alert-success mt-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">🏆 {winner.player_name} Wins!</span>
                </div>
              )}
            </div>
            
            {/* Reorder Toggle */}
            {!game.finalized && gameStats.length > 1 && (
              <button
                onClick={onReorderToggle}
                className={`btn btn-sm ${isReorderMode ? 'btn-primary' : 'btn-outline'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
                {isReorderMode ? 'Done' : 'Reorder'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Players Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {gameStats.map((stat, index) => {
          const player = {
            id: stat.player_id,
            name: stat.player_name,
            color: stat.color || 'primary',
            score: stat.score
          }

          const isGlowing = glowingCards.has(player.id)

          return (
            <div
              key={player.id}
              className={`
                transition-all duration-300
                ${isGlowing ? 'scale-105 ring-4 ring-primary ring-opacity-50' : ''}
                ${isReorderMode ? 'cursor-move' : ''}
              `}
            >
              <PlayerCard
                player={player}
                score={stat.score}
                onScoreChange={(change) => onScoreChange(player.id, change)}
                disabled={loading || game.finalized || isReorderMode}
                scoreTally={scoreTallies[player.id]}
                isWinner={winner?.player_id === player.id}
                isDealer={dealer === player.id}
                onDealerChange={game.finalized || isReorderMode ? null : onDealerChange}
              />
            </div>
          )
        })}
      </div>

      {/* Game Actions */}
      {!game.finalized && winner && (
        <div className="text-center">
          <button className="btn btn-success btn-lg">
            🏆 Finalize Game
          </button>
        </div>
      )}
    </div>
  )
})

export default GameLayout
