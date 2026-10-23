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

describe('round-based lines', () => {
  const timeline = [1, 2, 3, 4, 5].map((n) => game(n, n % 2 ? 'a' : 'b', 9))
  const rg = (n, winner, extra = {}) => ({ id: `g${n}`, winner_id: winner, rounds: 8, lead_changes: 1, comeback: 0, blown_lead: 0, blown_by: null, first_dealer_id: 'a', ...extra })
  const facts = rivalryFacts({
    players, timeline, now,
    roundGames: [rg(1, 'a', { rounds: 6 }), rg(2, 'b', { comeback: 31, blown_lead: 31, blown_by: 'a', lead_changes: 5, rounds: 19 }), rg(3, 'a'), rg(4, 'a'), rg(5, 'a')]
  })
  const ids = (level, context) => {
    const seen = new Set()
    for (let i = 0; i < 300; i++) {
      const line = pickLine({ level, context, facts, players, rand: () => i / 300 })
      if (line) seen.add(line.id)
    }
    return seen
  }

  it('turns round facts into lines with names and numbers', () => {
    const all = new Set()
    const texts = []
    for (let i = 0; i < 300; i++) {
      const line = pickLine({ level: 'spicy', context: 'history', facts, players, rand: () => i / 300 })
      if (line && !all.has(line.id)) { all.add(line.id); texts.push(line.text) }
    }
    expect(texts.join('\n')).toMatch(/Jess once came back from 31 down/)
    expect(texts.join('\n')).toMatch(/Alex has blown a 31-point lead/)
    expect(texts.join('\n')).toMatch(/longest game ran 19 rounds/)
  })

  it('shows dealer lines only before a game, and the spicy ones only on Spicy', () => {
    expect(ids('spicy', 'history').has('dealer-1')).toBe(false)
    expect(ids('spicy', 'pregame').has('dealer-1')).toBe(true)
    expect(ids('mild', 'pregame').has('dealer-2')).toBe(false)
    expect(ids('mild', 'history').has('blown-1')).toBe(false)
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
