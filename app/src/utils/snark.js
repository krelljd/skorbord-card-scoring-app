// The snark lines. Every line is triggered by a true fact from the rivalry's history, and teases results,
// not people. Off shows nothing, Mild shows Mild lines, Spicy mixes Spicy and Mild.
// A line returns null when its fact isn't there, so nothing shows below 3 games.

export const SNARK_LEVELS = ['off', 'mild', 'spicy']
export const DEFAULT_SNARK = 'spicy'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * "context" says where a line may show: 'pregame' (New game), 'history' (Rivalry stats).
 * The line functions get the facts, a name lookup, and `others(id)`: the other player's name, or "the others".
 */
const LINES = [
  // Streaks
  { id: 'streak-1', tone: 'mild', fn: (f, { name, others }) => f.streak && `${name(f.streak.playerId)} has won ${f.streak.length} in a row. ${others(f.streak.playerId)} might want a new strategy.` },
  { id: 'streak-2', tone: 'mild', fn: (f, { name }) => f.streak && `${f.streak.length} straight for ${name(f.streak.playerId)}. The deck must be on their side.` },
  { id: 'streak-3', tone: 'spicy', fn: (f, { name, others }) => f.streak && `${others(f.streak.playerId)} hasn't won in ${f.streak.length} games. Is the deck marked, or is it just you?` },
  { id: 'streak-4', tone: 'spicy', fn: (f, { name, others }) => f.streak && `${name(f.streak.playerId)} is on a ${f.streak.length}-game streak. ${others(f.streak.playerId)} is on a ${f.streak.length}-game excuse.` },

  // Drought
  { id: 'drought-1', tone: 'mild', fn: (f, { name }) => f.drought?.date && `${name(f.drought.playerId)} hasn't won since ${f.drought.date}.` },
  { id: 'drought-2', tone: 'mild', fn: (f, { name }) => f.drought && f.drought.days >= 1 && `It's been ${plural(f.drought.days, 'day')} since ${name(f.drought.playerId)}'s last win. Time flies.` },
  { id: 'drought-3', tone: 'spicy', fn: (f, { name }) => f.drought && f.drought.days >= 3 && `${plural(f.drought.days, 'day')} without a win. ${name(f.drought.playerId)} has been very consistent.` },

  // Series tied
  { id: 'tied-1', tone: 'mild', fn: (f) => f.tied && `Dead even at ${f.top} each. Somebody has to blink.` },
  { id: 'tied-2', tone: 'mild', fn: (f) => f.tied && 'Tied up. This one is for the bragging rights.' },
  { id: 'tied-3', tone: 'spicy', fn: (f) => f.tied && 'Tied. Neither of you is as good as you say.' },

  // Lead changed hands
  { id: 'lead-1', tone: 'mild', fn: (f, { name }) => f.leadChange && `${name(f.leadChange.newId)} takes the series lead. ${name(f.leadChange.oldId)} will want that back.` },
  { id: 'lead-2', tone: 'spicy', fn: (f, { name }) => f.leadChange && `${name(f.leadChange.oldId)} just lost the series lead. Enjoy the view, ${name(f.leadChange.newId)}. It won't last.` },

  // Blowouts and close games
  { id: 'blowout-1', tone: 'mild', fn: (f, { name }) => f.blowout && `Biggest margin ever: ${name(f.blowout.winnerId)} by ${f.blowout.margin}. Everyone else remembers.` },
  { id: 'blowout-2', tone: 'spicy', fn: (f, { name }) => f.blowout && `${name(f.blowout.winnerId)} once won by ${f.blowout.margin}. Nobody has brought it up, bravely.` },
  { id: 'closest-1', tone: 'mild', fn: (f) => f.closest && `Closest game ever: ${plural(f.closest.margin, 'point')}. That one hurt.` },
  { id: 'closest-2', tone: 'spicy', fn: (f) => f.closest && `Someone once lost by ${plural(f.closest.margin, 'point')}. Think about that.` },

  // Close-game record
  { id: 'close-1', tone: 'mild', fn: (f, { name }) => f.closeRecord && `In games decided by ${plural(5, 'point')} or fewer, ${name(f.closeRecord.playerId)} is ${f.closeRecord.wins}–${f.closeRecord.losses}. Cool under pressure.` },
  { id: 'close-2', tone: 'spicy', fn: (f, { name }) => f.closeRecord && f.closeRecord.losses > 0 && `${name(f.closeRecord.playerId)} wins the tight ones, ${f.closeRecord.wins}–${f.closeRecord.losses}. Choking is a skill too.` },

  // Rematches
  { id: 'rematch-1', tone: 'mild', fn: (f, { name }) => f.rematch && `${name(f.rematch.playerId)} wins ${f.rematch.pct}% of rematches. Revenge is a thing.` },
  { id: 'rematch-2', tone: 'spicy', fn: (f, { name }) => f.rematch && `After a loss, ${name(f.rematch.playerId)} wins ${f.rematch.pct}% of the time. Anger really does help.` },

  // Game-type ownership
  { id: 'owns-1', tone: 'mild', fn: (f, { name, others }) => f.owns && `${name(f.owns.playerId)} owns ${f.owns.typeName}. ${others(f.owns.playerId)} should try a different game.` },
  { id: 'owns-2', tone: 'spicy', fn: (f, { name, others }) => f.owns && `${name(f.owns.playerId)} is ${f.owns.count}–0 at ${f.owns.typeName}. ${others(f.owns.playerId)}, it's okay to stop.` },
  { id: 'owns-3', tone: 'mild', ctx: ['pregame'], fn: (f) => f.evenType && `${f.evenType.typeName} is dead even. This one decides it.` },

  // Weekdays
  { id: 'weekday-1', tone: 'mild', fn: (f, { name }) => f.weekday && `${name(f.weekday.playerId)} has never lost on a ${f.weekday.weekday}.` },
  { id: 'weekday-2', tone: 'spicy', fn: (f, { name }) => f.weekday && `${name(f.weekday.playerId)} is ${f.weekday.count}–0 on ${f.weekday.weekday}s. Schedule accordingly.` },

  // Skunks
  { id: 'skunk-1', tone: 'mild', fn: (f, { name }) => f.skunked && `${name(f.skunked.playerId)} has been skunked ${plural(f.skunked.count, 'time')}. It builds character.` },
  { id: 'skunk-2', tone: 'spicy', fn: (f, { name }) => f.skunked && `${name(f.skunked.playerId)} has been skunked ${plural(f.skunked.count, 'time')}. The smell lingers.` },

  // Rounds (new games only)
  { id: 'comeback-1', tone: 'mild', fn: (f, { name }) => f.comebackRecord && `${name(f.comebackRecord.playerId)} once came back from ${f.comebackRecord.points} down. Never count them out.` },
  { id: 'blown-1', tone: 'spicy', fn: (f, { name }) => f.blownLead && `${name(f.blownLead.playerId)} has blown a ${f.blownLead.points}-point lead. It's a gift, really.` },
  { id: 'wild-1', tone: 'mild', fn: (f) => f.wildGame && `The wildest game had ${f.wildGame.changes} lead changes. Nobody could hold it.` },
  { id: 'longest-1', tone: 'mild', fn: (f) => f.longestGame && `The longest game ran ${f.longestGame.rounds} rounds. Nobody wanted to quit.` },
  { id: 'shortest-1', tone: 'mild', fn: (f) => f.shortestGame && `The shortest game took ${f.shortestGame.rounds} rounds. Somebody was in a hurry.` },
  { id: 'dealer-1', tone: 'mild', ctx: ['pregame'], fn: (f) => f.firstDealer && `The first dealer wins ${f.firstDealer.pct}% of the time. Choose wisely.` },
  { id: 'dealer-2', tone: 'spicy', ctx: ['pregame'], fn: (f, { name }) => f.dealerWinner && `${name(f.dealerWinner.playerId)} wins ${f.dealerWinner.pct}% as first dealer and acts like it's skill.` },

  // Milestones
  { id: 'milestone-1', tone: 'mild', fn: (f) => f.milestone && `Game ${f.milestone} is coming up. A round number deserves a good fight.` },
  { id: 'milestone-2', tone: 'mild', fn: (f) => f.count >= 5 && `Game ${f.nextGame} together. You two should get a room.` },

  // More Spicy lines (Nov 2026)
  { id: 'streak-5', tone: 'spicy', fn: (f, { name }) => f.streak && `${f.streak.length} straight for ${name(f.streak.playerId)}. Somebody should check the shuffle.` },
  { id: 'streak-6', tone: 'spicy', fn: (f, { name }) => f.streak && `${name(f.streak.playerId)} has won ${f.streak.length} in a row. Competition is a strong word for this.` },
  { id: 'streak-7', tone: 'spicy', fn: (f, { name }) => f.streak && `${name(f.streak.playerId)}'s ${f.streak.length}-game streak is less a hot streak and more a lifestyle.` },
  { id: 'streak-8', tone: 'spicy', fn: (f, { name }) => f.streak && `${f.streak.length} in a row for ${name(f.streak.playerId)}. The rest of you are a warm-up act.` },
  { id: 'drought-4', tone: 'spicy', fn: (f, { name }) => f.drought && `${name(f.drought.playerId)} hasn't won in ${f.drought.games} games. Hope is free, at least.` },
  { id: 'drought-5', tone: 'spicy', fn: (f, { name }) => f.drought && f.drought.days >= 1 && `${plural(f.drought.days, 'day')} since ${name(f.drought.playerId)} last won. Archaeologists are interested.` },
  { id: 'drought-6', tone: 'spicy', fn: (f, { name }) => f.drought?.date && `${name(f.drought.playerId)} last won on ${f.drought.date}. The memory is fading.` },
  { id: 'drought-7', tone: 'spicy', fn: (f, { name }) => f.drought && `${plural(f.drought.games, 'game')} without a win for ${name(f.drought.playerId)}. Playing for exposure?` },
  { id: 'tied-4', tone: 'spicy', fn: (f) => f.tied && `Tied at ${f.top} each. Nobody has earned the right to trash talk.` },
  { id: 'tied-5', tone: 'spicy', fn: (f) => f.tied && `Level at ${f.top}. Everyone is equally mediocre. Together.` },
  { id: 'lead-3', tone: 'spicy', fn: (f, { name }) => f.leadChange && `${name(f.leadChange.newId)} leads the series and ${name(f.leadChange.oldId)} has a fresh excuse. Both are accurate.` },
  { id: 'lead-4', tone: 'spicy', fn: (f, { name }) => f.leadChange && `${name(f.leadChange.oldId)} held the series lead right up until it mattered.` },
  { id: 'blowout-3', tone: 'spicy', fn: (f, { name }) => f.blowout && `${name(f.blowout.winnerId)} once won by ${f.blowout.margin} at ${f.blowout.typeName}. That wasn't a game. That was a hostage situation.` },
  { id: 'blowout-4', tone: 'spicy', fn: (f) => f.blowout && `The record margin is ${f.blowout.margin} points. Somebody still has the bruise.` },
  { id: 'closest-3', tone: 'spicy', fn: (f) => f.closest && `The closest game ended ${plural(f.closest.margin, 'point')} apart. Everyone still insists they were robbed.` },
  { id: 'closest-4', tone: 'spicy', fn: (f) => f.closest && `A ${f.closest.margin}-point finish, and somebody still lost. Cold.` },
  { id: 'close-3', tone: 'spicy', fn: (f, { name }) => f.closeRecord && `${name(f.closeRecord.playerId)} is ${f.closeRecord.wins}–${f.closeRecord.losses} in games decided by 5 or fewer. Ice in the veins, or luck. Pick one.` },
  { id: 'close-4', tone: 'spicy', fn: (f, { name }) => f.closeRecord && `${name(f.closeRecord.playerId)} is ${f.closeRecord.wins}–${f.closeRecord.losses} when it's tight. The rest of you fold when it counts.` },
  { id: 'rematch-3', tone: 'spicy', fn: (f, { name }) => f.rematch && `${name(f.rematch.playerId)} wins ${f.rematch.pct}% of rematches. Losing is the only thing that motivates them.` },
  { id: 'rematch-4', tone: 'spicy', fn: (f, { name }) => f.rematch && `Beat ${name(f.rematch.playerId)} and you'll regret it. ${f.rematch.pct}% of rematches go their way.` },
  { id: 'owns-4', tone: 'spicy', fn: (f, { name }) => f.owns && `${name(f.owns.playerId)} is ${f.owns.count}–0 at ${f.owns.typeName}. At this point it's a donation.` },
  { id: 'owns-5', tone: 'spicy', fn: (f, { name }) => f.owns && `${f.owns.typeName} belongs to ${name(f.owns.playerId)}. Everyone else is just visiting.` },
  { id: 'weekday-3', tone: 'spicy', fn: (f, { name }) => f.weekday && `${name(f.weekday.playerId)} is ${f.weekday.count}–0 on ${f.weekday.weekday}s. The rest of you should call in sick.` },
  { id: 'weekday-4', tone: 'spicy', fn: (f, { name }) => f.weekday && `Never play ${name(f.weekday.playerId)} on a ${f.weekday.weekday}. The record says so.` },
  { id: 'skunk-3', tone: 'spicy', fn: (f, { name }) => f.skunked && `${name(f.skunked.playerId)} has been skunked ${plural(f.skunked.count, 'time')}. Have you considered a different hobby?` },
  { id: 'skunk-4', tone: 'spicy', fn: (f, { name }) => f.skunked && `${plural(f.skunked.count, 'skunk')} for ${name(f.skunked.playerId)}. That's not luck, it's a pattern.` },
  { id: 'blown-2', tone: 'spicy', fn: (f, { name }) => f.blownLead && `${name(f.blownLead.playerId)} blew a ${f.blownLead.points}-point lead. That takes real talent.` },
  { id: 'comeback-2', tone: 'spicy', fn: (f, { name }) => f.comebackRecord && `${name(f.comebackRecord.playerId)} once climbed back from ${f.comebackRecord.points} down. Nobody here is safe.` },
  { id: 'wild-2', tone: 'spicy', fn: (f) => f.wildGame && `${f.wildGame.changes} lead changes in one game. Nobody here knows how to close.` },
  { id: 'longest-2', tone: 'spicy', fn: (f) => f.longestGame && `One game ran ${f.longestGame.rounds} rounds. You all refused to lose properly.` },
  { id: 'shortest-2', tone: 'spicy', fn: (f) => f.shortestGame && `The shortest game took ${f.shortestGame.rounds} rounds. That wasn't a rivalry, it was an ambush.` },
  { id: 'dealer-3', tone: 'spicy', ctx: ['pregame'], fn: (f, { name }) => f.dealerWinner && `${name(f.dealerWinner.playerId)} wins ${f.dealerWinner.pct}% when dealing first. Coincidence is wearing thin.` },
  { id: 'dealer-4', tone: 'spicy', ctx: ['pregame'], fn: (f) => f.firstDealer && `The first dealer wins ${f.firstDealer.pct}% of the time. Fight for the shuffle.` },
  { id: 'milestone-3', tone: 'spicy', fn: (f) => f.milestone && `Game ${f.milestone} is next. Time to find out who's carrying whom.` },
  { id: 'milestone-4', tone: 'spicy', fn: (f) => f.count >= 5 && `Game ${f.nextGame} together. At this point it's less a rivalry and more a habit.` },
  { id: 'milestone-5', tone: 'spicy', fn: (f) => f.count >= 5 && `${f.count} games in and nobody has learned a thing.` }
]

