import { describe, it, expect } from 'vitest'
import { pickLine, pickEmptyLine, pickWinnerLine, EMPTY_LINES } from './snark.js'
import { rivalryFacts } from './rivalryFacts.js'

const players = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Jess' }]
const day = (n) => new Date(Date.UTC(2026, 8, n, 12)).toISOString()
const game = (n, winner, margin) => ({ id: `g${n}`, winner_id: winner, game_type_id: 'c', game_type_name: 'Cribbage', ended_at: day(n), margin })
const now = Date.UTC(2026, 8, 30, 12)
const streakFacts = rivalryFacts({ players, timeline: [game(1, 'b', 9), game(2, 'a', 40), game(3, 'a', 12), game(4, 'a', 2)], now })
const seq = (...values) => { let i = 0; return () => values[i++ % values.length] }
const textsFor = (level, facts = streakFacts, ps = players) => {
  const seen = new Set()
  for (let i = 0; i < 400; i++) {
    const line = pickLine({ level, context: 'history', facts, players: ps, rand: () => (i % 100) / 100 + 0.001 * (i / 100) })
    if (line) seen.add(line.id)
  }
  return seen
}

describe('pickLine', () => {
  it('shows nothing when Off or when there are no facts', () => {
    expect(pickLine({ level: 'off', context: 'history', facts: streakFacts, players })).toBeNull()
    expect(pickLine({ level: 'spicy', context: 'history', facts: null, players })).toBeNull()
  })

  it('uses mild lines only on Mild, and both tones on Spicy', () => {
    const mild = textsFor('mild')
    const spicy = textsFor('spicy')
    expect([...mild].every((id) => ['streak-1', 'streak-2', 'drought-1', 'drought-2', 'blowout-1', 'closest-1', 'milestone-1', 'milestone-2'].includes(id))).toBe(true)
    expect(spicy.has('streak-3') || spicy.has('streak-4')).toBe(true)
    expect(spicy.size).toBeGreaterThan(mild.size)
  })

  it('fills in names and numbers', () => {
    const line = pickLine({ level: 'mild', context: 'history', facts: streakFacts, players, rand: () => 0 })
    expect(line.text).toMatch(/Alex/)
    expect(line.text).toMatch(/3 in a row/)
  })

  it('never repeats the line before', () => {
    let last = null
    for (let i = 0; i < 40; i++) {
      const line = pickLine({ level: 'spicy', context: 'history', facts: streakFacts, players, lastId: last, rand: Math.random })
      expect(line.id).not.toBe(last)
      last = line.id
    }
  })

  it('only shows a line whose fact is true', () => {
    const ids = textsFor('spicy')
    expect(ids.has('tied-1')).toBe(false)
    expect(ids.has('owns-1')).toBe(false) // Jess won game 1, so nobody owns Cribbage
  })

  it('reads right with three players', () => {
    const three = [...players, { id: 'c', name: 'Cy' }]
    const facts = rivalryFacts({ players: three, timeline: [game(1, 'b', 9), game(2, 'a', 40), game(3, 'a', 12), game(4, 'a', 2)], now })
    const line = pickLine({ level: 'spicy', context: 'history', facts, players: three, rand: seq(0.9) })
    expect(line.text).not.toMatch(/undefined/)
    const ids = textsFor('spicy', facts, three)
    expect(ids.has('streak-3')).toBe(true)
  })
})

describe('other lines', () => {
  it('has first-game lines unless Off', () => {
    expect(pickEmptyLine({ level: 'off' })).toBeNull()
    expect(EMPTY_LINES).toContain(pickEmptyLine({ level: 'mild' }).text)
  })

  it('winner lines name the winner, never a loser, and stay mild', () => {
    for (let i = 0; i < 20; i++) {
      const line = pickWinnerLine({ level: 'spicy', winner: 'Alex', wins: 5, rand: Math.random })
      expect(line.text).toMatch(/Alex/)
    }
    expect(pickWinnerLine({ level: 'off', winner: 'Alex' })).toBeNull()
  })

  it('leaves out the lopsided line until the winner has three wins', () => {
    const texts = new Set()
    for (let i = 0; i < 50; i++) texts.add(pickWinnerLine({ level: 'mild', winner: 'Alex', wins: 1, rand: Math.random }).text)
    expect([...texts].some((t) => /lopsided/.test(t))).toBe(false)
  })
})
