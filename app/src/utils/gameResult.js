/** Skunk lines in cribbage: the loser ended below 91 (skunk) or below 61 (double skunk). */
export const SKUNK_LINE = 91
export const DOUBLE_SKUNK_LINE = 61

/**
 * Summary of a finished game for the game-over screen.
 * players: [{ player_id, player_name, score }] in seat order. Returns null without a winner.
 * The margin is the winner's lead over the best other player.
 */
export function gameResult(players, winnerId) {
  const winner = players.find((p) => p.player_id === winnerId)
  if (!winner) return null
  const winnerIndex = players.indexOf(winner)
  const others = players.filter((p) => p !== winner)
  const closest = others.reduce((best, p) => (best === null || Math.abs(winner.score - p.score) < Math.abs(winner.score - best.score) ? p : best), null)
  return {
    winner,
    winnerIndex,
    margin: closest ? Math.abs(winner.score - closest.score) : 0,
    ranked: [winner, ...others.sort((a, b) => Math.abs(winner.score - a.score) - Math.abs(winner.score - b.score))]
  }
}

/** Skunk text for a cribbage game that reached the target, or null. Only counts the loser(s) behind the winner. */
export function skunkLabel(players, winnerId, target = 121) {
  const winner = players.find((p) => p.player_id === winnerId)
  if (!winner || winner.score < target) return null
  const losers = players.filter((p) => p !== winner)
  const double = losers.filter((p) => p.score < DOUBLE_SKUNK_LINE)
  if (double.length) return `Double skunk! ${double.map((p) => p.player_name).join(' and ')} ended under ${DOUBLE_SKUNK_LINE}`
  const single = losers.filter((p) => p.score < SKUNK_LINE)
  if (single.length) return `Skunk! ${single.map((p) => p.player_name).join(' and ')} ended under ${SKUNK_LINE}`
  return null
}

/** Series line for a rivalry: wins per player, leader first. */
export function seriesLine(rivalryPlayers) {
  const rows = (rivalryPlayers || []).map((p) => ({ name: p.name, wins: Number(p.wins) || 0 }))
  if (rows.length < 2) return null
  const sorted = [...rows].sort((a, b) => b.wins - a.wins)
  const tied = sorted[0].wins === sorted[1].wins
  return {
    score: sorted.map((r) => r.wins).join(' – '),
    status: tied ? 'Series tied' : `${sorted[0].name} leads`
  }
}

/** Who deals first in a rematch: the player after last game's first dealer, in seat order. */
export function rematchDealer(playerIds, lastFirstDealerId) {
  if (!playerIds.length) return null
  const i = playerIds.indexOf(lastFirstDealerId)
  return playerIds[(i + 1) % playerIds.length]
}
