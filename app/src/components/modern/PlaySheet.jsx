import { useEffect, useRef, useState } from 'react'
import { PEG_EVENTS, RUN_LENGTHS, PLAY_WARNING } from '../../utils/cribbage.js'

/**
 * Shared sheet for the play (pegging) phase of a cribbage round. It stays open for the
 * whole play: tap what happened and the selection moves to the next player once the
 * combo window passes, so a second tap within it (15 and a pair) lands on the same
 * player. Every event is logged in order across all players, and tapping a log entry
 * takes it back. The log is saved on this phone per game and round.
 *
 * players: [{ player_id, player_name, draft, draft_parts, committed_total }] in seat order
 * target: points that win the game (121), or null
 * storageKey: where the play log is kept on this phone (null to skip saving)
 * onAdd(playerId, delta): adds (or, with a negative delta, removes) play points
 */
export const COMBO_WINDOW_MS = 2000
const TOAST_MS = 1800

export const playLogKey = (gameId, round) => `skorbord.play.${gameId}.${round}`

export const clearPlayLog = (key) => {
  try { localStorage.removeItem(key) } catch { /* storage unavailable */ }
}

const loadLog = (key) => {
  if (!key) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(key))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const buzz = (pattern) => {
  try { navigator.vibrate?.(pattern) } catch { /* not supported */ }
}

