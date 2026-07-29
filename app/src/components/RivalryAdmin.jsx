import { useState } from 'react'
import { getStoredAdminPin, setStoredAdminPin, clearStoredAdminPin } from '../utils/adminPin.js'

const RivalryAdmin = ({ sqid, rivalries, setRivalries, backToStats }) => {
  const [pinInput, setPinInput] = useState('')
  const [verifiedPin, setVerifiedPin] = useState(() => getStoredAdminPin(sqid))
  const [pinError, setPinError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renameLoadingId, setRenameLoadingId] = useState(null)

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoadingId, setDeleteLoadingId] = useState(null)

  const handleAuthFailure = () => {
    clearStoredAdminPin(sqid)
    setVerifiedPin(null)
    setPinInput('')
  }

  const submitPin = async () => {
    setVerifying(true)
    setPinError('')
    try {
      const response = await fetch(`/api/${sqid}/admin/verify-pin`, {
        method: 'POST',
        headers: { 'X-Admin-Pin': pinInput }
      })
      if (!response.ok) {
        throw new Error('Incorrect PIN')
      }
      setStoredAdminPin(sqid, pinInput)
      setVerifiedPin(pinInput)
    } catch (err) {
      setPinError(err.message || 'Incorrect PIN')
    } finally {
      setVerifying(false)
    }
  }

  const startEditing = (player) => {
    setEditingPlayerId(player.id)
    setDraftName(player.name)
    setRenameError('')
  }

  const saveRename = async (playerId) => {
    setRenameLoadingId(playerId)
    setRenameError('')
    try {
      const response = await fetch(`/api/${sqid}/players/${playerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Pin': verifiedPin
        },
        body: JSON.stringify({ name: draftName })
      })
      if (response.status === 403) {
        handleAuthFailure()
        return
      }
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to rename player')
      }
      const updatedName = data.data.name
      setRivalries(prev => prev.map(riv => ({
        ...riv,
        players: (riv.players || []).map(p => p.id === playerId ? { ...p, name: updatedName } : p),
        player_names: (riv.players || []).map(p => p.id === playerId ? updatedName : p.name)
      })))
      setEditingPlayerId(null)
    } catch (err) {
      setRenameError(err.message || 'Failed to rename player')
    } finally {
      setRenameLoadingId(null)
    }
  }

  const startDeleteConfirm = (rivalry) => {
    setConfirmingDeleteId(rivalry.id)
    setConfirmText('')
    setDeleteError('')
  }

  const deleteRivalry = async (rivalry) => {
    setDeleteLoadingId(rivalry.id)
    setDeleteError('')
    try {
      const response = await fetch(`/api/${sqid}/rivalries/${rivalry.id}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Pin': verifiedPin }
      })
      if (response.status === 403) {
        handleAuthFailure()
        return
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete rivalry')
      }
      setRivalries(prev => prev.filter(r => r.id !== rivalry.id))
      setConfirmingDeleteId(null)
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete rivalry')
    } finally {
      setDeleteLoadingId(null)
    }
  }

  if (!verifiedPin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <button className="btn btn-ghost btn-sm" onClick={backToStats}>← Back</button>
          <h2 className="text-xl font-bold">Manage Rivalries</h2>
        </div>
        <div className="card bg-base-200 p-4 space-y-4">
          <p className="text-sm opacity-75">Enter the admin PIN to manage rivalries.</p>
          <input
            type="password"
            className="input input-bordered w-full"
            placeholder="Admin PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPin() }}
          />
          {pinError && (
            <div className="error-state"><p>{pinError}</p></div>
          )}
          <button
            className="btn btn-primary w-full"
            onClick={submitPin}
            disabled={verifying || !pinInput.trim()}
          >
            {verifying ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Verifying...
              </>
            ) : 'Unlock'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button className="btn btn-ghost btn-sm" onClick={backToStats}>← Back</button>
        <h2 className="text-xl font-bold">Manage Rivalries</h2>
      </div>

      {rivalries.length === 0 ? (
        <p className="text-center opacity-75 py-4">No rivalries yet</p>
      ) : (
        <div className="space-y-3">
          {rivalries.map(rivalry => (
            <div key={rivalry.id} className="card bg-base-200 p-4 space-y-3">
              <p className="font-semibold">
                {(rivalry.player_names || []).join(' vs ')}
              </p>
              <div className="space-y-2">
                {(rivalry.players || []).map(player => (
                  <div key={player.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      {editingPlayerId === player.id ? (
                        <>
                          <input
                            type="text"
                            className="input input-bordered input-sm flex-1"
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                          />
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => saveRename(player.id)}
                            disabled={renameLoadingId === player.id || !draftName.trim()}
                          >
                            Save
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditingPlayerId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1">{player.name}</span>
                          <button className="btn btn-sm btn-outline" onClick={() => startEditing(player)}>
                            Rename
                          </button>
                        </>
                      )}
                    </div>
                    {editingPlayerId === player.id && renameError && (
                      <div className="error-state"><p>{renameError}</p></div>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-base-300">
                {confirmingDeleteId === rivalry.id ? (
                  <div className="space-y-2">
                    <p className="text-sm opacity-75">
                      Type "{(rivalry.player_names || []).join(' vs ')}" to confirm deletion.
                    </p>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                    />
                    {deleteError && (
                      <div className="error-state"><p>{deleteError}</p></div>
                    )}
                    <div className="flex gap-2">
                      <button
                        className="btn btn-sm btn-error"
                        disabled={
                          deleteLoadingId === rivalry.id ||
                          confirmText !== (rivalry.player_names || []).join(' vs ')
                        }
                        onClick={() => deleteRivalry(rivalry)}
                      >
                        Confirm Delete
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setConfirmingDeleteId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-error btn-outline" onClick={() => startDeleteConfirm(rivalry)}>
                    Delete Rivalry
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RivalryAdmin
