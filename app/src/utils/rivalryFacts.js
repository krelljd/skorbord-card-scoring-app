// Plain facts about a rivalry's history, for the snark lines. Pure: it reads the finished-game timeline
// (oldest first: id, winner_id, game_type_id, game_type_name, ended_at, margin) and the skunk counts.
// A fact exists only when enough games back it, and every fact works for two players or more.
import { currentStreak } from './seriesStats.js'

export const MIN_GAMES = 3 // no fact until this many finished games are behind it
export const CLOSE_MARGIN = 5 // "close game" = decided by this many points or fewer
const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (iso) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? null : t
}

/** "Sep 14", or '' when the game has no date. */
export function shortDate(iso) {
  const t = dayOf(iso)
  return t === null ? '' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const weekdayOf = (iso) => {
  const t = dayOf(iso)
  return t === null ? null : new Date(t).toLocaleDateString('en-US', { weekday: 'long' })
}

/** { playerId: n } of wins in a list of games. */
export function winCounts(games) {
  const wins = {}
  for (const g of games) wins[g.winner_id] = (wins[g.winner_id] || 0) + 1
  return wins
}

/**
 * @param {object} args
 * @param {Array<{id, name}>} args.players
 * @param {Array} args.timeline - the whole finished-game history, oldest first
 * @param {Record<string, Record<string, {skunks?: {skunks_received?: number, double_skunks_received?: number}}>>} [args.roundStats] - playerId -> gameTypeId -> stats
 * @param {string|null} [args.gameTypeId] - the game type picked in setup, if any
 * @param {number} [args.now] - ms since epoch, for "days since"
 * @returns {object|null} null while fewer than MIN_GAMES games back the history
 */
export function rivalryFacts({ players = [], timeline = [], roundStats = {}, gameTypeId = null, now = Date.now() }) {
  const name = Object.fromEntries(players.map((p) => [p.id, p.name]))
  const games = timeline.filter((g) => name[g.winner_id])
  if (games.length < MIN_GAMES || players.length < 2) return null

  const wins = winCounts(games)
  const facts = { count: games.length, nextGame: games.length + 1, wins }

  const streak = currentStreak(games)
  if (streak.length >= 3) facts.streak = { playerId: streak.playerId, length: streak.length }

  // Series: tied at the top, or a lead that changed hands with the latest game
  const top = Math.max(...Object.values(wins))
  const leaders = Object.keys(wins).filter((id) => wins[id] === top)
  facts.top = top
  facts.leaders = leaders
  if (leaders.length > 1) facts.tied = true
  // The sole series leader after each game (null while tied). A lead change is the latest game putting
  // someone alone in front who is not the last player to have been alone in front.
  const tally = {}
  const soleAfter = games.map((g) => {
    tally[g.winner_id] = (tally[g.winner_id] || 0) + 1
    const hi = Math.max(...Object.values(tally))
    const at = Object.keys(tally).filter((id) => tally[id] === hi)
    return at.length === 1 ? at[0] : null
  })
  const soleNow = soleAfter[soleAfter.length - 1]
  if (soleNow && soleAfter[soleAfter.length - 2] !== soleNow) {
    const prior = [...soleAfter.slice(0, -1)].reverse().find(Boolean)
    if (prior && prior !== soleNow) facts.leadChange = { newId: soleNow, oldId: prior }
  }

  // Days since each player's last win, for a player who has won before and has now gone a while
  const drought = []
  for (const p of players) {
    const mine = games.filter((g) => g.winner_id === p.id)
    if (!mine.length) continue
    const last = dayOf(mine[mine.length - 1].ended_at)
    const since = games.length - 1 - games.lastIndexOf(mine[mine.length - 1])
    if (last === null || since < 2) continue
    drought.push({ playerId: p.id, days: Math.floor((now - last) / DAY_MS), games: since, date: shortDate(mine[mine.length - 1].ended_at) })
  }
  if (drought.length) facts.drought = drought.sort((a, b) => b.games - a.games)[0]

  // Biggest and smallest margin ever
  const marginGames = games.filter((g) => Number.isFinite(g.margin))
  if (marginGames.length) {
    const big = marginGames.reduce((a, g) => (g.margin > a.margin ? g : a))
    const small = marginGames.reduce((a, g) => (g.margin < a.margin ? g : a))
    const pick = (g) => ({ winnerId: g.winner_id, margin: g.margin, date: shortDate(g.ended_at), typeName: g.game_type_name })
    if (big.margin > CLOSE_MARGIN) facts.blowout = pick(big)
    if (small.margin >= 1 && small.margin <= CLOSE_MARGIN) facts.closest = pick(small)
  }

  // Record in close games: the player with the most close wins, when at least 3 games were that tight
  const close = games.filter((g) => Number.isFinite(g.margin) && g.margin <= CLOSE_MARGIN)
  if (close.length >= MIN_GAMES) {
    const cw = winCounts(close)
    const best = Object.keys(cw).reduce((a, id) => (cw[id] > cw[a] ? id : a))
    const tiedBest = Object.keys(cw).filter((id) => cw[id] === cw[best]).length > 1
    if (!tiedBest) facts.closeRecord = { playerId: best, wins: cw[best], total: close.length, losses: close.length - cw[best] }
  }

  // Game-type ownership: one player has won every game of a type (3+ of them); the picked type wins a tie
  const types = {}
  for (const g of games) (types[g.game_type_id] ||= []).push(g)
  const owned = Object.entries(types)
    .filter(([, list]) => list.length >= MIN_GAMES && new Set(list.map((g) => g.winner_id)).size === 1)
    .map(([id, list]) => ({ typeId: id, typeName: list[0].game_type_name, playerId: list[0].winner_id, count: list.length }))
  if (owned.length) facts.owns = owned.find((o) => o.typeId === gameTypeId) || owned.sort((a, b) => b.count - a.count)[0]
  if (gameTypeId && types[gameTypeId]?.length >= MIN_GAMES) {
    const w = winCounts(types[gameTypeId])
    const vals = Object.values(w)
    if (vals.length > 1 && vals.every((v) => v === vals[0])) facts.evenType = { typeName: types[gameTypeId][0].game_type_name }
  }

  // Weekdays: one player has won every game played on a weekday (3+ games)
  const days = {}
  for (const g of games) {
    const wd = weekdayOf(g.ended_at)
    if (wd) (days[wd] ||= []).push(g)
  }
  const sweeps = Object.entries(days)
    .filter(([, list]) => list.length >= MIN_GAMES && new Set(list.map((g) => g.winner_id)).size === 1)
    .map(([weekday, list]) => ({ weekday, playerId: list[0].winner_id, count: list.length }))
  if (sweeps.length) facts.weekday = sweeps.sort((a, b) => b.count - a.count)[0]

  // Rematches: win rate in the game right after that player lost (3+ such games)
  const rematch = []
  for (const p of players) {
    let n = 0
    let won = 0
    for (let i = 1; i < games.length; i++) {
      if (games[i - 1].winner_id !== p.id) {
        n += 1
        if (games[i].winner_id === p.id) won += 1
      }
    }
    if (n >= MIN_GAMES) rematch.push({ playerId: p.id, pct: Math.round((won / n) * 100), n })
  }
  const strong = rematch.filter((r) => r.pct >= 60 && r.n >= MIN_GAMES).sort((a, b) => b.pct - a.pct)
  if (strong.length) facts.rematch = strong[0]

  // Skunks received, across game types (cribbage only today)
  let skunked = null
  for (const p of players) {
    const byType = roundStats[p.id] || {}
    const total = Object.values(byType).reduce((s, t) => s + (Number(t?.skunks?.skunks_received) || 0), 0)
    if (total > 0 && (!skunked || total > skunked.count)) skunked = { playerId: p.id, count: total }
  }
  if (skunked) facts.skunked = skunked

  // Milestone: the next game is a round number
  if (facts.nextGame % 5 === 0) facts.milestone = facts.nextGame

  return facts
}
