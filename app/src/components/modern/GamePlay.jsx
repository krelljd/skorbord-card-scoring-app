import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useGameManager } from '../../hooks/useGameManager.js'
import { useGameState } from '../../contexts/GameStateContext.jsx'
import { useGameActions } from '../../contexts/GameStateContext.jsx'
import { useToast } from '../Toast.jsx'
import { useLoading } from '../../hooks/useUIState.js'
import { parseError } from '../../utils/errorUtils.js'
import { LoadingSpinner } from '../Loading.jsx'
import ReorderablePlayerCard from './ReorderablePlayerCard.jsx'

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
  const { setReorderMode } = useGameActions()
  const { addToast } = useToast()
  const { isLoading, withLoading } = useLoading()
  
  // Toast helper functions
  const showSuccess = useCallback((message) => addToast(message, 'success'), [addToast])
  const showError = useCallback((message) => addToast(message, 'error'), [addToast])
  
  // Local UI state
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false)
  const [dealerModalOpen, setDealerModalOpen] = useState(false)

  // Drag and drop sensors with iOS touch optimization
  const sensors = useSensors(
    // Enhanced PointerSensor for both mouse and touch
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required to start drag
        tolerance: 5, // Tolerance for pointer movement
        delay: 250, // 250ms delay for iOS long press to avoid conflicts with scrolling
      },
    }),
    // TouchSensor specifically for iOS with optimized settings
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // 250ms long press for iOS
        tolerance: 8, // Slightly higher tolerance for touch
      },
    }),
    // MouseSensor for precise mouse interactions
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5, // Shorter distance for mouse precision
      },
    }),
    // Keyboard support for accessibility
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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
      // Removed showSuccess('Player order updated') to make reordering silent
    } catch (error) {
      showError(`Failed to update player order: ${parseError(error).message}`)
    }
  }, [gameManager, showError])

  // Toggle reorder mode
  const toggleReorderMode = useCallback(() => {
    const newReorderMode = !gameState.isReorderMode
    setReorderMode(newReorderMode)
    
    // iOS: Prevent body scroll during reorder mode
    if (newReorderMode) {
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [setReorderMode, gameState.isReorderMode])

  // Cleanup iOS body styles on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [])

  // Handle drag end for player reordering
  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      const oldIndex = sortedPlayers.findIndex(player => player.player_id === active.id)
      const newIndex = sortedPlayers.findIndex(player => player.player_id === over?.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        // Create new order array with proper format for API
        const newSortedPlayers = arrayMove(sortedPlayers, oldIndex, newIndex)
        const newOrder = newSortedPlayers.map((player, index) => ({
          playerId: player.player_id,
          order: index
        }))

        try {
          await handlePlayerOrderUpdate(newOrder)
        } catch (error) {
          // Error already handled in handlePlayerOrderUpdate
        }
      }
    }
  }, [sortedPlayers, handlePlayerOrderUpdate])

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
        <div className="text-6xl">🃏</div>
        <h2 className="text-2xl font-bold text-base-content">No Active Game</h2>
        <p className="text-base-content/70 text-center max-w-md">
          Start a new game from the menu to begin tracking scores.
        </p>
        {onBackToSetup && (
          <button 
            className="btn btn-primary"
            onClick={onBackToSetup}
          >
            New Game
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
              {/* Reorder Mode Toggle */}
              {!isFinalized && sortedPlayers.length > 1 && (
                <button
                  className={`btn btn-sm ${gameState.isReorderMode ? 'btn-warning' : 'btn-outline'}`}
                  onClick={toggleReorderMode}
                >
                  {gameState.isReorderMode ? '✓ Exit Reorder' : '⋮⋮ Reorder Players'}
                </button>
              )}
              
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

      {/* Reorder Mode Alert - Enhanced for iOS */}
      {gameState.isReorderMode && (
        <div className="alert alert-info mb-4">
          <div className="flex-1">
            <div className="flex flex-col">
              <h3 className="font-bold">Reorder Mode Active</h3>
              <p className="text-sm opacity-75">
                Drag and drop player cards to reorder them. Touch and hold for 250ms to start dragging on mobile devices.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Players Grid */}
      {sortedPlayers.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={sortedPlayers.map(p => p.player_id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedPlayers.map((playerStat, index) => {
                const currentScore = playerStat.score || 0;
                const isWinner = gameState.winner?.player_id === playerStat.player_id;
                return (
                  <ReorderablePlayerCard
                    key={playerStat.player_id}
                    player={{
                      id: playerStat.player_id,
                      name: playerStat.player_name,
                      score: currentScore,
                      gamesWon: playerStat.games_won
                    }}
                    playerIndex={index}
                    isReorderMode={gameState.isReorderMode}
                    onScoreUpdate={(playerId, change) => {
                      // PlayerCard now passes change directly
                      return handleScoreUpdate(playerId, change);
                    }}
                    isDealer={gameManager.game?.dealer_id === playerStat.player_id}
                    isWinner={isWinner}
                    onDealerClick={cycleDealer}
                    disabled={isFinalized || gameManager.loading || gameState.isReorderMode}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
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
                    game?.dealer_id === playerStat.player_id ? 'btn-primary' : 'btn-ghost'
                  }`}
                  onClick={() => handleDealerChange(playerStat.player_id)}
                >
                  {playerStat.player_name}
                  {game?.dealer_id === playerStat.player_id && (
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
