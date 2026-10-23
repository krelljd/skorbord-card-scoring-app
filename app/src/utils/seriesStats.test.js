import { describe, it, expect } from 'vitest'
import { currentStreak, longestStreaks, barHeights, gameTypeOwner, pointsShares, differentialNote } from './seriesStats.js'

const g = (winner, margin = 10, type = 'c') => ({ id: `${winner}${margin}`, winner_id: winner, game_type_id: type, margin })

describe('streaks', () => {
  const timeline = [g('a'), g('a'), g('b'), g('b'), g('b'), g('b'), g('c'), g('a'), g('a')]

  it('finds the current streak', () => {
    expect(currentStreak(timeline)).toEqual({ playerId: 'a', length: 2 })
    expect(currentStreak([g('b')])).toEqual({ playerId: 'b', length: 1 })
    expect(currentStreak([])).toEqual({ playerId: null, length: 0 })
  })

  it('finds the longest streak per player and overall, with three players', () => {
    const { byPlayer, best } = longestStreaks(timeline)
    expect(byPlayer).toEqual({ a: 2, b: 4, c: 1 })
    expect(best).toEqual({ playerId: 'b', length: 4 })
  })

  it('handles an empty timeline', () => {
    expect(longestStreaks([])).toEqual({ byPlayer: {}, best: { playerId: null, length: 0 } })
  })
})

describe('barHeights', () => {
  it('scales each margin against the biggest of the same game type', () => {
    const h = barHeights([g('a', 20, 'crib'), g('b', 10, 'crib'), g('a', 4, 'golf'), g('b', 40, 'golf')])
    expect(h).toEqual([1, 0.5, 0.12, 1])
  })

  it('keeps a visible minimum and survives zero margins', () => {
    expect(barHeights([g('a', 0)])).toEqual([0.12])
    expect(barHeights([g('a', 1, 'x'), g('a', 100, 'x')])[0]).toBe(0.12)
  })
})

describe('gameTypeOwner', () => {
  it('names the single leader', () => {
    const r = gameTypeOwner([{ id: 'a', name: 'A', wins: 5 }, { id: 'b', name: 'B', wins: 3 }, { id: 'c', name: 'C', wins: 0 }])
    expect(r.owner.id).toBe('a')
    expect(r).toMatchObject({ tied: false, wins: 5, total: 8 })
  })
  it('calls a tie for first even, including a three-way tie', () => {
    expect(gameTypeOwner([{ id: 'a', wins: 2 }, { id: 'b', wins: 2 }, { id: 'c', wins: 1 }])).toMatchObject({ owner: null, tied: true, wins: 2 })
    expect(gameTypeOwner([{ id: 'a', wins: 1 }, { id: 'b', wins: 1 }, { id: 'c', wins: 1 }]).tied).toBe(true)
  })
  it('has no owner before any game is won', () => {
    expect(gameTypeOwner([{ id: 'a', wins: 0 }, { id: 'b', wins: 0 }])).toMatchObject({ owner: null, tied: false, total: 0 })
  })
})

describe('points', () => {
  const players = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cy' }]
  const totals = { a: { c: 300 }, b: { c: 100 }, c: { c: 100 } }

  it('splits points into shares in player order', () => {
    const s = pointsShares(totals, players, 'c')
    expect(s.map((r) => r.points)).toEqual([300, 100, 100])
    expect(s[0].share).toBeCloseTo(0.6)
    expect(s.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1)
  })
  it('is null with no points or an unknown type', () => {
    expect(pointsShares({}, players, 'c')).toBeNull()
    expect(pointsShares(totals, players, 'zzz')).toBeNull()
  })

  it('notes when the wins leader and the points leader differ', () => {
    const shares = pointsShares({ a: { c: 2244 }, b: { c: 2310 } }, players.slice(0, 2), 'c')
    expect(differentialNote(shares, [{ id: 'a', wins: 3 }, { id: 'b', wins: 2 }])).toBe('Ann wins more, Bob scores more')
  })
  it('stays quiet when the same player leads both, or a lead is tied', () => {
    const shares = pointsShares(totals, players, 'c')
    expect(differentialNote(shares, [{ id: 'a', wins: 3 }, { id: 'b', wins: 1 }, { id: 'c', wins: 0 }])).toBe('')
    expect(differentialNote(shares, [{ id: 'a', wins: 1 }, { id: 'b', wins: 1 }, { id: 'c', wins: 0 }])).toBe('')
    expect(differentialNote(null, [])).toBe('')
  })
  it('flips the points leader when low wins', () => {
    const shares = pointsShares({ a: { g: 90 }, b: { g: 120 } }, players.slice(0, 2), 'g')
    expect(differentialNote(shares, [{ id: 'a', wins: 1 }, { id: 'b', wins: 3 }], false)).toBe('Bob wins more, Ann scores fewer')
  })
})
