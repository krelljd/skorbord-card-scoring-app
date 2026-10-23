// The story of one game, from its saved rounds: who led after each round, how often the lead changed,
// the winner's worst deficit, and the swing round. Works for any number of players.
// Pure helpers so the Score history band and the Game Over chips share one calculation.

export const MIN_ROUNDS = 3
export const TRAILED_MIN = 10 // a comeback chip needs at least this deficit, or 10% of the target when that is larger
export const LEAD_CHANGES_MIN = 2
export const SWING_MIN = 15

const round2 = (n) => Math.round(n * 100) / 100

/**
 * @param {object} roundState - { game, players: [{ player_id, player_name }], rounds: [{ round_number, status, is_backfill, scores }] }
 * @param {{ winnerId?: string|null, includeOpen?: boolean }} [opts] includeOpen counts the open round when it has points,
 *   for a game that was just finalized and whose last draft the screen has not reloaded yet.
 * @returns {null | { rounds, cells, leadChanges, roundsLed, deficit, swing, higherIsBetter }}
 *   null below MIN_ROUNDS real rounds. cells: [{ round, leaderId, totals }], leaderId null on a tie for first.
 */
export function gameStory(roundState, { winnerId = null, includeOpen = false } = {}) {
  const players = roundState?.players || []
  if (players.length < 2) return null
  const higherIsBetter = roundState?.game?.win_condition_type !== 'lose'

  const counts = (r) => r.status === 'committed' || (includeOpen && r.status === 'open' && Object.values(r.scores || {}).some((p) => p !== 0))
  const saved = (roundState.rounds || []).filter(counts).sort((a, b) => a.round_number - b.round_number)
  // Earlier-games totals (backfill) count toward the running totals but are not a round
  const real = saved.filter((r) => !r.is_backfill)
  if (real.length < MIN_ROUNDS) return null

  const totals = Object.fromEntries(players.map((p) => [p.player_id, 0]))
  const cells = []
  const roundsLed = Object.fromEntries(players.map((p) => [p.player_id, 0]))
  let lastLeader = null
  let leadChanges = 0
  let deficitPoints = 0
  let swing = null

  for (const r of saved) {
    for (const p of players) totals[p.player_id] += r.scores?.[p.player_id] || 0
    if (r.is_backfill) continue

    const values = players.map((p) => totals[p.player_id])
    const best = higherIsBetter ? Math.max(...values) : Math.min(...values)
    const leaders = players.filter((p) => totals[p.player_id] === best)
    const leaderId = leaders.length === 1 ? leaders[0].player_id : null
    if (leaderId) {
      roundsLed[leaderId] += 1
      if (lastLeader && lastLeader !== leaderId) leadChanges += 1
      lastLeader = leaderId
    }
    cells.push({ round: r.round_number, leaderId, totals: { ...totals } })

    if (winnerId && totals[winnerId] !== undefined) {
      const behind = higherIsBetter ? best - totals[winnerId] : totals[winnerId] - best
      deficitPoints = Math.max(deficitPoints, behind)
    }

    // Swing: the round where the best round score beat the second best by the most
    const scored = players.map((p) => ({ playerId: p.player_id, points: r.scores?.[p.player_id] || 0 }))
    scored.sort((a, b) => (higherIsBetter ? b.points - a.points : a.points - b.points))
    const gap = Math.abs(scored[0].points - scored[1].points)
    if (gap > 0 && (!swing || gap > swing.gap)) {
      swing = { round: r.round_number, playerId: scored[0].playerId, points: scored[0].points, gap }
    }
  }

  return {
    rounds: real.length,
    cells,
    leadChanges,
    roundsLed,
    deficit: winnerId ? { playerId: winnerId, points: round2(deficitPoints) } : null,
    swing,
    higherIsBetter
  }
}

const signed = (n) => (n > 0 ? `+${n}` : String(n))

/**
 * Notable facts about the game, as short strings for Game Over. A plain wire-to-wire win gives none.
 * names: player_id -> display name. target: the game's goal, or null.
 */
export function storyChips(story, { winnerId, names, target = null }) {
  if (!story || !winnerId) return []
  const chips = []
  const nameOf = (id) => names[id] || 'Someone'

  const needed = target ? Math.max(TRAILED_MIN, Math.round(target * 0.1)) : TRAILED_MIN
  if (story.deficit && story.deficit.points >= needed) chips.push(`Trailed by ${story.deficit.points}, won`)

  // The non-winner who led the most rounds, when that beat the winner's own rounds in front
  const others = Object.entries(story.roundsLed).filter(([id]) => id !== winnerId).sort((a, b) => b[1] - a[1])
  if (others.length && others[0][1] > (story.roundsLed[winnerId] || 0)) {
    chips.push(`${nameOf(others[0][0])} led ${others[0][1]} of ${story.rounds} rounds`)
  }

  if (story.leadChanges >= LEAD_CHANGES_MIN) chips.push(`Lead changed ${story.leadChanges}×`)

  if (story.swing && story.swing.gap >= SWING_MIN) {
    chips.push(`Swing round: R${story.swing.round}, ${nameOf(story.swing.playerId)} ${signed(story.swing.points)}`)
  }
  return chips
}
