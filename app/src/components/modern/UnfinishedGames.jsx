import { useState } from 'react'
import { timeAgo } from '../../utils/timeAgo.js'

/**
 * Parked unfinished games on the New game screen: type, round, players with totals, how long ago,
 * Resume, and Discard behind a confirm. Renders nothing when there are none.
 */
const UnfinishedGames = ({ games = [], busyId = null, onResume, onDiscard }) => {
  const [confirmId, setConfirmId] = useState(null)
  if (!games.length) return null

  return (
    <section className="su-sec" aria-labelledby="su-unfinished">
      <h2 id="su-unfinished" className="pc-label">Unfinished games</h2>
      <ul className="space-y-2">
        {games.map((g) => (
          <li key={g.id} className="rounded-box border border-base-300 bg-base-100 p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-bold">
                  {g.game_type_name} <span className="font-normal text-sm opacity-70">· round {g.current_round}</span>
                </div>
                <div className="text-sm truncate">{g.players.map((p) => p.name).join(', ')}</div>
                <div className="text-sm opacity-70">
                  {g.players.map((p) => p.score).join(' – ')} · {timeAgo(g.last_activity)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary min-h-11"
                disabled={busyId === g.id}
                aria-label={`Resume ${g.game_type_name}, ${g.players.map((p) => p.name).join(', ')}`}
                onClick={() => onResume(g)}
              >
                Resume
              </button>
            </div>
            {confirmId === g.id ? (
              <div className="mt-2 flex items-center justify-end gap-2 text-sm">
                <span>Discard this game?</span>
                <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={() => setConfirmId(null)}>Keep</button>
                <button
                  type="button"
                  className="btn btn-error btn-sm min-h-11"
                  onClick={() => { setConfirmId(null); onDiscard(g) }}
                >
                  Discard
                </button>
              </div>
            ) : (
              <div className="mt-1 text-right">
                <button type="button" className="btn btn-ghost btn-xs min-h-10" onClick={() => setConfirmId(g.id)}>
                  Discard
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="su-hint">Games you leave alone for 30 days are hidden.</p>
    </section>
  )
}

export default UnfinishedGames
