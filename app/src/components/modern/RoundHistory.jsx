import { useMemo, useState } from 'react'
import NumberPad from './NumberPad.jsx'

/**
 * Score history: one row per saved round, one column per player, with the
 * running total under each score. Tap a saved cell to correct it.
 * Games from before round tracking show one "Earlier" row with totals only.
 */
const LINE_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#6b7280']

/** Running totals after each saved round, one line per player. */
const TotalsChart = ({ players, rows }) => {
  if (rows.length < 2) return null
  const W = 320
  const H = 110
  const pad = 8
  const all = rows.flatMap((r) => r.cells.map((c) => c.running))
  const min = Math.min(0, ...all)
  const max = Math.max(1, ...all)
  const x = (i) => pad + (i * (W - 2 * pad)) / (rows.length - 1)
  const y = (v) => H - pad - ((v - min) * (H - 2 * pad)) / (max - min)
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Running totals by round">
        {players.map((p, pi) => (
          <polyline
            key={p.player_id}
            fill="none"
            stroke={LINE_COLORS[pi % LINE_COLORS.length]}
            strokeWidth="2"
            points={rows.map((r, i) => `${x(i)},${y(r.cells[pi].running)}`).join(' ')}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs justify-center">
        {players.map((p, pi) => (
          <span key={p.player_id} className="flex items-center gap-1">
            <span className="inline-block w-3 h-1 rounded" style={{ background: LINE_COLORS[pi % LINE_COLORS.length] }} />
            {p.player_name}
          </span>
        ))}
      </div>
    </div>
  )
}

const RoundHistory = ({ roundState, onEdit, onClose, canEdit }) => {
  const [editing, setEditing] = useState(null)

  const { players, rows, totals, averages } = useMemo(() => {
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
    // Averages use real rounds only; the "Earlier" row holds old totals, not a round
    const real = rows.filter((r) => !r.round.is_backfill)
    const averages = players.map((p, i) =>
      real.length ? Math.round((real.reduce((sum, r) => sum + r.cells[i].points, 0) / real.length) * 10) / 10 : null
    )
    return { players, rows, totals, averages }
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
                {averages.some((a) => a !== null) && (
                  <tr className="font-normal">
                    <th className="text-left font-normal">Avg per round</th>
                    {averages.map((a, i) => (
                      <td key={players[i].player_id}>{a ?? '–'}</td>
                    ))}
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
        <TotalsChart players={players} rows={rows} />
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
