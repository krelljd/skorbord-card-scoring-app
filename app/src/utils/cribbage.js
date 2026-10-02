/**
 * Cribbage scoring facts shared by the part sheet and history.
 * A hand or crib scores 0 to 29, but never 19, 25, 26 or 27.
 */

const IMPOSSIBLE = new Set([19, 25, 26, 27])

export const PARTS = ['play', 'hand', 'crib']

export const PART_LABELS = { play: 'Play', hand: 'Hand', crib: 'Crib' }

/** Quick pegging buttons: go or last card, 15 or 31 or pair, run of 3, run of 4, three of a kind. */
export const PEG_BUTTONS = [1, 2, 3, 4, 6]

/** Play points above this in one round get a warning (not a block). */
export const PLAY_WARNING = 61

export function isPossibleCountScore(value) {
  return Number.isInteger(value) && value >= 0 && value <= 29 && !IMPOSSIBLE.has(value)
}

/** Scores the number pad should refuse for a part. */
export function isValidPartValue(part, value) {
  if (part === 'hand' || part === 'crib') return isPossibleCountScore(value)
  return Number.isInteger(value) && value >= 0
}

export const zeroParts = () => ({ play: 0, hand: 0, crib: 0 })

/** One-line recap of the open round: "Sam 6 + 8 = 14". Names with no points are left out. */
export function recapLine(players, roundNumber) {
  const bits = []
  for (const p of players) {
    const parts = p.draft_parts ?? { play: p.draft, hand: 0, crib: 0 }
    const nonZero = PARTS.filter((k) => parts[k] > 0)
    if (nonZero.length === 0) continue
    const sum = nonZero.map((k) => parts[k]).join(' + ')
    bits.push(nonZero.length > 1 ? `${p.player_name} ${sum} = ${p.draft}` : `${p.player_name} ${p.draft}`)
  }
  return bits.length ? `Round ${roundNumber}: ${bits.join(', ')}` : `Round ${roundNumber}: nothing scored yet`
}

/** True when nobody has any hand points in the open round. */
export function noHandPoints(players) {
  return players.every((p) => !(p.draft_parts?.hand > 0))
}
