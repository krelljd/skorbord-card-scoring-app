// Pure helpers behind the series timeline, game-type tiles and points split on the Stats screen.
// A timeline is the rivalry's finished games, oldest first: [{ id, winner_id, game_type_id, game_type_name, ended_at, margin }].

/** The player on the current winning streak and how long it is: { playerId, length }. Length 0 for no games. */
export function currentStreak(timeline) {
  const list = timeline || []
  if (!list.length) return { playerId: null, length: 0 }
  const playerId = list[list.length - 1].winner_id
  let length = 0
  for (let i = list.length - 1; i >= 0 && list[i].winner_id === playerId; i--) length++
  return { playerId, length }
}

/** Longest winning streak per player id, and the best one overall ({ playerId, length }, first holder on a tie). */
export function longestStreaks(timeline) {
  const byPlayer = {}
  let best = { playerId: null, length: 0 }
  let run = 0
  let prev = null
  for (const game of timeline || []) {
    run = game.winner_id === prev ? run + 1 : 1
    prev = game.winner_id
    byPlayer[game.winner_id] = Math.max(byPlayer[game.winner_id] || 0, run)
    if (run > best.length) best = { playerId: game.winner_id, length: run }
  }
  return { byPlayer, best }
}

/**
 * Bar heights from 0 to 1, in game order. A margin is scaled against the biggest margin of the same game
 * type, so a golf blowout and a cribbage blowout both draw tall. Every bar keeps a visible minimum.
 */
export function barHeights(timeline, min = 0.12) {
  const maxByType = {}
  for (const g of timeline || []) maxByType[g.game_type_id] = Math.max(maxByType[g.game_type_id] || 0, g.margin)
  return (timeline || []).map((g) => {
    const max = maxByType[g.game_type_id]
    return max > 0 ? Math.max(min, g.margin / max) : min
  })
}

/**
 * Who owns a game type: the player with the most wins. Players tied for the most wins make it "even".
 * rows: [{ id, name, wins }] with wins for this game type. Returns { owner, tied, wins, total }.
 */
export function gameTypeOwner(rows) {
  const total = rows.reduce((sum, r) => sum + r.wins, 0)
  const top = Math.max(0, ...rows.map((r) => r.wins))
  const leaders = rows.filter((r) => r.wins === top)
  if (total === 0) return { owner: null, tied: false, wins: 0, total }
  if (leaders.length > 1) return { owner: null, tied: true, wins: top, total }
  return { owner: leaders[0], tied: false, wins: top, total }
}

/**
 * Each player's share of the lifetime points in one game type, in the order given.
 * points: player_id -> game_type_id -> points (the rivalry's points_totals).
 * Returns [{ id, name, points, share }] where share is 0 to 1, or null when nobody has points.
 */
export function pointsShares(pointsTotals, players, gameTypeId) {
  const rows = players.map((p) => ({ id: p.id, name: p.name, points: Number(pointsTotals?.[p.id]?.[gameTypeId]) || 0 }))
  const total = rows.reduce((sum, r) => sum + r.points, 0)
  if (total <= 0) return null
  return rows.map((r) => ({ ...r, share: r.points / total }))
}

/**
 * The note for a split between wins and points: "Jess wins more, Alex scores more", or '' when the same
 * player leads both or either lead is tied. In games where low wins, "scores fewer" is the better total.
 * shares: output of pointsShares; winRows: [{ id, wins }]
 */
export function differentialNote(shares, winRows, higherIsBetter = true) {
  if (!shares) return ''
  const topWins = Math.max(...winRows.map((r) => r.wins))
  const winLeaders = winRows.filter((r) => r.wins === topWins)
  const pts = shares.map((s) => s.points)
  const topPoints = higherIsBetter ? Math.max(...pts) : Math.min(...pts)
  const pointLeaders = shares.filter((s) => s.points === topPoints)
  if (topWins === 0 || winLeaders.length !== 1 || pointLeaders.length !== 1) return ''
  if (winLeaders[0].id === pointLeaders[0].id) return ''
  const winnerName = shares.find((s) => s.id === winLeaders[0].id)?.name
  return `${winnerName} wins more, ${pointLeaders[0].name} ${higherIsBetter ? 'scores more' : 'scores fewer'}`
}
