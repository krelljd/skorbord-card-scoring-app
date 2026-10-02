import { describe, it, expect } from 'vitest'
import { isPossibleCountScore, isValidPartValue, recapLine, noHandPoints } from './cribbage.js'

describe('cribbage helpers', () => {
  it('knows which hand and crib scores cannot happen', () => {
    for (const v of [19, 25, 26, 27, 30, -1]) expect(isPossibleCountScore(v)).toBe(false)
    for (const v of [0, 1, 18, 20, 24, 28, 29]) expect(isPossibleCountScore(v)).toBe(true)
  })

  it('play only has to be non-negative', () => {
    expect(isValidPartValue('play', 40)).toBe(true)
    expect(isValidPartValue('play', -1)).toBe(false)
    expect(isValidPartValue('hand', 19)).toBe(false)
  })

  it('recaps the open round, leaving out players with nothing', () => {
    const players = [
      { player_name: 'Sam', draft: 14, draft_parts: { play: 6, hand: 8, crib: 0 } },
      { player_name: 'Alex', draft: 4, draft_parts: { play: 4, hand: 0, crib: 0 } },
      { player_name: 'Cy', draft: 0, draft_parts: null }
    ]
    expect(recapLine(players, 4)).toBe('Round 4: Sam 6 + 8 = 14, Alex 4')
    expect(recapLine([players[2]], 5)).toBe('Round 5: nothing scored yet')
  })

  it('spots a round with no hand points', () => {
    expect(noHandPoints([{ draft_parts: { play: 2, hand: 0, crib: 0 } }, { draft_parts: null }])).toBe(true)
    expect(noHandPoints([{ draft_parts: { play: 0, hand: 12, crib: 0 } }])).toBe(false)
  })
})
