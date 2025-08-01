import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useGameManager } from '../../hooks/useGameManager.js'
import { useGameState } from '../../contexts/GameStateContext.jsx'
import { useToast } from '../Toast.jsx'
import { useLoading } from '../../hooks/useUIState.js'
import { parseError } from '../../utils/errorUtils.js'
import { LoadingSpinner } from '../Loading.jsx'
import PlayerCard from './PlayerCard.jsx'

/**
 * Modern GamePlay component using:
 * - useGameManager hook for state management
 * - gameAPI service for data operations
 * - DaisyUI semantic classes
 * - Proper error handling with toast notifications
 */
const GamePlay = ({ 
  sqid, 
  onGameFinalized, 
  onBackToSetup 
}) => {
  const gameManager = useGameManager(sqid)
  const gameState = useGameState()
  const { addToast } = useToast()
  const { isLoading, withLoading } = useLoading()
  
  // Toast helper functions
  const showSuccess = useCallback((message) => addToast(message, 'success'), [addToast])
  const showError = useCallback((message) => addToast(message, 'error'), [addToast])
  
  // Local UI state
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false)
  const [dealerModalOpen, setDealerModalOpen] = useState(false)

  // Memoized sorted players for performance
  const sortedPlayers = useMemo(() => {
    if (!gameManager.gameStats) return []
    
    return [...gameManager.gameStats].sort((a, b) => {
      // Sort by player_order first, then by score descending
      const orderDiff = (a.player_order || 999) - (b.player_order || 999)
      if (orderDiff !== 0) return orderDiff
      return (b.score || 0) - (a.score || 0)
    })
  }, [gameManager.gameStats])

  // Handle score updates with optimistic UI and error recovery
  const handleScoreUpdate = useCallback(async (playerId, change) => {
    try {
      await gameManager.updatePlayerScore(playerId, change)
    } catch (error) {
      showError(`Failed to update score: ${parseError(error).message}`)
    }
  }, [gameManager, showError])

  // Handle dealer change
  const handleDealerChange = useCallback(async (playerId) => {
    try {
      await withLoading(async () => {
        await gameManager.setDealer(playerId)
        setDealerModalOpen(false)
      })
    } catch (error) {
      showError(`Failed to update dealer: ${parseError(error).message}`)
    }
  }, [gameManager, setDealerModalOpen, withLoading, showError])

  // Cycle to next dealer (click functionality)
  const cycleDealer = useCallback(async () => {
    if (!gameManager.game || !sortedPlayers.length) return

    const currentDealerId = gameManager.game.dealer_id
    const currentIndex = sortedPlayers.findIndex(p => p.player_id === currentDealerId)
    const nextIndex = (currentIndex + 1) % sortedPlayers.length
    const nextDealer = sortedPlayers[nextIndex]

    try {
      await gameManager.setDealer(nextDealer.player_id)
    } catch (error) {
      showError(`Failed to change dealer: ${parseError(error).message}`)
    }
  }, [gameManager, sortedPlayers, showError])

  // Handle player order updates
  const handlePlayerOrderUpdate = useCallback(async (newOrder) => {
    try {
      await gameManager.updatePlayerOrder(newOrder)
      showSuccess('Player order updated')
    } catch (error) {
      showError(`Failed to update player order: ${parseError(error).message}`)
    }
  }, [gameManager, showSuccess, showError])

  // Handle game finalization
  const handleFinalizeGame = async () => {
    try {
      await withLoading(async () => {
        await gameManager.finalizeGame()
        showSuccess('Game finalized successfully!')
        setShowFinalizeConfirm(false)
        // Navigate to rivalry stats view after finalization
        if (onGameFinalized) {
          onGameFinalized()
        } else if (typeof setCurrentView === 'function') {
          setCurrentView('rivalry-stats')
        }
      })
    } catch (error) {
      showError(`Failed to finalize game: ${parseError(error).message}`)
    }
  }

  // Loading state
  if (gameManager.loading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 space-y-4">
        <LoadingSpinner size="lg" />
        <p className="text-base-content/70">Loading game data...</p>
      </div>
    )
  }

  // No game state
  if (!gameManager.game) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 space-y-4">
        <div className="text-6xl">🎮</div>
        <h2 className="text-2xl font-bold text-base-content">No Active Game</h2>
        <p className="text-base-content/70 text-center max-w-md">
          Start a new game from the setup page to begin tracking scores.
        </p>
        {onBackToSetup && (
          <button 
            className="btn btn-primary"
            onClick={onBackToSetup}
          >
            Back to Setup
          </button>
        )}
      </div>
    )
  }

  const { game } = gameManager
  const isFinalized = game.finalized

  return (
    <div className="space-y-6">
      {/* Game Header */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="card-title text-2xl">
                {game.game_type_name || 'Card Game'}
              </h1>
              <p className="text-base-content/70">
                Reach <span className='font-bold text-primary'>{game.win_condition_value || 'unknown'}</span> to <span className='font-bold text-secondary'>{game.win_condition_type || 'unknown'}</span>
              </p>
            </div>
            
            {/* Game Actions */}
            <div className="flex flex-wrap gap-2">
              {/* Only show Finalize Game button if there is a winner and game is not finalized */}
              {!isFinalized && gameState.winner && (
                <button
                  className="btn btn-error btn-sm"
                  onClick={() => setShowFinalizeConfirm(true)}
                >
                  Finalize Game
                </button>
              )}
              {onBackToSetup && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={onBackToSetup}
                >
                  Back to Setup
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Players Grid */}
      {sortedPlayers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedPlayers.map((playerStat, index) => {
            const currentScore = playerStat.score || 0;
            const isWinner = gameState.winner?.player_id === playerStat.player_id;
            return (
              <PlayerCard
                key={playerStat.player_id}
                player={{
                  id: playerStat.player_id,
                  name: playerStat.player_name,
                  score: currentScore,
                  gamesWon: playerStat.games_won
                }}
                playerIndex={index}
                onScoreUpdate={(playerId, newScore) => {
                  // Convert from newScore to change for handleScoreUpdate
                  const change = newScore - currentScore;
                  return handleScoreUpdate(playerId, change);
                }}
                isDealer={game.dealer_id === playerStat.player_id}
                isWinner={isWinner}
                onDealerClick={cycleDealer}
                disabled={isFinalized || gameManager.loading}
              />
            );
          })}
        </div>
      ) : (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body text-center">
            <p className="text-base-content/70">No players in this game yet.</p>
          </div>
        </div>
      )}

      {/* Dealer Selection Modal */}
      {dealerModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Select New Dealer</h3>
            <div className="space-y-2">
              {sortedPlayers.map((playerStat) => (
                <button
                  key={playerStat.player_id}
                  className={`btn btn-block justify-start ${
                    game.dealer_id === playerStat.player_id ? 'btn-primary' : 'btn-ghost'
                  }`}
                  onClick={() => handleDealerChange(playerStat.player_id)}
                >
                  {playerStat.player_name}
                  {game.dealer_id === playerStat.player_id && (
                    <span className="badge badge-primary badge-sm ml-2">Current</span>
                  )}
                </button>
              ))}
            </div>
            <div className="modal-action">
              <button 
                className="btn btn-ghost"
                onClick={() => setDealerModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Modal */}
      {showFinalizeConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-warning">Finalize Game?</h3>
            <p className="py-4">
              This will end the current game and lock in all scores. This action cannot be undone.
            </p>
            <div className="modal-action">
              <button 
                className="btn btn-ghost"
                onClick={() => setShowFinalizeConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-error"
                onClick={handleFinalizeGame}
              >
                Finalize Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Memoize GamePlay component to optimize performance
// Only re-render when essential game state changes
export default memo(GamePlay)
