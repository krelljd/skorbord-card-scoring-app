import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react'
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
import NumberPad from './NumberPad.jsx'
import RoundHistory from './RoundHistory.jsx'
import PartSheet from './PartSheet.jsx'
import PlaySheet from './PlaySheet.jsx'
import { recapLine, noHandPoints, PART_LABELS, isValidPartValue } from '../../utils/cribbage.js'
import { computeWinner } from '../../hooks/winnerLogic.js'

const UNDO_WINDOW_MS = 5000

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
  const [padPlayerId, setPadPlayerId] = useState(null)
  const [showPlay, setShowPlay] = useState(false) // shared play (pegging) sheet for all players
  const [partPad, setPartPad] = useState(null) // { playerId, part }: hand or crib typed straight from a card button
  const [totalOnly, setTotalOnly] = useState(false) // plain total pad instead of the part sheet
  const [emptyHandPrompt, setEmptyHandPrompt] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [winnerPrompt, setWinnerPrompt] = useState(null)
  const [undoable, setUndoable] = useState(null) // { roundNumber } for a few seconds after saving
  const undoTimer = useRef(null)

  useEffect(() => () => clearTimeout(undoTimer.current), [])

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

  // Round state from the server. Cribbage games split each round into play, hand and crib.
  const { roundState } = gameManager
  const tracksParts = Array.isArray(roundState?.game?.score_parts) && roundState.game.score_parts.length > 0

  // Handle score updates with optimistic UI and error recovery
  const handleScoreUpdate = useCallback(async (playerId, change) => {
    try {
      await gameManager.updatePlayerScore(playerId, change, tracksParts ? 'play' : undefined)
    } catch (error) {
      showError(`Failed to update score: ${parseError(error).message}`)
    }
  }, [gameManager, showError, tracksParts])

  // Round state from the server: per-player draft for the open round
  const draftByPlayer = useMemo(() => {
    const map = {}
    for (const p of roundState?.players || []) map[p.player_id] = p.draft
    return map
  }, [roundState])

  // Who would win if this round were saved now (the server applies the same rule)
  const prospectiveWinner = useMemo(() => {
    if (!roundState) return null
    return computeWinner(
      roundState.game,
      roundState.players.map(p => ({ player_id: p.player_id, score: p.committed_total + p.draft }))
    )
  }, [roundState])

  const openPad = useCallback((playerId) => {
    setTotalOnly(false)
    if (!gameManager.isConnected) {
      showError('Reconnect to type an exact value. Taps still work offline.')
      return
    }
    setPadPlayerId(playerId)
  }, [gameManager.isConnected, showError])

  // Cribbage card buttons: Hand and Crib open the number pad (play has its own shared sheet)
  const openPart = useCallback((playerId, part) => {
    if (!gameManager.isConnected) {
      showError('Reconnect to type an exact value. Taps still work offline.')
      return
    }
    setPartPad({ playerId, part })
  }, [gameManager.isConnected, showError])

  const handlePartPadSave = useCallback(async (value) => {
    const { playerId, part } = partPad
    setPartPad(null)
    try {
      await gameManager.setDraftPoints(playerId, value, part)
    } catch (error) {
      showError(`Failed to set ${part} points: ${parseError(error).message}`)
    }
  }, [gameManager, partPad, showError])

  const handlePadSave = useCallback(async (points) => {
    const playerId = padPlayerId
    setPadPlayerId(null)
    try {
      await gameManager.setDraftPoints(playerId, points)
    } catch (error) {
      showError(`Failed to set round points: ${parseError(error).message}`)
    }
  }, [gameManager, padPlayerId, showError])

  const saveRound = useCallback(async (winnerId = null) => {
    setWinnerPrompt(null)
    try {
      const state = await gameManager.nextRound({ winnerId })
      clearTimeout(undoTimer.current)
      setUndoable({ roundNumber: state.open_round - 1 })
      undoTimer.current = setTimeout(() => setUndoable(null), UNDO_WINDOW_MS)
    } catch (error) {
      showError(`Failed to save round: ${parseError(error).message}`)
    }
  }, [gameManager, showError])

  const handleNextRound = useCallback((skipEmptyHandCheck = false) => {
    if (tracksParts && skipEmptyHandCheck !== true && noHandPoints(roundState.players)) {
      setEmptyHandPrompt(true)
      return
    }
    setEmptyHandPrompt(false)
    if (prospectiveWinner && prospectiveWinner.player_id !== gameState.winner?.player_id) {
      setWinnerPrompt(prospectiveWinner.player_id)
      return
    }
    saveRound()
  }, [tracksParts, roundState, prospectiveWinner, gameState.winner, saveRound])

  const handleUndoRound = useCallback(async () => {
    clearTimeout(undoTimer.current)
    setUndoable(null)
    try {
      await gameManager.undoRound()
    } catch (error) {
      showError(`Could not undo: ${parseError(error).message}`)
    }
  }, [gameManager, showError])

  const handleEditRound = useCallback(async (roundNumber, playerId, points, revision, part) => {
    try {
      await gameManager.editRound(roundNumber, playerId, points, revision, part)
    } catch (error) {
      showError(`Failed to correct score: ${parseError(error).message}`)
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
    <div className="space-y-3">
      {/* Game Header: one line, secondary actions in a menu */}
      <div className="flex items-center gap-2 px-1">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">
            {game.game_type_name || 'Card Game'}
          </h1>
          <p className="pc-label">
            {game.win_condition_type === 'win' ? 'First to' : 'Lose at'} {game.win_condition_value || '?'}
          </p>
        </div>

        {!isFinalized && gameState.winner && (
          <button className="btn btn-error btn-sm min-h-11" onClick={() => setShowFinalizeConfirm(true)}>
            Finalize Game
          </button>
        )}

        {(onBackToSetup || (!isFinalized && sortedPlayers.length > 1)) && (
          <div className="dropdown dropdown-end">
            <button type="button" tabIndex={0} className="btn btn-ghost btn-square min-h-11 min-w-11" aria-label="Game menu">
              <span aria-hidden="true" className="text-xl leading-none">⋯</span>
            </button>
            <ul tabIndex={0} className="dropdown-content menu bg-base-200 rounded-box z-30 w-52 p-2 shadow-lg">
              {!isFinalized && sortedPlayers.length > 1 && (
                <li>
                  <button type="button" onClick={toggleReorderMode}>
                    {gameState.isReorderMode ? 'Done reordering' : 'Reorder players'}
                  </button>
                </li>
              )}
              {onBackToSetup && (
                <li><button type="button" onClick={onBackToSetup}>Back to setup</button></li>
              )}
            </ul>
          </div>
        )}
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

      {/* Connection warning - changes may not be saved while offline */}
      {(!gameManager.isConnected || gameManager.pendingTaps > 0) && (
        <div className="alert alert-warning">
          <span>
            {gameManager.isConnected
              ? `Syncing ${gameManager.pendingTaps} score change${gameManager.pendingTaps > 1 ? 's' : ''}…`
              : `Offline — taps are kept on this device${gameManager.pendingTaps > 0 ? ` (${gameManager.pendingTaps} waiting)` : ''} and sent when the connection returns.`}
          </span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                    draft={draftByPlayer[playerStat.player_id] || 0}
                    target={game.win_condition_type === 'win' ? game.win_condition_value : null}
                    onDraftClick={openPad}
                    isReorderMode={gameState.isReorderMode}
                    onScoreUpdate={(playerId, change) => {
                      // PlayerCard now passes change directly
                      return handleScoreUpdate(playerId, change);
                    }}
                    isDealer={gameManager.game?.dealer_id === playerStat.player_id}
                    showCrib={tracksParts}
                    partsMode={tracksParts}
                    draftParts={roundState?.players.find(p => p.player_id === playerStat.player_id)?.draft_parts ?? null}
                    onPartClick={openPart}
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

      {/* Round bar: save the round, see history */}
      {!isFinalized && sortedPlayers.length > 0 && !gameState.isReorderMode && (
        <div className="sticky bottom-0 z-20 pt-2 pb-3 bg-base-100/95 backdrop-blur-sm space-y-2">
          {tracksParts && roundState && (
            <p className="text-center text-sm text-base-content/70" data-testid="round-recap">
              {recapLine(roundState.players, roundState.open_round)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="btn btn-outline bg-base-100 px-3"
              onClick={() => setShowHistory(true)}
              aria-label="Score history"
            >
              History
            </button>
            {tracksParts && (
              <button
                className="btn btn-secondary flex-[3] px-2"
                onClick={() => setShowPlay(true)}
                disabled={!roundState}
              >
                Play
              </button>
            )}
            <button
              className="btn btn-primary flex-[2] px-2 whitespace-nowrap"
              onClick={() => handleNextRound()}
              disabled={!roundState || !gameManager.isConnected || gameManager.pendingTaps > 0}
            >
              Next round{roundState?.open_round ? ` (${roundState.open_round})` : ''}
            </button>
          </div>
        </div>
      )}
      {isFinalized && sortedPlayers.length > 0 && (
        <button className="btn btn-outline btn-block" onClick={() => setShowHistory(true)}>
          Score history
        </button>
      )}

      {undoable && (
        <div className="toast toast-center toast-bottom z-50 mb-20">
          <div className="alert alert-info">
            <span>Round {undoable.roundNumber} saved</span>
            <button className="btn btn-sm" onClick={handleUndoRound}>Undo</button>
          </div>
        </div>
      )}

      {padPlayerId && tracksParts && !totalOnly && (() => {
        const p = roundState.players.find(x => x.player_id === padPlayerId)
        return (
          <PartSheet
            title="Points this round"
            subtitle={p?.player_name}
            parts={p?.draft_parts ?? { play: p?.draft || 0, hand: 0, crib: 0 }}
            isDealer={roundState.game.dealer_id === padPlayerId}
            onAddPlay={(delta) => handleScoreUpdate(padPlayerId, delta)}
            onSetPart={async (part, value) => {
              try {
                await gameManager.setDraftPoints(padPlayerId, value, part)
              } catch (error) {
                showError(`Failed to set ${part} points: ${parseError(error).message}`)
              }
            }}
            onTotalOnly={() => setTotalOnly(true)}
            onClose={() => setPadPlayerId(null)}
          />
        )
      })()}

      {showPlay && tracksParts && roundState && (
        <PlaySheet
          players={roundState.players}
          dealerId={roundState.game.dealer_id}
          target={roundState.game.win_condition_type === 'win' ? roundState.game.win_condition_value : null}
          onAdd={(playerId, delta) => handleScoreUpdate(playerId, delta)}
          onClose={() => setShowPlay(false)}
        />
      )}

      {partPad && (() => {
        const p = roundState.players.find(x => x.player_id === partPad.playerId)
        return (
          <NumberPad
            title={`${PART_LABELS[partPad.part]} points`}
            subtitle={p?.player_name}
            initial={p?.draft_parts?.[partPad.part] || 0}
            allowNegative={false}
            isValid={(v) => isValidPartValue(partPad.part, v)}
            invalidHint={`Not a possible ${partPad.part} score`}
            onSave={handlePartPadSave}
            onCancel={() => setPartPad(null)}
          />
        )
      })()}

      {emptyHandPrompt && (
        <div className="modal modal-open" role="dialog" aria-label="No hand points">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Save without any hand points?</h3>
            <p className="py-2">Nobody has hand points this round. That is rare, so check before saving.</p>
            <div className="modal-action">
              <button className="btn" onClick={() => setEmptyHandPrompt(false)}>Go back</button>
              <button className="btn btn-primary" onClick={() => handleNextRound(true)}>Save anyway</button>
            </div>
          </div>
        </div>
      )}

      {padPlayerId && (!tracksParts || totalOnly) && (
        <NumberPad
          title="Points this round"
          subtitle={sortedPlayers.find(p => p.player_id === padPlayerId)?.player_name}
          initial={draftByPlayer[padPlayerId] || 0}
          onSave={handlePadSave}
          onCancel={() => setPadPlayerId(null)}
        />
      )}

      {showHistory && roundState && (
        <RoundHistory
          roundState={roundState}
          canEdit={!isFinalized && gameManager.isConnected}
          onEdit={handleEditRound}
          onClose={() => setShowHistory(false)}
        />
      )}

      {winnerPrompt && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-success">
              {sortedPlayers.find(p => p.player_id === winnerPrompt)?.player_name} wins?
            </h3>
            <p className="py-4">
              This round puts them over the line. Confirm them as the winner, or save the round and keep playing.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setWinnerPrompt(null)}>Cancel</button>
              <button className="btn" onClick={() => saveRound()}>Keep playing</button>
              <button className="btn btn-success" onClick={() => saveRound(winnerPrompt)}>Confirm winner</button>
            </div>
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
