import { describe, it, expect } from 'vitest'
import { rankPlayers, headToHeadLabel, rankLabel, winPct, marginText, formLetters, formSummary, scoreLine, ordinal } from './statsView.js'

describe('stats view helpers', () => {
  it('ranks by wins and lets ties share a rank', () => {
    const { order, rankById } = rankPlayers([
      { id: 'a', wins: 5 }, { id: 'b', wins: 9 }, { id: 'c', wins: 5 }
    ])
    expect(order.map((r) => r.id)).toEqual(['b', 'a', 'c'])
    expect(rankById).toEqual({ b: 1, a: 2, c: 2 })
  })

  it('labels the head-to-head', () => {
    expect(headToHeadLabel(13, 8)).toBe('Leads 13–8')
    expect(headToHeadLabel(8, 13)).toBe('')
    expect(headToHeadLabel(4, 4)).toBe('Tied 4–4')
    expect(rankLabel(2, 7)).toBe('2nd · 7 wins')
    expect(rankLabel(1, 1)).toBe('1st · 1 win')
    expect(ordinal(4)).toBe('4th')
  })

  it('formats win rate and margins', () => {
    expect(winPct(13, 21)).toBe('62%')
    expect(winPct(0, 0)).toBe('–')
    expect(marginText(31, 3, '+')).toBe('+31')
    expect(marginText(24, 2, '-')).toBe('−24')
    expect(marginText(0, 0, '+')).toBe('–')
    expect(marginText(null, 5, '+')).toBe('–')
  })

  it('keeps the last ten results', () => {
    expect(formLetters('WLWWLWLWWLWW')).toHaveLength(10)
    expect(formLetters('WLW').join('')).toBe('WLW')
    expect(formLetters(null)).toEqual([])
    expect(formSummary(['W', 'W', 'L', 'T'])).toBe('Last 4: 2 won, 1 lost, 1 tied')
  })

  it('puts the winner first in the score line', () => {
    const scores = [
      { player_id: 'a', score: 88 }, { player_id: 'b', score: 121 }, { player_id: 'c', score: 109 }
    ]
    expect(scoreLine(scores, 'b')).toBe('121 – 109 – 88')
    const golf = [{ player_id: 'a', score: 61 }, { player_id: 'b', score: 42 }, { player_id: 'c', score: 57 }]
    expect(scoreLine(golf, 'b', false)).toBe('42 – 57 – 61')
  })
})
