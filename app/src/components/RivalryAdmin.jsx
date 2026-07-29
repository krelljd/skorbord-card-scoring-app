import { useState } from 'react'
import { getStoredAdminPin, setStoredAdminPin, clearStoredAdminPin } from '../utils/adminPin.js'

const RivalryAdmin = ({ sqid, rivalries, setRivalries, backToStats }) => {
  const [pinInput, setPinInput] = useState('')
  const [verifiedPin, setVerifiedPin] = useState(() => getStoredAdminPin(sqid))
  const [pinError, setPinError] = useState('')
  const [verifying, setVerifying] = useState(false)

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
            <div key={rivalry.id} className="card bg-base-200 p-4">
              <p className="font-semibold">
                {(rivalry.player_names || []).join(' vs ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RivalryAdmin
