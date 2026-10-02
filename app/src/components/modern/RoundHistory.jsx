import { useMemo, useState } from 'react'
import NumberPad from './NumberPad.jsx'

/**
 * Score history: one row per saved round, one column per player, with the
 * running total under each score. Tap a saved cell to correct it.
 * Games from before round tracking show one "Earlier" row with totals only.
 */
const RoundHistory = ({ roundState, onEdit, onClose, canEdit }) => {
  const [editing, setEditing] = useState(null)

  const { players, rows, totals } = useMemo(() => {
    const players = roundState?.players || []
    const running = {}
    const rows = (roundState?.rounds || [])
      .filter((r) => r.status === 'committed')
      .map((r) => {
        const cells = players.map((p) => {
          running[p.player_id] = (running[p.player_id] || 0) + (r.scores[p.player_id] || 0)
          return {
            playerId: p.player_id,
            points: r.scores[p.player_id] || 0,
            running: running[p.player_id],
            edited: Boolean(r.edited[p.player_id])
          }
        })
        return { round: r, cells }
      })
    const totals = players.map((p) => running[p.player_id] || 0)
    return { players, rows, totals }
  }, [roundState])

  const save = async (points) => {
    const target = editing
    setEditing(null)
    await onEdit(target.round.round_number, target.playerId, points, target.round.revision)
  }

  return (
    <div className="modal modal-open" role="dialog" aria-label="Score history">
      <div className="modal-box max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">Score history</h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-base-content/70 py-6 text-center">
            No saved rounds yet. Tap Next round to save the first one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm text-center">
              <thead>
                <tr>
                  <th className="text-left">Round</th>
                  {players.map((p) => (
                    <th key={p.player_id}>{p.player_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ round, cells }) => (
                  <tr key={round.round_number}>
                    <th className="text-left">{round.is_backfill ? 'Earlier' : round.round_number}</th>
                    {cells.map((cell) => (
                      <td key={cell.playerId}>
                        <button
                          type="button"
                          className="flex flex-col items-center w-full disabled:cursor-default"
                          disabled={!canEdit}
                          onClick={() => setEditing({ round, playerId: cell.playerId, points: cell.points })}
                          aria-label={`Edit round ${round.round_number} for ${players.find((p) => p.player_id === cell.playerId)?.player_name}`}
                        >
                          <span className="font-semibold">
                            {cell.points}
                            {cell.edited && <span className="text-warning" title="Corrected"> •</span>}
                          </span>
                          <span className="text-xs text-base-content/50">{cell.running}</span>
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th className="text-left">Total</th>
                  {totals.map((t, i) => (
                    <th key={players[i].player_id}>{t}</th>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p className="text-xs text-base-content/50 mt-2">
            Small number is the running total. • marks a corrected score.
          </p>
        )}
      </div>

      {editing && (
        <NumberPad
          title="Correct score"
          subtitle={`Round ${editing.round.is_backfill ? '(earlier)' : editing.round.round_number} · ${players.find((p) => p.player_id === editing.playerId)?.player_name}`}
          initial={editing.points}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

export default RoundHistory