/** The three first-game lines on the Stats empty state. They need no history. */
export const EMPTY_LINES = [
  'No games yet. Both of you are undefeated.',
  'First game together. Everything you say before it ends is a promise.',
  'No history, so no excuses. Yet.'
]

/** Winner-only lines on Game Over. They never name the loser. Mild, shown unless snark is Off. */
const WINNER_LINES = [
  { id: 'win-1', fn: ({ winner }) => `${winner} takes it. Put it on the fridge.` },
  { id: 'win-2', fn: ({ winner }) => `${winner} wins. Gloating is allowed for ten minutes.` },
  { id: 'win-3', fn: ({ winner, wins }) => wins >= 3 && `That's ${wins} for ${winner}. The series is getting lopsided.` },
  { id: 'win-4', fn: ({ winner }) => `${winner} wins. The deck had nothing to do with it.` }
]

/** Which lines are in play for a setting: Off none, Mild mild only, Spicy both. */
const allowed = (level, tone) => level === 'spicy' || (level === 'mild' && tone === 'mild')

const pickRandom = (list, lastId, rand) => {
  const fresh = list.length > 1 ? list.filter((l) => l.id !== lastId) : list
  return fresh[Math.min(fresh.length - 1, Math.floor(rand() * fresh.length))]
}

/**
 * One random applicable line.
 * @param {object} args
 * @param {'off'|'mild'|'spicy'} args.level
 * @param {'pregame'|'history'} args.context
 * @param {object|null} args.facts - from rivalryFacts()
 * @param {Array<{id, name}>} args.players
 * @param {string|null} [args.lastId] - the line shown just before, never repeated back to back
 * @param {() => number} [args.rand]
 * @returns {{ id: string, text: string }|null}
 */
