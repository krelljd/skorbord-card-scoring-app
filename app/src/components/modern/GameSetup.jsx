import { useState, useEffect } from 'react'
import { useForm, useLoading } from '../../hooks/useUIState.js'
import { useToast } from '../../hooks/useUIState.js'
import gameAPI from '../../services/gameAPI.js'
import { LoadingSpinner } from '../Loading.jsx'

/**
 * Modern GameSetup component with:
 * - useForm hook for form state management
 * - DaisyUI form components and validation states
 * - LoadingButton for async operations
 * - Proper accessibility features
 * - gameAPI service integration
 */
const GameSetup = ({ 
  sqid,
  gameTypes = [],
  players = [],
  onGameCreated
}) => {
  const { showError, showSuccess } = useToast()
  const { isLoading, withLoading } = useLoading()
  
  // Form state using modern hook
  const { values, errors, setValue, setError, validateField, isValid } = useForm({
    gameType: '',
    players: ['', ''],
    useCustomWinCondition: false,
    customWinConditionType: 'win',
    customWinConditionValue: 100
  })

  // Additional UI state
  const [selectedRivalry, setSelectedRivalry] = useState('')

  // Get favorited game types for quick access
  const favoritedGameTypes = gameTypes.filter(gt => gt.is_favorited) || []

  // Form validation rules
  const validateForm = () => {
    let isFormValid = true
    
    if (!values.gameType) {
      setError('gameType', 'Please select a game type')
      isFormValid = false
    }

    const nonEmptyPlayers = values.players.filter(name => name.trim())
    if (nonEmptyPlayers.length < 2) {
      setError('players', 'At least 2 players are required')
      isFormValid = false
    }

    if (values.useCustomWinCondition && (!values.customWinConditionValue || values.customWinConditionValue <= 0)) {
      setError('customWinConditionValue', 'Win condition value must be greater than 0')
      isFormValid = false
    }

    return isFormValid
  }

  // Handle adding player
  const addPlayer = () => {
    if (values.players.length < 8) { // Reasonable limit
      setValue('players', [...values.players, ''])
    }
  }

  // Handle removing player
  const removePlayer = (index) => {
    if (values.players.length > 2) {
      const newPlayers = values.players.filter((_, i) => i !== index)
      setValue('players', newPlayers)
    }
  }

  // Handle player name change
  const updatePlayerName = (index, name) => {
    const newPlayers = [...values.players]
    newPlayers[index] = name
    setValue('players', newPlayers)
    
    // Clear players error if we now have enough
    const nonEmptyPlayers = newPlayers.filter(n => n.trim())
    if (nonEmptyPlayers.length >= 2) {
      setError('players', '')
    }
  }

  // Handle rivalry selection
  const handleRivalrySelect = (rivalryPlayers) => {
    setValue('players', rivalryPlayers)
    setSelectedRivalry('')
    showSuccess(`Selected ${rivalryPlayers.join(', ')} as players`)
  }

  // Handle quick game type selection
  const handleQuickGameSelect = (gameTypeId) => {
    setValue('gameType', gameTypeId)
    setError('gameType', '')
  }

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      showError('Please fix the form errors before submitting')
      return
    }

    try {
      await withLoading(async () => {
        const selectedGameTypeData = gameTypes.find(gt => gt.id === values.gameType)
        const nonEmptyPlayers = values.players.filter(name => name.trim())

        const gameData = {
          game_type_id: values.gameType,
          players: nonEmptyPlayers.map((name, index) => ({
            name: name.trim(),
            order: index + 1
          }))
        }

        // Add custom win condition if specified
        if (values.useCustomWinCondition) {
          gameData.win_condition_type = values.customWinConditionType
          gameData.win_condition_value = parseInt(values.customWinConditionValue)
        }

        const newGame = await gameAPI.createGame(sqid, gameData)
        showSuccess(`Game "${selectedGameTypeData?.name}" created successfully!`)
        
        if (onGameCreated) {
          onGameCreated(newGame)
        }
      })
    } catch (error) {
      showError(`Failed to create game: ${error.message}`)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 space-y-4">
        <LoadingSpinner size="lg" />
        <p className="text-base-content/70">Loading game setup...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-base-content mb-2">Game Setup</h1>
        <p className="text-base-content/70">Configure your game and add players</p>
      </div>

      {/* Quick Actions */}
      {favoritedGameTypes.length > 0 && (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-lg">Quick Start</h2>
            <p className="text-sm text-base-content/70 mb-3">Your favorite game types</p>
            <div className="flex flex-wrap gap-2">
              {favoritedGameTypes.map((gameType) => (
                <button
                  key={gameType.id}
                  className={`btn btn-sm ${values.gameType === gameType.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleQuickGameSelect(gameType.id)}
                >
                  {gameType.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Setup Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Game Type Selection */}
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <h2 className="card-title">Game Type</h2>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Select game type *</span>
              </label>
              <select
                className={`select select-bordered w-full ${errors.gameType ? 'select-error' : ''}`}
                value={values.gameType}
                onChange={(e) => {
                  setValue('gameType', e.target.value)
                  setError('gameType', '')
                }}
                required
              >
                <option value="">Choose a game type...</option>
                {gameTypes.map((gameType) => (
                  <option key={gameType.id} value={gameType.id}>
                    {gameType.name}
                    {gameType.is_favorited && ' ⭐'}
                  </option>
                ))}
              </select>
              {errors.gameType && (
                <label className="label">
                  <span className="label-text-alt text-error">{errors.gameType}</span>
                </label>
              )}
            </div>

            {/* Custom Win Condition */}
            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text">Custom win condition</span>
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={values.useCustomWinCondition}
                  onChange={(e) => setValue('useCustomWinCondition', e.target.checked)}
                />
              </label>
            </div>

            {values.useCustomWinCondition && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Condition type</span>
                  </label>
                  <select
                    className="select select-bordered"
                    value={values.customWinConditionType}
                    onChange={(e) => setValue('customWinConditionType', e.target.value)}
                  >
                    <option value="win">First to reach</option>
                    <option value="lose">First to go below</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Points</span>
                  </label>
                  <input
                    type="number"
                    className={`input input-bordered ${errors.customWinConditionValue ? 'input-error' : ''}`}
                    value={values.customWinConditionValue}
                    onChange={(e) => setValue('customWinConditionValue', e.target.value)}
                    min="1"
                  />
                  {errors.customWinConditionValue && (
                    <label className="label">
                      <span className="label-text-alt text-error">{errors.customWinConditionValue}</span>
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Players Section */}
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Players</h2>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={addPlayer}
                disabled={values.players.length >= 8}
              >
                Add Player
              </button>
            </div>

            <div className="space-y-3">
              {values.players.map((playerName, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      className="input input-bordered w-full"
                      placeholder={`Player ${index + 1} name`}
                      value={playerName}
                      onChange={(e) => updatePlayerName(index, e.target.value)}
                    />
                  </div>
                  {values.players.length > 2 && (
                    <button
                      type="button"
                      className="btn btn-error btn-sm"
                      onClick={() => removePlayer(index)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {errors.players && (
              <div className="alert alert-error mt-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errors.players}</span>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <button
              type="submit"
              className={`btn btn-primary btn-block ${isLoading ? 'loading' : ''}`}
              disabled={isLoading || !isValid}
            >
              {isLoading ? 'Creating Game...' : 'Start Game'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default GameSetup
