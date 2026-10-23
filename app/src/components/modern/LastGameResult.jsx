import { useEffect, useState } from 'react'
import gameAPI from '../../services/gameAPI.js'
import GameOver, { RematchSheet } from './GameOver.jsx'
import RoundHistory from './RoundHistory.jsx'
import { seriesLine, rematchDealer } from '../../utils/gameResult.js'
import { useToast } from '../Toast.jsx'
import { parseError } from '../../utils/errorUtils.js'

/**
 * Shown on Current when there is no active game. Reopens the Game Over screen of the most
 * recently finalized game, so the result and Rematch are still reachable after visiting Stats.
 */
const LastGameResult = ({ sqid, rivalries = [], onNewGame, onRematch, onOpenStats }) => {
  const { addToast } = useToast()
  const [last, setLast] = useState(undefined) // undefined: loading, null: none, else { game, roundState }
  const [showResult, setShowResult] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [rematchOpen, setRematchOpen] = useState(false)
  const [rematchBusy, setRematchBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await gameAPI.request(`/api/${sqid}/games?finalized=true&limit=1`)
        const game = res?.data?.[0]
        if (!game) return !cancelled && setLast(null)
        const roundState = await gameAPI.getRounds(sqid, game.id)
        if (!cancelled) setLast({ game, roundState })
      } catch {
        if (!cancelled) setLast(null)
      }
    })()
    return () => { cancelled = true }
  }, [sqid])

  const noGame = (
    <div className="flex flex-col items-center justify-center min-h-96 space-y-4">
      <h2 className="text-2xl font-bold text-base-content">No Active Game</h2>
      <p className="text-base-content/70 text-center max-w-md">Start a new game from the menu to begin tracking scores.</p>
      <button className="btn btn-primary" onClick={onNewGame}>New Game</button>
    </div>
  )

  if (last === undefined) return <div className="flex justify-center min-h-96 items-center"><div className="loading loading-spinner loading-lg text-primary" /></div>
  if (!last) return noGame

  const { game, roundState } = last
  const g = { ...game, ...roundState.game }
  const players = roundState.players.map((p) => ({ player_id: p.player_id, player_name: p.player_name, score: p.committed_total + (p.draft || 0) }))
  const tracksParts = Array.isArray(g.score_parts) && g.score_parts.length > 0
  const winnerId = g.winner_id || game.winner_id
  const rivalry = rivalries.find((r) => r.id === g.rivalry_id)
  const firstRound = (roundState.rounds || []).filter((r) => !r.is_backfill).sort((a, b) => a.round_number - b.round_number)[0]
  const defaultDealer = rematchDealer(players.map((p) => p.player_id), firstRound?.dealer_id)

  const startRematch = async (dealerId) => {
    setRematchBusy(true)
    try {
      await onRematch({
        game_type_id: g.game_type_id,
        player_ids: players.map((p) => p.player_id),
        win_condition_type: g.win_condition_type,
        win_condition_value: g.win_condition_value,
        ...(dealerId ? { dealer_id: dealerId } : {})
      })
    } catch (error) {
      addToast(`Could not start the rematch: ${parseError(error).message}`, 'error')
      setRematchBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-96 space-y-3">
        <h2 className="text-2xl font-bold text-base-content">No Active Game</h2>
        <button className="btn btn-primary min-h-12" onClick={() => setShowResult(true)}>Last game result and rematch</button>
        <button className="btn btn-outline" onClick={() => setShowHistory(true)}>Score history</button>
        <button className="btn btn-ghost" onClick={onNewGame}>New Game</button>
      </div>

      {showResult && winnerId && !showHistory && (
        <GameOver
          game={g}
          players={players}
          winnerId={winnerId}
          series={seriesLine(rivalry?.players)}
          showSkunk={tracksParts}
          roundState={roundState}
          sqid={sqid}
          onRematch={() => setRematchOpen(true)}
          onStats={onOpenStats}
          onHistory={() => setShowHistory(true)}
          onClose={() => setShowResult(false)}
        />
      )}
      {showHistory && (
        <RoundHistory roundState={roundState} canEdit={false} onClose={() => setShowHistory(false)} />
      )}
      {rematchOpen && (
        <RematchSheet
          game={g}
          players={players}
          showDealer={tracksParts}
          defaultDealerId={defaultDealer}
          busy={rematchBusy}
          onStart={startRematch}
          onCancel={() => setRematchOpen(false)}
        />
      )}
    </>
  )
}

export default LastGameResult
