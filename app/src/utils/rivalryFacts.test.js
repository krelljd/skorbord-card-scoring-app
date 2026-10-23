import { describe, it, expect } from 'vitest'
import { rivalryFacts, shortDate } from './rivalryFacts.js'

const players = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Jess' }]
const day = (n) => new Date(Date.UTC(2026, 8, n, 12)).toISOString()
const game = (n, winner, margin, extra = {}) => ({ id: `g${n}`, winner_id: winner, game_type_id: 'c', game_type_name: 'Cribbage', ended_at: day(n), margin, ...extra })
const now = Date.UTC(2026, 8, 30, 12)

describe('rivalryFacts', () => {
  it('says nothing below three games', () => {
    expect(rivalryFacts({ players, timeline: [game(1, 'a', 10), game(2, 'a', 10)], now })).toBeNull()
  })

  it('finds the streak, the biggest blowout and the closest game', () => {
    const timeline = [game(1, 'b', 3), game(2, 'a', 40), game(3, 'a', 12), game(4, 'a', 2)]
    const f = rivalryFacts({ players, timeline, now })
    expect(f.streak).toEqual({ playerId: 'a', length: 3 })
    expect(f.blowout).toMatchObject({ winnerId: 'a', margin: 40 })
    expect(f.closest).toMatchObject({ margin: 2 })
    expect(f.nextGame).toBe(5)
  })

  it('reports a tied series and a lead that changed hands', () => {
    const tied = rivalryFacts({ players, timeline: [game(1, 'a', 9), game(2, 'b', 9), game(3, 'a', 9), game(4, 'b', 9)], now })
    expect(tied.tied).toBe(true)
    const changed = rivalryFacts({ players, timeline: [game(1, 'a', 9), game(2, 'a', 9), game(3, 'b', 9), game(4, 'b', 9), game(5, 'b', 9)], now })
    expect(changed.leadChange).toEqual({ newId: 'b', oldId: 'a' })
    const retaken = rivalryFacts({ players, timeline: [game(1, 'a', 9), game(2, 'b', 9), game(3, 'a', 9)], now })
    expect(retaken.leadChange).toBeUndefined()
    expect(changed.leadChange).toEqual({ newId: 'b', oldId: 'a' })
  })

  it('counts days since a player last won', () => {
    const f = rivalryFacts({ players, timeline: [game(1, 'b', 9), game(2, 'a', 9), game(3, 'a', 9), game(4, 'a', 9)], now })
    expect(f.drought).toMatchObject({ playerId: 'b', games: 3, days: 29 })
  })

  it('needs three close games for a close-game record', () => {
    const two = rivalryFacts({ players, timeline: [game(1, 'a', 3), game(2, 'a', 4), game(3, 'b', 30)], now })
    expect(two.closeRecord).toBeUndefined()
    const three = rivalryFacts({ players, timeline: [game(1, 'a', 3), game(2, 'a', 4), game(3, 'b', 5), game(4, 'a', 1)], now })
    expect(three.closeRecord).toEqual({ playerId: 'a', wins: 3, losses: 1, total: 4 })
  })

  it('finds a player who has won every game of a type, and a clean weekday', () => {
    const timeline = [game(1, 'a', 9), game(2, 'a', 9), game(3, 'a', 9), game(4, 'b', 9, { game_type_id: 'g', game_type_name: 'Gin' })]
    const f = rivalryFacts({ players, timeline, gameTypeId: 'c', now })
    expect(f.owns).toMatchObject({ playerId: 'a', typeName: 'Cribbage', count: 3 })
    const weekly = [8, 15, 22, 29].map((n, i) => game(n, 'b', 9 + i))
    const w = rivalryFacts({ players, timeline: weekly, now })
    expect(w.weekday).toMatchObject({ playerId: 'b', weekday: 'Tuesday', count: 4 })
  })

  it('reads rematch win rate from the game after a loss', () => {
    // b wins every game right after b loses
    const timeline = [game(1, 'a', 9), game(2, 'b', 9), game(3, 'a', 9), game(4, 'b', 9), game(5, 'a', 9), game(6, 'b', 9)]
    const f = rivalryFacts({ players, timeline, now })
    expect(f.rematch).toMatchObject({ playerId: 'b', pct: 100 })
  })

  it('adds up skunks across game types and works for three players', () => {
    const three = [...players, { id: 'c', name: 'Cy' }]
    const roundStats = { c: { x: { skunks: { skunks_received: 1 } }, y: { skunks: { skunks_received: 2 } } } }
    const f = rivalryFacts({ players: three, timeline: [game(1, 'a', 9), game(2, 'b', 9), game(3, 'c', 9)], roundStats, now })
    expect(f.skunked).toEqual({ playerId: 'c', count: 3 })
    expect(f.tied).toBe(true)
  })

  it('flags a round-number next game', () => {
    const timeline = [1, 2, 3, 4].map((n) => game(n, n % 2 ? 'a' : 'b', 9))
    expect(rivalryFacts({ players, timeline, now }).milestone).toBe(5)
  })
})

describe('round-based facts', () => {
  const timeline = [1, 2, 3, 4, 5].map((n) => game(n, n % 2 ? 'a' : 'b', 9))
  const rg = (n, winner, extra = {}) => ({ id: `g${n}`, winner_id: winner, rounds: 8, lead_changes: 1, comeback: 0, blown_lead: 0, blown_by: null, first_dealer_id: 'a', ...extra })

  it('says nothing from round data until three games have it', () => {
    const f = rivalryFacts({ players, timeline, roundGames: [rg(1, 'a', { comeback: 40 }), rg(2, 'b')], now })
    expect(f.comebackRecord).toBeUndefined()
    expect(f.longestGame).toBeUndefined()
  })

  it('finds the biggest comeback, blown lead, wildest game and game lengths', () => {
    const roundGames = [
      rg(1, 'a', { rounds: 6 }),
      rg(2, 'b', { comeback: 31, blown_lead: 31, blown_by: 'a', lead_changes: 5, rounds: 19 }),
      rg(3, 'a', { comeback: 10 })
    ]
    const f = rivalryFacts({ players, timeline, roundGames, now })
    expect(f.comebackRecord).toEqual({ playerId: 'b', points: 31 })
    expect(f.blownLead).toEqual({ playerId: 'a', points: 31 })
    expect(f.wildGame).toEqual({ changes: 5 })
    expect(f.longestGame).toEqual({ rounds: 19 })
    expect(f.shortestGame).toEqual({ rounds: 6 })
  })

  it('ignores small comebacks and games all the same length', () => {
    const f = rivalryFacts({ players, timeline, roundGames: [rg(1, 'a', { comeback: 5 }), rg(2, 'b'), rg(3, 'a')], now })
    expect(f.comebackRecord).toBeUndefined()
    expect(f.longestGame).toBeUndefined()
  })

  it('reads the first-dealer win rate once five games have a dealer', () => {
    const roundGames = [1, 2, 3, 4, 5].map((n) => rg(n, n <= 4 ? 'a' : 'b'))
    const f = rivalryFacts({ players, timeline, roundGames, now })
    expect(f.firstDealer).toEqual({ pct: 80, n: 5 })
    expect(f.dealerWinner).toMatchObject({ playerId: 'a', pct: 80 })
    expect(rivalryFacts({ players, timeline, roundGames: roundGames.slice(0, 4), now }).firstDealer).toBeUndefined()
  })
})

describe('shortDate', () => {
  it('is empty without a date', () => {
    expect(shortDate(null)).toBe('')
    expect(shortDate(day(14))).toBe('Sep 14')
  })
})
