// Pure helpers behind the Stats screen, kept apart from the component so they can be tested.

const MINUS = '−'

export const ordinal = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`

/**
 * Rank players by wins, highest first. Players with the same wins share a rank
 * (1, 1, 3). Returns { order, rankById } with order being the players sorted for
 * display; ties keep their incoming order.
 */
export function rankPlayers(rows) {
  const order = [...rows].sort((a, b) => b.wins - a.wins)
  const rankById = {}
  order.forEach((row, i) => {
    rankById[row.id] = i > 0 && row.wins === order[i - 1].wins ? rankById[order[i - 1].id] : i + 1
  })
  return { order, rankById }
}

/** "Leads 13–8", "Tied 8–8" or '' for the player who is behind. Two players only. */
export function headToHeadLabel(wins, otherWins) {
  if (wins === otherWins) return `Tied ${wins}–${otherWins}`
  return wins > otherWins ? `Leads ${wins}–${otherWins}` : ''
}

export function rankLabel(rank, wins) {
  return `${ordinal(rank)} · ${wins} ${wins === 1 ? 'win' : 'wins'}`
}

export function winPct(wins, total) {
  const t = Number(total) || 0
  if (t <= 0) return '–'
  return `${Math.round(((Number(wins) || 0) / t) * 100)}%`
}

/** Margin tile text. A margin of an outcome that never happened shows a dash. */
export function marginText(value, count, sign) {
  if (!count || value === null || value === undefined) return '–'
  const n = Math.abs(Number(value))
  return `${sign === '-' ? MINUS : '+'}${n}`
}

/** Last results as letters, oldest to newest, at most ten. */
export function formLetters(results) {
  return String(results || '').toUpperCase().replace(/[^WLT]/g, '').slice(-10).split('').filter(Boolean)
}

export function formSummary(letters) {
  const w = letters.filter((c) => c === 'W').length
  const l = letters.filter((c) => c === 'L').length
  const t = letters.length - w - l
  return `Last ${letters.length}: ${w} won, ${l} lost${t ? `, ${t} tied` : ''}`
}

/** Final scores as "121 – 109 – 88": the winner first, the rest closest to winning first. */
export function scoreLine(playerScores, winnerId, higherIsBetter = true) {
  const scores = (playerScores || []).map((ps) => ({ id: ps.player_id, score: Number(ps.score) || 0 }))
  const rest = scores.filter((s) => s.id !== winnerId).sort((a, b) => (higherIsBetter ? b.score - a.score : a.score - b.score))
  const winner = scores.filter((s) => s.id === winnerId)
  return [...winner, ...rest].map((s) => s.score).join(' – ')
}

export const fmt = (n) => (n === null || n === undefined ? '–' : n)
