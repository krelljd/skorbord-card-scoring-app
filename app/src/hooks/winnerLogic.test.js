import { describe, it, expect } from 'vitest'
import { computeWinner } from './winnerLogic.js'

describe('computeWinner', () => {
  it('returns null when there is no game', () => {
    expect(computeWinner(null, [])).toBeNull()
  })

  it('returns null when the game is already finalized', () => {
    const game = { finalized: true, win_condition_type: 'win', win_condition_value: 10 }
    const stats = [{ player_id: 'p1', score: 12 }]
    expect(computeWinner(game, stats)).toBeNull()
  })

  it('returns the highest scorer at or above the win threshold for "win" games', () => {
    const game = { finalized: false, win_condition_type: 'win', win_condition_value: 10 }
    const stats = [
      { player_id: 'p1', score: 8 },
      { player_id: 'p2', score: 11 },
      { player_id: 'p3', score: 10 }
    ]
    expect(computeWinner(game, stats)).toEqual({ player_id: 'p2', score: 11 })
  })

  it('returns null for "win" games when no one has reached the threshold', () => {
    const game = { finalized: false, win_condition_type: 'win', win_condition_value: 10 }
    const stats = [{ player_id: 'p1', score: 5 }]
    expect(computeWinner(game, stats)).toBeNull()
  })

  it('returns the lowest positive scorer once someone hits the lose threshold for "lose" games', () => {
    const game = { finalized: false, win_condition_type: 'lose', win_condition_value: 100 }
    const stats = [
      { player_id: 'p1', score: 100 },
      { player_id: 'p2', score: 40 },
      { player_id: 'p3', score: 60 }
    ]
    expect(computeWinner(game, stats)).toEqual({ player_id: 'p2', score: 40 })
  })

  it('returns null for "lose" games when no one has reached the loss threshold', () => {
    const game = { finalized: false, win_condition_type: 'lose', win_condition_value: 100 }
    const stats = [{ player_id: 'p1', score: 40 }]
    expect(computeWinner(game, stats)).toBeNull()
  })

  it('detects a winner already past the win condition on load (the bug this fixes)', () => {
    const game = { finalized: false, win_condition_type: 'win', win_condition_value: 10 }
    const stats = [{ player_id: 'p1', score: 15 }]
    expect(computeWinner(game, stats)).toEqual({ player_id: 'p1', score: 15 })
  })
})
