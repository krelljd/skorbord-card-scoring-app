// Picks the most conversation-worthy facts about a rivalry, for the Game Over strip and the pregame banner.
// Pure: it only reads what the other stats already compute (the series timeline).
// Facts about the game itself (comeback, swing round) are already chips on Game Over, so they are not repeated here.
import { currentStreak } from './seriesStats.js'

export const MIN_GAMES = 3 // no series fact until this many finished games are behind it
const STREAK_MIN = 3
const TYPE_MIN = 3 // games of one type before "won every" or "last 5" is worth saying

/** { playerId: wins } over a timeline. */
function winCounts(timeline) {
  const wins = {}
  for (const g of timeline) wins[g.winner_id] = (wins[g.winner_id] || 0) + 1
  return wins
}

/** Players tied for the most wins, with that count. Empty when nobody has a win. */
function leadersOf(wins) {
  const top = Math.max(0, ...Object.values(wins))
  return { top, ids: top ? Object.keys(wins).filter((id) => wins[id] === top) : [] }
}

const winsText = (n) => `${n} win${n === 1 ? '' : 's'}`
const list = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/**
 * @param {object} args
 * @param {'gameover'|'pregame'} args.context
 * @param {Array<{id, name}>} args.players - the rivalry's players
 * @param {Array} [args.timeline] - the rivalry's finished games, oldest first (including the one just played at Game Over)
 * @param {string|null} [args.gameTypeId] - the game type of this game, or the one picked in setup
 * @param {number} [args.max]
 * @returns {Array<{ id: string, text: string }>} best first
 */
export function talkingPoints({ context, players = [], timeline = [], gameTypeId = null, max = 3 }) {
  const name = Object.fromEntries(players.map((p) => [p.id, p.name]))
  const games = timeline.filter((g) => name[g.winner_id])
  const enough = games.length >= MIN_GAMES
  const facts = []
  const add = (id, text) => facts.push({ id, text })

  const ofType = gameTypeId ? games.filter((g) => g.game_type_id === gameTypeId) : []
  const typeName = ofType[0]?.game_type_name

  const streak = currentStreak(games)
  const streakFact = () => {
    if (enough && streak.length >= STREAK_MIN) {
      add('streak', context === 'pregame'
        ? `${name[streak.playerId]} is on a ${streak.length}-game streak.`
        : `${name[streak.playerId]} has won the last ${streak.length} games in a row.`)
    }
  }

  const seriesFact = () => {
    if (!enough) return
    const now = leadersOf(winCounts(games))
    if (!now.ids.length) return
    const tiedNow = now.ids.length > 1
    if (context === 'pregame') {
      add('series', tiedNow
        ? `${list(now.ids.map((id) => name[id]))} ${now.ids.length > 2 ? 'are all' : 'are'} tied for the series lead on ${winsText(now.top)}.`
        : `${name[now.ids[0]]} leads the series with ${winsText(now.top)}.`)
      return
    }
    // After a game: say so when this game tied the top spot, or put someone in front
    const before = leadersOf(winCounts(games.slice(0, -1)))
    const sameTop = before.ids.length === now.ids.length && before.ids.every((id) => now.ids.includes(id))
    if (sameTop) return
    add('series', tiedNow
      ? `${list(now.ids.map((id) => name[id]))} are now tied for the series lead on ${winsText(now.top)}.`
      : `${name[now.ids[0]]} takes the series lead with ${winsText(now.top)}.`)
  }

  const endedStreakFact = () => {
    if (!enough) return
    const prev = currentStreak(games.slice(0, -1))
    if (prev.length >= STREAK_MIN && prev.playerId !== games[games.length - 1].winner_id) {
      add('streak-ended', `${name[prev.playerId]}'s ${prev.length}-game winning streak is over.`)
    }
  }

  const ownsTypeFact = () => {
    if (ofType.length < TYPE_MIN || !typeName) return
    const wins = winCounts(ofType)
    const ids = Object.keys(wins)
    if (ids.length === 1) add('owns-type', `${name[ids[0]]} has won every ${typeName} game, ${ofType.length}–0.`)
  }

  if (context === 'gameover') {
    endedStreakFact()
    streakFact()
    seriesFact()
    ownsTypeFact()
  } else {
    streakFact()
    seriesFact()
    // The last few games of this type
    if (ofType.length >= TYPE_MIN && typeName) {
      const recent = ofType.slice(-5)
      const wins = winCounts(recent)
      const top = leadersOf(wins)
      if (top.ids.length === 1 && top.top >= 3) add('recent-type', `${name[top.ids[0]]} has won ${top.top} of the last ${recent.length} ${typeName} games.`)
    }
    ownsTypeFact()
  }
  return facts.slice(0, max)
}
