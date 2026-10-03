import { useState } from 'react'
import { PEG_EVENTS, RUN_LENGTHS, PLAY_WARNING } from '../../utils/cribbage.js'

/**
 * Shared sheet for the play (pegging) phase of a cribbage round. It stays open for the
 * whole play: pick who scored (the choice sticks), then tap what happened. Every event
 * is logged in order across all players, and tapping a log entry takes it back.
 *
 * players: [{ player_id, player_name, draft, draft_parts, committed_total }] in seat order
 * target: points that win the game (121), or null
 * onAdd(playerId, delta): adds (or, with a negative delta, removes) play points
 */
const PlaySheet = ({ players, dealerId, target = null, onAdd, onClose }) => {
  const dealerIndex = players.findIndex((p) => p.player_id === dealerId)
  // The player left of the dealer plays first, so they are the likely first scorer
  const firstId = players.length ? players[(dealerIndex + 1) % players.length].player_id : null
  const [selectedId, setSelectedId] = useState(firstId)
  const [log, setLog] = useState([]) // { key, playerId, label, points }, oldest first
  const [pickingRun, setPickingRun] = useState(false)
  const [nextKey, setNextKey] = useState(1)

  const nameOf = (id) => players.find((p) => p.player_id === id)?.player_name ?? ''

  const add = (playerId, label, points) => {
    setLog((l) => [...l, { key: nextKey, playerId, label, points }])
    setNextKey((k) => k + 1)
    setPickingRun(false)
    onAdd(playerId, points)
  }

  const remove = (entry) => {
    setLog((l) => l.filter((e) => e.key !== entry.key))
    onAdd(entry.playerId, -entry.points)
  }

  const score = (label, points) => selectedId && add(selectedId, label, points)

  const playPoints = (p) => p.draft_parts?.play ?? p.draft ?? 0

  return (
    <div className="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-label="Play">
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
            const total = (p.committed_total || 0) + (p.draft || 0)
            const wins = target !== null && total >= target
            return (
              <button
                key={p.player_id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`chip-${p.player_id}`}
                className={`flex-1 rounded-box border-2 px-1 py-2 text-center ${selected ? 'border-primary bg-primary/20' : 'border-base-300'}`}
                onClick={() => setSelectedId(p.player_id)}
              >
                <span className="block truncate text-xs">{p.player_name}</span>
                <span className="block text-2xl font-bold tabular-nums">+{playPoints(p)}</span>
                <span className="block text-xs text-base-content/60">total {total}</span>
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
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={log.length === 0}
            onClick={() => remove(log[log.length - 1])}
          >
            Undo last
          </button>
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
      </div>
    </div>
  )
}

export default PlaySheet