export function pickLine({ level, context, facts, players = [], lastId = null, rand = Math.random }) {
  if (!facts || !allowed(level, 'mild')) return null
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]))
  const helpers = {
    name: (id) => names[id] || 'Someone',
    others: (id) => {
      const rest = players.filter((p) => p.id !== id)
      return rest.length === 1 ? rest[0].name : 'the others'
    }
  }
  const options = []
  for (const line of LINES) {
    if (!allowed(level, line.tone)) continue
    if (line.ctx && !line.ctx.includes(context)) continue
    const text = line.fn(facts, helpers)
    if (text) options.push({ id: line.id, text })
  }
  return options.length ? pickRandom(options, lastId, rand) : null
}

/** One of the first-game lines. Off shows nothing. */
export function pickEmptyLine({ level, lastId = null, rand = Math.random }) {
  if (!allowed(level, 'mild')) return null
  const options = EMPTY_LINES.map((text, i) => ({ id: `empty-${i}`, text }))
  return pickRandom(options, lastId, rand)
}

/**
 * Game Over: a line for the winner only, never naming a loser. Mild whatever the setting, hidden when Off.
 * @param {object} args
 * @param {'off'|'mild'|'spicy'} args.level
 * @param {string} args.winner - the winner's name
 * @param {number} [args.wins] - the winner's wins in the series, including this game
 */
export function pickWinnerLine({ level, winner, wins = 0, lastId = null, rand = Math.random }) {
  if (!allowed(level, 'mild') || !winner) return null
  const options = WINNER_LINES
    .map((l) => ({ id: l.id, text: l.fn({ winner, wins }) }))
    .filter((l) => l.text)
  return pickRandom(options, lastId, rand)
}
