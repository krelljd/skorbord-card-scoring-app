import { useState } from 'react'
import { gameResult, skunkLabel } from '../../utils/gameResult.js'
import { gameStory, storyChips } from '../../utils/gameStory.js'
import LeadBand from './LeadBand.jsx'

/**
 * Full-screen result after a game is finalized. The screen floods in the winner's player color,
 * so it matches their card. Rematch is the main action.
 *
 * players: [{ player_id, player_name, score }] in seat order (seat index sets the color)
 * series: { score, status } for the rivalry, or null
 * roundState: the game's saved rounds, for the lead band and the comeback and swing chips (optional)
 */
const GameOver = ({ game, players, winnerId, series = null, showSkunk = false, roundState = null, onRematch, onStats, onHistory, onClose }) => {
  const result = gameResult(players, winnerId)
  if (!result) return null
  const skunk = showSkunk ? skunkLabel(players, winnerId, Number(game?.win_condition_value) || 121) : null
  // The last draft may not have reached the client's round list yet, so count it when it has points
  const story = gameStory(roundState, { winnerId, includeOpen: true })
  const target = game?.win_condition_type === 'win' ? Number(game.win_condition_value) || null : null
  const storyLines = storyChips(story, { winnerId, names: Object.fromEntries(players.map((p) => [p.player_id, p.player_name])), target })
  const margin = `by ${result.margin} point${result.margin === 1 ? '' : 's'}`

  return (
    <div className="go-flood" style={{ '--c': `var(--pc-${result.winnerIndex % 8})` }} role="dialog" aria-label={`${result.winner.player_name} wins`}>
      <div className="flex items-center justify-between">
        <span className="go-eyebrow">{game?.game_type_name || 'Game'} · Game over</span>
        <button type="button" className="go-link" onClick={onClose}>View board</button>
      </div>

      <h2 className="go-title">{result.winner.player_name}<br />wins</h2>
      <p className="go-sub">{margin}</p>

      {(series || skunk || storyLines.length > 0) && (
        <div className="go-chips">
          {skunk && <span className="go-chip">{skunk}</span>}
          {series && <span className="go-chip">Series {series.score}</span>}
          {series && <span className="go-chip">{series.status}</span>}
          {storyLines.map((line) => <span key={line} className="go-chip">{line}</span>)}
        </div>
      )}

      <LeadBand story={story} players={roundState?.players || []} colors={[]} mode="neutral" winnerId={winnerId} />

      <div className="go-final">
        {result.ranked.map((p, i) => (
          <div key={p.player_id} className={`go-line ${i === 0 ? '' : 'go-line-lose'}`}>
            <span className="go-num">{p.score}</span>
            <span className="truncate">{p.player_name}</span>
          </div>
        ))}
      </div>

      <div className="go-actions">
        <button type="button" className="go-main" onClick={onRematch}>Rematch</button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="go-alt" onClick={onStats}>Rivalry stats</button>
          <button type="button" className="go-alt" onClick={onHistory}>Score history</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Bottom sheet to start the next game with the same type, win condition and players.
 * For games with a dealer (cribbage) it asks who deals first, defaulting to the other player.
 */
export const RematchSheet = ({ game, players, showDealer, defaultDealerId, busy = false, onStart, onCancel }) => {
  const [dealerId, setDealerId] = useState(defaultDealerId)
  const dealerName = players.find((p) => p.player_id === defaultDealerId)?.player_name

  return (
    <div className="modal modal-open modal-bottom sm:modal-middle z-50" role="dialog" aria-label="Rematch">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Rematch</h3>
        <p className="text-sm text-base-content/70">
          {game?.game_type_name} · {game?.win_condition_type === 'win' ? 'First to' : 'Lose at'} {game?.win_condition_value} · {players.map((p) => p.player_name).join(', ')}
        </p>

        {showDealer && (
          <>
            <p className="mt-4 mb-1 text-xs uppercase tracking-wide text-base-content/60">Who deals first</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who deals first">
              {players.map((p) => (
                <button
                  key={p.player_id}
                  type="button"
                  role="radio"
                  aria-checked={p.player_id === dealerId}
                  className={`btn ${p.player_id === dealerId ? 'btn-primary' : 'btn-ghost bg-base-200'}`}
                  onClick={() => setDealerId(p.player_id)}
                >
                  {p.player_name}
                </button>
              ))}
            </div>
            {dealerName && <p className="mt-1 text-xs text-base-content/60">{dealerName} deals first to alternate from last game.</p>}
          </>
        )}

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onStart(showDealer ? dealerId : null)} disabled={busy}>
            {busy ? 'Starting…' : 'Start game'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default GameOver
