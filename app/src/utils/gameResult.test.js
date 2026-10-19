import { describe, it, expect } from 'vitest'
import { gameResult, skunkLabel, seriesLine, rematchDealer } from './gameResult.js'

const players = [
  { player_id: 'a', player_name: 'Jason', score: 121 },
  { player_id: 'b', player_name: 'Sam', score: 108 }
]

describe('gameResult', () => {
  it('finds the winner, index and margin', () => {
    const r = gameResult(players, 'a')
    expect(r.winnerIndex).toBe(0)
    expect(r.margin).toBe(13)
    expect(r.ranked.map((p) => p.player_id)).toEqual(['a', 'b'])
  })
  it('returns null without a winner', () => expect(gameResult(players, 'x')).toBeNull())
  it('uses the closest other player for the margin in 3 player games', () => {
    const r = gameResult([...players, { player_id: 'c', player_name: 'Cy', score: 50 }], 'a')
    expect(r.margin).toBe(13)
  })
})

describe('skunkLabel', () => {
  it('flags a skunk and a double skunk', () => {
    expect(skunkLabel([{ player_id: 'a', player_name: 'A', score: 121 }, { player_id: 'b', player_name: 'B', score: 80 }], 'a')).toMatch(/^Skunk! B/)
    expect(skunkLabel([{ player_id: 'a', player_name: 'A', score: 121 }, { player_id: 'b', player_name: 'B', score: 59 }], 'a')).toMatch(/^Double skunk! B/)
  })
  it('is null for a close game or when the target was not reached', () => {
    expect(skunkLabel(players, 'a')).toBeNull()
    expect(skunkLabel([{ player_id: 'a', player_name: 'A', score: 100 }, { player_id: 'b', player_name: 'B', score: 20 }], 'a')).toBeNull()
  })
})

describe('seriesLine', () => {
  it('shows the leader first', () => {
    expect(seriesLine([{ name: 'Sam', wins: 11 }, { name: 'Jason', wins: 15 }])).toEqual({ score: '15 – 11', status: 'Jason leads' })
  })
  it('reports a tie', () => expect(seriesLine([{ name: 'A', wins: 2 }, { name: 'B', wins: 2 }]).status).toBe('Series tied'))
  it('is null without two players', () => expect(seriesLine([{ name: 'A', wins: 1 }])).toBeNull())
})

describe('rematchDealer', () => {
  it('alternates from the last first dealer', () => {
    expect(rematchDealer(['a', 'b'], 'a')).toBe('b')
    expect(rematchDealer(['a', 'b'], 'b')).toBe('a')
    expect(rematchDealer(['a', 'b', 'c'], 'c')).toBe('a')
  })
  it('starts with the first player when the last dealer is unknown', () => expect(rematchDealer(['a', 'b'], null)).toBe('a'))
})
