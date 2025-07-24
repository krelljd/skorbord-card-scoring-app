import { useState, useEffect } from 'react'
import { useConnection } from '../contexts/ConnectionContext.jsx'
import { getPlayerColor, getPlayerColorByName } from '../utils/playerColors'

const GameSetup = ({ 
  sqid, 
  gameTypes = [], 
  players = [], 
  rivalries = [], 
  setCurrentGame, 
  setCurrentView,
  setPlayers,
  setRivalries
}) => {
  const { socket } = useConnection()
  
  // Setup state
  const [selectedGameType, setSelectedGameType] = useState('')
  const [selectedRivalry, setSelectedRivalry] = useState('')
  const [customPlayers, setCustomPlayers] = useState(['', ''])
  const [customWinCondition, setCustomWinCondition] = useState('')
  const [useCustomCondition, setUseCustomCondition] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Get favorited game types for randomizer
  const favoritedGameTypes = gameTypes.filter(gt => gt.is_favorited)

  const addPlayer = () => {
    setCustomPlayers([...customPlayers, ''])
  }

  const removePlayer = (index) => {
    if (customPlayers.length > 2) {
      setCustomPlayers(customPlayers.filter((_, i) => i !== index))
    }
  }

  const updatePlayerName = (index, name) => {
    const updated = [...customPlayers]
    updated[index] = name // allow empty string
    setCustomPlayers(updated)
 }

// Helper to get player names from rivalry (prefer .players, fallback to .player_names)
// Rivalries are now grouped by unique player group (player_group_key), not per game type.
// This ensures the dropdown only shows one entry per player group, regardless of game type.
const getRivalryPlayerNames = (rivalry) => {
  if (rivalry.players && Array.isArray(rivalry.players)) {
    return rivalry.players.map(p => p.name)
  }
  return rivalry.player_names || []
}

  // Rivalry selection now uses player groups, not game type.
  // When a rivalry is selected, populate players from the player group and display per-game-type stats.
  const selectRivalry = (rivalryId) => {
    setSelectedRivalry(rivalryId)
    if (rivalryId) {
      // Find rivalry by id
      const rivalry = rivalries.find(r => r.id === rivalryId)
      if (rivalry) {
        // Prefer .players, fallback to .player_names
        let names = [];
        if (Array.isArray(rivalry.players) && rivalry.players.length > 0 && rivalry.players.every(p => typeof p.name === 'string' && p.name.trim() !== '')) {
          names = rivalry.players.map(p => p.name);
        } else if (Array.isArray(rivalry.player_names) && rivalry.player_names.length > 0 && rivalry.player_names.every(name => typeof name === 'string' && name.trim() !== '')) {
          names = rivalry.player_names;
        } else {
          names = ['', ''];
        }
        setCustomPlayers(names);
      }
    } else {
      // Reset to empty players
      setCustomPlayers(['', '']);
    }
  }

  const selectRandomGameType = () => {
    if (favoritedGameTypes.length > 0) {
      const randomType = favoritedGameTypes[Math.floor(Math.random() * favoritedGameTypes.length)]
      setSelectedGameType(randomType.id)
      setCustomWinCondition('')
      setUseCustomCondition(false)
    }
  }

  const startGame = async () => {
    if (!selectedGameType) {
      setError('Please select a game type')
      return
    }

    // Require at least 2 non-empty player names
    if (customPlayers.filter(name => name && name.trim()).length < 2) {
      setError('At least 2 player names must be filled out')
      return
    }

    setLoading(true)
    setError('')

    try {
      const gameType = gameTypes.find(gt => gt.id === selectedGameType)
      const enteredNames = customPlayers.filter(name => name && name.trim()).map(name => name.trim())
      if (enteredNames.length < 2) {
        setError('At least 2 player names must be filled out')
        setLoading(false)
        return
      }
      const gameData = {
        game_type_id: selectedGameType,
        player_names: enteredNames,
        win_condition_type: useCustomCondition ? 
          (customWinCondition ? (gameType.is_win_condition ? 'win' : 'lose') : (gameType.is_win_condition ? 'win' : 'lose')) : 
          (gameType.is_win_condition ? 'win' : 'lose'),
        win_condition_value: useCustomCondition && customWinCondition ? 
          parseInt(customWinCondition) : 
          (gameType.is_win_condition ? gameType.win_condition : gameType.loss_condition)
      }

      const response = await fetch(`/api/${sqid}/games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(gameData)
      })

      let result
      try {
        result = await response.json()
      } catch (jsonErr) {
        throw new Error('Failed to parse response JSON: ' + jsonErr.message)
      }

      if (!response.ok) {
        // Show full error details for debugging
        setError(result.message || JSON.stringify(result) || 'Failed to start game')
        throw new Error(result.message || 'Failed to start game')
      }

      setCurrentGame(result.data)
      setCurrentView('playing')

      // Emit socket event for real-time updates
      if (socket) {
        socket.emit('game-started', { sqid, game: result.data })
      }

    } catch (err) {
      console.error('Failed to start game:', err)
      setError(err.message || 'Failed to start game')
    } finally {
      setLoading(false)
    }
  }

  const selectedGameTypeData = gameTypes.find(gt => gt.id === selectedGameType)

  // Always use a safe array for customPlayers in render logic
  const safeCustomPlayers = Array.isArray(customPlayers) ? customPlayers : ['', ''];
  // Helper to check if there are at least 2 valid player names
  const hasValidPlayers = safeCustomPlayers.filter(name => name && name.trim()).length >= 2;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">New Game</h2>
        <p className="text-sm opacity-75">Choose a game type and players to begin</p>
      </div>

      {error && (
        <div className="error-state">
          <p>{error}</p>
        </div>
      )}

      {/* Game Type Selection */}
      <div className="card bg-base-200 p-4">
        <h3 className="text-lg font-semibold mb-3">Game Type</h3>
        <div className="form-control mb-4">
          <select 
            className="game-type-select"
            value={selectedGameType}
            onChange={e => {
              setSelectedGameType(e.target.value)
              setCustomWinCondition('')
              setUseCustomCondition(false)
            }}>
            <option value="">Select a game type...</option>
            {gameTypes.map(gameType => (
              <option key={gameType.id} value={gameType.id}>
                {gameType.name}{gameType.is_favorited ? ' ⭐' : ''}
              </option>
            ))}
          </select>
        </div>
        {favoritedGameTypes.length > 0 && (
          <button 
            className="btn btn-secondary btn-sm"
            onClick={selectRandomGameType}
          >
            🎲 Random Favorite
          </button>
        )}
        {/* Custom Win Condition */}
        {selectedGameTypeData && (
          <div className="mt-4 p-3 bg-base-300 rounded-lg">
            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text">Use custom win condition</span>
                <input 
                  type="checkbox" 
                  className="checkbox"
                  checked={useCustomCondition}
                  onChange={e => setUseCustomCondition(e.target.checked)}
                />
              </label>
            </div>
            {useCustomCondition && (
              <div className="form-control mt-2">
                <label className="label">
                  <span className="label-text">
                    {selectedGameTypeData.is_win_condition ? 'Win at score:' : 'Lose at score:'}
                  </span>
                </label>
                <input 
                  type="number"
                  className="input input-bordered"
                  placeholder={(selectedGameTypeData.is_win_condition ? selectedGameTypeData.win_condition : selectedGameTypeData.loss_condition)?.toString()}
                  value={customWinCondition}
                  onChange={e => setCustomWinCondition(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rivalry Selection */}
      <div className="card bg-base-200 p-4">
        <h3 className="text-lg font-semibold mb-3">Players</h3>
        {rivalries.length > 0 && (
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Select existing rivalry</span>
            </label>
            <select 
              className="select select-bordered"
              value={selectedRivalry}
              onChange={e => selectRivalry(e.target.value)}>
              <option value="">Use players below...</option>
              {rivalries.map(rivalry => {
                let names = [];
                let players = [];
                if (Array.isArray(rivalry.player_names) && rivalry.player_names.length > 0 && rivalry.player_names.every(name => typeof name === 'string' && name.trim() !== '')) {
                  names = rivalry.player_names;
                  // Create player objects with names as IDs for color consistency
                  players = names.map(name => ({ id: name, name }));
                } else if (Array.isArray(rivalry.players) && rivalry.players.length > 0 && rivalry.players.every(p => typeof p.name === 'string' && p.name.trim() !== '')) {
                  names = rivalry.players.map(p => p.name);
                  players = rivalry.players;
                } else {
                  names = ['Unknown Players'];
                  players = [{ id: 'unknown', name: 'Unknown Players' }];
                }
                return (
                  <option key={rivalry.id} value={rivalry.id}>
                    {names.join(' vs ')}
                  </option>
                );
              })}
            </select>
            {selectedRivalry && (() => {
              const rivalry = rivalries.find(r => r.id === selectedRivalry);
              if (rivalry && Array.isArray(rivalry.game_type_stats) && rivalry.game_type_stats.length > 0) {
                return (
                  <div className="mt-4">
                    <h4 className="text-md font-semibold mb-2">Stats by Game Type</h4>
                    <ul className="space-y-1">
                      {rivalry.game_type_stats.map(stat => (
                        <li key={stat.game_type_id} className="text-sm">
                          <span className="font-bold">{stat.game_type_name}:</span> {stat.games_played} games, {stat.wins} wins, {stat.losses} losses, Avg margin: {stat.average_margin ? stat.average_margin.toFixed(1) : 'N/A'}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        )}

        {/* Custom Players */}
        <div className="space-y-3">
          {safeCustomPlayers.map((playerName, index) => (
            <div key={index} className="flex gap-2">
              <input 
                type="text"
                className="input input-bordered flex-1"
                placeholder={`Player ${index + 1}`}
                value={playerName}
                onChange={e => updatePlayerName(index, e.target.value)}
              />
              {safeCustomPlayers.length > 2 && (
                <button 
                  className="btn btn-error btn-sm"
                  onClick={() => removePlayer(index)}>
                  &#10005;
                </button>
              )}
            </div>
          ))}
          <button 
            className="btn btn-outline btn-sm w-full"
            onClick={addPlayer}>
            + Add Player
          </button>
        </div>
      </div>

      {/* Start Game Button */}
      <button 
        className="btn btn-primary btn-lg w-full"
        onClick={startGame}
        disabled={loading || !selectedGameType || !hasValidPlayers}
      >
        {loading ? (
          <span className="loading loading-spinner loading-sm"></span>
          ) : 'Start Game'}
      </button>
    </div>
  )
}

export default GameSetup
