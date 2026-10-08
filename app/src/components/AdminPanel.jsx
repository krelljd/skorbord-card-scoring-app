import { useState } from 'react'
import RivalryAdmin from './RivalryAdmin.jsx'

const AdminPanel = ({ 
  sqid, 
  gameTypes, 
  setGameTypes, 
  backToSetup,
  rivalries = [],
  setRivalries = () => {},
  initialTab = 'game-types'
}) => {
  const [tab, setTab] = useState(initialTab)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Game Type Management
  const [newGameType, setNewGameType] = useState({
    name: '',
    win_condition_type: 'win',
    win_condition_value: 100
  })

  const clearMessages = () => {
    setError('')
    setSuccess('')
  }

  // Game Type Functions
  const addGameType = async () => {
    if (!newGameType.name.trim()) {
      setError('Game type name is required')
      return
    }

    setLoading(true)
    clearMessages()

    try {
      const response = await fetch(`/api/game_types`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newGameType.name.trim(),
          win_condition_type: newGameType.win_condition_type,
          win_condition_value: parseInt(newGameType.win_condition_value)
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add game type')
      }

      const result = await response.json()
      // Automatically favorite the new game type for this sqid
      const favoriteRes = await fetch(`/api/${sqid}/game_types/${result.data.id}/favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      if (!favoriteRes.ok) {
        const errorData = await favoriteRes.json()
        throw new Error(errorData.error || 'Failed to favorite new game type')
      }
      // Re-fetch game types to get correct is_favorited
      const gameTypesRes = await fetch(`/api/game_types?sqid=${encodeURIComponent(sqid)}`)
      if (gameTypesRes.ok) {
        const gameTypesData = await gameTypesRes.json()
        setGameTypes(gameTypesData.data || [])
      }
      setNewGameType({ name: '', win_condition_type: 'win', win_condition_value: 100 })
      setSuccess('Game type added!')

    } catch (err) {
      console.error('Failed to add game type:', err)
      setError(err.message || 'Failed to add game type')
    } finally {
      setLoading(false)
    }
  }

  const toggleGameTypeFavorite = async (gameTypeId, currentStatus) => {
    setLoading(true)
    clearMessages()

    try {
      const method = currentStatus ? 'DELETE' : 'POST'
      const response = await fetch(`/api/${sqid}/game_types/${gameTypeId}/favorite`, {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update favorite status')
      }

      // After toggling, re-fetch game types to get correct is_favorited for this sqid
      const gameTypesRes = await fetch(`/api/game_types?sqid=${encodeURIComponent(sqid)}`)
      if (gameTypesRes.ok) {
        const gameTypesData = await gameTypesRes.json()
        setGameTypes(gameTypesData.data || [])
      }
      setSuccess(`Game type ${!currentStatus ? 'favorited' : 'unfavorited'}!`)

    } catch (err) {
      console.error('Failed to update favorite status:', err)
      setError(err.message || 'Failed to update favorite status')
    } finally {
      setLoading(false)
    }
  }

  const deleteGameType = async (gameTypeId) => {
    setLoading(true)
    clearMessages()

    try {
      const response = await fetch(`/api/game_types/${gameTypeId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete game type')
      }

      setGameTypes(prev => prev.filter(gt => gt.id !== gameTypeId))
      setConfirmingDeleteId(null)
      setSuccess('Game type deleted successfully!')

    } catch (err) {
      console.error('Failed to delete game type:', err)
      setError(err.message || 'Failed to delete game type')
    } finally {
      setLoading(false)
    }
  }

  const ruleLabel = (gameType) => (
    !gameType.is_win_condition
      ? `Lose at ${gameType.loss_condition}`
      : `First to ${gameType.win_condition}`
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-2">
        <button
          className="btn btn-ghost min-h-11 min-w-11"
          onClick={backToSetup}
          aria-label="Back to setup"
        >
          ←
        </button>
        <h2 className="text-lg font-bold">Admin</h2>
      </div>

      <div className="st-seg" role="tablist" aria-label="Admin section">
        {[['game-types', 'Game types'], ['rivalries', 'Rivalries']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'st-seg-on' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'rivalries' ? (
        <RivalryAdmin sqid={sqid} rivalries={rivalries} setRivalries={setRivalries} embedded />
      ) : (
        <>
          {error && <div className="error-state"><p>{error}</p></div>}
          {success && <div className="success-state"><p>{success}</p></div>}

          <h3 className="st-lbl">Your game types</h3>
          {gameTypes.length === 0 ? (
            <p className="text-center opacity-75 py-4">No game types yet</p>
          ) : (
            gameTypes.map(gameType => (
              <section key={gameType.id} className="st-card" aria-label={gameType.name}>
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold truncate">{gameType.name}</h4>
                    <span className="st-chip mt-1.5">{ruleLabel(gameType)}</span>
                  </div>
                  <button
                    className={`st-icon-btn ${gameType.is_favorited ? 'st-icon-on' : ''}`}
                    onClick={() => toggleGameTypeFavorite(gameType.id, gameType.is_favorited)}
                    disabled={loading}
                    title={gameType.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label={gameType.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
                    aria-pressed={!!gameType.is_favorited}
                  >
                    {gameType.is_favorited ? '★' : '☆'}
                  </button>
                  <button
                    className="st-icon-btn st-icon-danger"
                    onClick={() => setConfirmingDeleteId(gameType.id)}
                    disabled={loading}
                    aria-label={`Delete ${gameType.name}`}
                  >
                    ✕
                  </button>
                </div>
                {confirmingDeleteId === gameType.id && (
                  <div className="st-danger">
                    <p className="st-key">Delete {gameType.name}? This cannot be undone.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button className="btn btn-outline min-h-11" onClick={() => setConfirmingDeleteId(null)}>Keep</button>
                      <button className="btn btn-error min-h-11" onClick={() => deleteGameType(gameType.id)} disabled={loading}>Delete</button>
                    </div>
                  </div>
                )}
              </section>
            ))
          )}

          <section className="st-card space-y-3" aria-labelledby="ad-add">
            <h4 id="ad-add" className="st-lbl">Add a game type</h4>
            <input
              type="text"
              className="input input-bordered w-full min-h-11"
              placeholder="e.g. Hearts, Spades, Rummy"
              aria-label="Game type name"
              value={newGameType.name}
              onChange={(e) => setNewGameType(prev => ({ ...prev, name: e.target.value }))}
            />
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
              <select
                className="select select-bordered min-h-11"
                aria-label="Win condition"
                value={newGameType.win_condition_type}
                onChange={(e) => setNewGameType(prev => ({ ...prev, win_condition_type: e.target.value }))}
              >
                <option value="win">Win at score</option>
                <option value="lose">Lose at score</option>
              </select>
              <input
                type="number"
                inputMode="numeric"
                className="input input-bordered min-h-11"
                placeholder="100"
                aria-label="Score"
                value={newGameType.win_condition_value}
                onChange={(e) => setNewGameType(prev => ({ ...prev, win_condition_value: e.target.value }))}
              />
            </div>
            <button
              className="btn btn-primary w-full min-h-11"
              onClick={addGameType}
              disabled={loading || !newGameType.name.trim()}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Adding...
                </>
              ) : (
                'Add game type'
              )}
            </button>
          </section>
        </>
      )}
    </div>
  )
}

export default AdminPanel
