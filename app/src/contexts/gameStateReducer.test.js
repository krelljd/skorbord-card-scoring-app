import { describe, it, expect } from 'vitest'
import { gameStateReducer } from './GameStateContext.jsx'

const baseState = {
  game: { id: 'g1', dealer_id: 'p1', finalized: false },
  gameStats: [{ player_id: 'p1', score: 1 }],
  scoreTallies: { p1: { total: 5, timestamp: 123 } },
  glowingCards: new Set(['p2']),
  winner: null,
  dealer: 'p1',
  loading: false,
  error: null,
  isReorderMode: false,
  sqid: 'abcd'
}

describe('GAME_STATS_SYNCED', () => {
  it('replaces only gameStats and leaves everything else intact', () => {
    const newStats = [{ player_id: 'p1', score: 9 }, { player_id: 'p2', score: 3 }]
    const next = gameStateReducer(baseState, {
      type: 'GAME_STATS_SYNCED',
      payload: { stats: newStats }
    })

    expect(next.gameStats).toEqual(newStats)
    expect(next.game).toBe(baseState.game)
    expect(next.dealer).toBe('p1')
    expect(next.scoreTallies).toBe(baseState.scoreTallies)
    expect(next.glowingCards).toBe(baseState.glowingCards)
  })
})

describe('GAME_LOADED', () => {
  it('resets winner, scoreTallies, and glowingCards even when prior state had values', () => {
    const priorState = {
      ...baseState,
      winner: { player_id: 'p1', score: 11 }
    }
    const newGame = { id: 'g2', dealer_id: 'p2', finalized: false }
    const newStats = [{ player_id: 'p2', score: 0 }]

    const next = gameStateReducer(priorState, {
      type: 'GAME_LOADED',
      payload: { game: newGame, stats: newStats }
    })

    expect(next.winner).toBeNull()
    expect(next.scoreTallies).toEqual({})
    expect(next.glowingCards).toEqual(new Set())
    expect(next.game).toBe(newGame)
    expect(next.gameStats).toBe(newStats)
    expect(next.dealer).toBe('p2')
  })
})

describe('round state', () => {
  const roundState = {
    game: { id: 'g1', dealer_id: 'p2', finalized: false, winner_id: null },
    players: [
      { player_id: 'p1', committed_total: 10, draft: 3 },
      { player_id: 'p2', committed_total: 4, draft: 0 }
    ],
    rounds: [],
    open_round: 2
  }

  it('ROUND_STATE_SET shows committed plus draft and takes dealer and winner from the server', () => {
    const next = gameStateReducer(baseState, { type: 'ROUND_STATE_SET', payload: { roundState } })
    expect(next.gameStats[0].score).toBe(13)
    expect(next.game.dealer_id).toBe('p2')
    expect(next.winner).toBeNull()

    const won = gameStateReducer(next, {
      type: 'ROUND_STATE_SET',
      payload: { roundState: { ...roundState, game: { ...roundState.game, winner_id: 'p1' } } }
    })
    expect(won.winner).toEqual({ player_id: 'p1' })
  })

  it('DRAFT_ADJUSTED moves the draft and the total together', () => {
    const set = gameStateReducer(baseState, { type: 'ROUND_STATE_SET', payload: { roundState } })
    const next = gameStateReducer(set, { type: 'DRAFT_ADJUSTED', payload: { playerId: 'p1', change: -2 } })
    expect(next.roundState.players[0].draft).toBe(1)
    expect(next.gameStats[0].score).toBe(11)
  })
})
