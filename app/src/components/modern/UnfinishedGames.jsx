import { useState } from 'react'
import { timeAgo } from '../../utils/timeAgo.js'

const names = (g) => g.players.map((p) => p.name).join(', ')

/** One unfinished game: type, round, players with totals, how long ago, Resume, and Discard behind a confirm. */
const GameRow = ({ game: g, old = false, busy = false, onResume, onDiscard }) => {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className={`rounded-box border border-base-300 bg-base-100 p-3 ${old ? 'border-dashed opacity-85' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold">
            {g.game_type_name} <span className="font-normal text-sm opacity-70 whitespace-nowrap">· round {g.current_round}</span>
          </div>
          <div className="text-sm truncate">{names(g)}</div>
          <div className="text-sm opacity-70">
            {g.players.map((p) => p.score).join(' – ')} · {timeAgo(g.last_activity)}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary min-h-11"
          disabled={busy}
          aria-label={`Resume ${g.game_type_name}, ${names(g)}`}
          onClick={() => onResume(g)}
        >
          Resume
        </button>
      </div>
      {confirming ? (
        <div className="mt-2 flex items-center justify-end gap-2 text-sm">
          <span>Discard this game?</span>
          <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={() => setConfirming(false)}>Keep</button>
          <button type="button" className="btn btn-error btn-sm min-h-11" onClick={() => { setConfirming(false); onDiscard(g) }}>
            Discard
          </button>
        </div>
      ) : (
        <div className="mt-1 text-right">
          <button type="button" className="btn btn-ghost btn-xs min-h-10" onClick={() => setConfirming(true)}>Discard</button>
        </div>
      )}
    </li>
  )
}

/** Sheet listing games with no activity for 30 days, with Discard all behind a confirm. */
const OlderGamesSheet = ({ games, busyId, onResume, onDiscard, onDiscardAll, onClose }) => {
  const [confirmAll, setConfirmAll] = useState(false)
  return (
    <div className="modal modal-open modal-bottom sm:modal-middle z-50" role="dialog" aria-label="Older games">
      <div className="modal-box">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Older games</h3>
          <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={onClose}>Close</button>
        </div>
        <p className="pb-2 text-sm opacity-80">Not touched in 30+ days. Resuming one brings it back to the list.</p>
        <ul className="space-y-2">
          {games.map((g) => (
            <GameRow key={g.id} game={g} old busy={busyId === g.id} onResume={onResume} onDiscard={onDiscard} />
          ))}
        </ul>
        {confirmAll ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <span>Discard all {games.length}?</span>
            <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={() => setConfirmAll(false)}>Keep</button>
            <button type="button" className="btn btn-error btn-sm min-h-11" onClick={() => { setConfirmAll(false); onDiscardAll() }}>
              Discard all
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-block mt-3 min-h-11 text-error" onClick={() => setConfirmAll(true)}>
            Discard all older games
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Parked unfinished games on the New game screen. Recent ones are listed; games with no activity
 * for 30 days sit behind an "Older games" row that opens a sheet. Renders nothing when there are none.
 */
const UnfinishedGames = ({ games = [], olderGames = [], busyId = null, onResume, onDiscard, onDiscardOlder }) => {
  const [showOlder, setShowOlder] = useState(false)
  if (!games.length && !olderGames.length) return null

  return (
    <section className="su-sec" aria-labelledby="su-unfinished">
      <h2 id="su-unfinished" className="pc-label">Unfinished games</h2>
      {games.length > 0 && (
        <ul className="space-y-2">
          {games.map((g) => (
            <GameRow key={g.id} game={g} busy={busyId === g.id} onResume={onResume} onDiscard={onDiscard} />
          ))}
        </ul>
      )}
      {olderGames.length > 0 && (
        <button
          type="button"
          className="mt-2 flex w-full min-h-11 items-center justify-between rounded-box border border-base-300 bg-base-100 px-3 py-2 text-left"
          onClick={() => setShowOlder(true)}
        >
          <span>
            <b>Older games</b>
            <span className="text-sm opacity-70"> · {olderGames.length} over 30 days old</span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      <p className="su-hint">Games you leave alone for 30 days move to Older games.</p>
      {showOlder && olderGames.length > 0 && (
        <OlderGamesSheet
          games={olderGames}
          busyId={busyId}
          onResume={onResume}
          onDiscard={onDiscard}
          onDiscardAll={async () => { await onDiscardOlder?.(); setShowOlder(false) }}
          onClose={() => setShowOlder(false)}
        />
      )}
    </section>
  )
}

export default UnfinishedGames