const PlaySheet = ({ players, dealerId, target = null, storageKey = null, onAdd, onClose }) => {
  const dealerIndex = players.findIndex((p) => p.player_id === dealerId)
  // The player left of the dealer plays first, so they are the likely first scorer
  const firstId = players.length ? players[(dealerIndex + 1) % players.length].player_id : null
  const [selectedId, setSelectedId] = useState(firstId)
  const [log, setLog] = useState(() => loadLog(storageKey)) // { key, playerId, label, points }, oldest first
  const [pickingRun, setPickingRun] = useState(false)
  const [nextKey, setNextKey] = useState(() => loadLog(storageKey).reduce((m, e) => Math.max(m, e.key), 0) + 1)
  const [advanceTo, setAdvanceTo] = useState(null) // player the selection moves to when the combo window ends
  const [toast, setToast] = useState('')
  const comboTimer = useRef(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify(log)) } catch { /* storage unavailable */ }
  }, [log, storageKey])

  useEffect(() => () => {
    clearTimeout(comboTimer.current)
    clearTimeout(toastTimer.current)
  }, [])

  const showToast = (text) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS)
  }

  const select = (id) => {
    clearTimeout(comboTimer.current)
    setAdvanceTo(null)
    setSelectedId(id)
  }

  // Move to the next seat after the combo window; another score inside it restarts the window
  const armAdvance = (fromId) => {
    const idx = players.findIndex((p) => p.player_id === fromId)
    const nextId = players[(idx + 1) % players.length].player_id
    if (nextId === fromId) return
    setAdvanceTo(nextId)
    clearTimeout(comboTimer.current)
    comboTimer.current = setTimeout(() => {
      setSelectedId(nextId)
      setAdvanceTo(null)
    }, COMBO_WINDOW_MS)
  }

  const nameOf = (id) => players.find((p) => p.player_id === id)?.player_name ?? ''

  const totalOf = (p) => (p.committed_total || 0) + (p.draft || 0)

  const add = (playerId, label, points) => {
    setLog((l) => [...l, { key: nextKey, playerId, label, points }])
    setNextKey((k) => k + 1)
    setPickingRun(false)
    onAdd(playerId, points)
    const scorer = players.find((p) => p.player_id === playerId)
    const reaches = target !== null && scorer && totalOf(scorer) < target && totalOf(scorer) + points >= target
    buzz(reaches ? 400 : label === '31' || label === 'Go' ? [40, 60, 40] : 40)
    showToast(reaches ? `${nameOf(playerId)} reaches ${target}! Tap Done to save` : `${nameOf(playerId)} +${points} ${label}`)
  }

  const remove = (entry) => {
    setLog((l) => l.filter((e) => e.key !== entry.key))
    onAdd(entry.playerId, -entry.points)
  }

  const clearPlay = () => {
    if (!log.length || !window.confirm('Clear all play points for this round?')) return
    log.forEach((entry) => onAdd(entry.playerId, -entry.points))
    setLog([])
  }

  const score = (label, points) => {
    if (!selectedId) return
    add(selectedId, label, points)
    armAdvance(selectedId)
  }

  const playPoints = (p) => p.draft_parts?.play ?? p.draft ?? 0

  return (
    <div className="modal modal-open modal-middle" role="dialog" aria-label="Play">
      <div className="modal-box">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Play</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>

        <p className="mt-2 text-xs uppercase tracking-wide text-base-content/60">Who scored</p>
        <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Who scored">
          {players.map((p) => {
            const selected = p.player_id === selectedId
            const total = totalOf(p)
            const wins = target !== null && total >= target
            return (
              <button
                key={p.player_id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`chip-${p.player_id}`}
                className={`flex-1 rounded-box border-2 px-1 py-2 text-center ${selected ? 'border-primary bg-primary/20' : 'border-base-300'}`}
                onClick={() => select(p.player_id)}
              >
                <span className="block truncate text-xs">{p.player_name}</span>
                <span className="block text-2xl font-bold tabular-nums">+{playPoints(p)}</span>
                <span className="block text-xs text-base-content/60">total {total}</span>
                {p.player_id === advanceTo && <span className="badge badge-ghost badge-sm mt-1">next</span>}
                {wins && <span className="badge badge-success badge-sm mt-1">{target}!</span>}
                {playPoints(p) > PLAY_WARNING && <span className="badge badge-warning badge-sm mt-1">check</span>}
              </button>
            )
          })}
        </div>

        <p className="mt-3 text-xs uppercase tracking-wide text-base-content/60">
          What happened{selectedId ? ` (adds to ${nameOf(selectedId)})` : ''}
        </p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {PEG_EVENTS.map((e) => (
            <button
              key={e.label}
              type="button"
              className="btn btn-primary btn-md flex-col h-auto py-2 leading-tight"
              onClick={() => score(e.label, e.points)}
            >
              <span>{e.label}</span>
              <span className="text-xs font-normal opacity-80">+{e.points}</span>
            </button>
          ))}
          <button
            type="button"
            className={`btn btn-md flex-col h-auto py-2 leading-tight ${pickingRun ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setPickingRun((v) => !v)}
            aria-expanded={pickingRun}
          >
            <span>Run</span>
            <span className="text-xs font-normal opacity-80">3 to 7</span>
          </button>
          {dealerIndex >= 0 && (
            <button
              type="button"
              className="btn btn-outline btn-md flex-col h-auto py-2 leading-tight"
              onClick={() => add(dealerId, 'Heels', 2)}
            >
              <span>Heels</span>
              <span className="text-xs font-normal opacity-80">+2 {nameOf(dealerId)}</span>
            </button>
          )}
        </div>
        {pickingRun && (
          <div className="mt-2 flex items-center gap-2" data-testid="run-lengths">
            <span className="text-sm">Cards in the run:</span>
            {RUN_LENGTHS.map((n) => (
              <button key={n} type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => score(`Run of ${n}`, n)}>
                {n}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-base-content/60">Log (tap one to remove it)</p>
          <div className="flex gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              disabled={log.length === 0}
              onClick={() => remove(log[log.length - 1])}
            >
              Undo last
            </button>
            <button type="button" className="btn btn-ghost btn-xs text-error" disabled={log.length === 0} onClick={clearPlay}>
              Clear play
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1" data-testid="play-log">
          {log.length === 0 && <span className="text-sm text-base-content/50">Nothing scored yet</span>}
          {log.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="badge badge-lg gap-1"
              onClick={() => remove(entry)}
              aria-label={`Remove ${nameOf(entry.playerId)} ${entry.label}`}
            >
              {nameOf(entry.playerId)} {entry.label} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        {toast && (
          <div className="toast toast-center toast-bottom" role="status">
            <div className="alert alert-info py-2 text-sm">{toast}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlaySheet
