import { describe, it, expect } from 'vitest'
import { talkingPoints, MIN_GAMES } from './talkingPoints.js'

const players = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Jess' }, { id: 'c', name: 'Cy' }]
const g = (winner, type = 'c', typeName = 'Cribbage') => ({ id: Math.random().toString(36), winner_id: winner, game_type_id: type, game_type_name: typeName, margin: 10 })
const seq = (...w) => w.map((x) => g(x))
const ids = (facts) => facts.map((f) => f.id)

describe('talkingPoints: after a game', () => {
  const base = { context: 'gameover', players, gameTypeId: 'c' }

  it('says nothing before three games', () => {
    expect(MIN_GAMES).toBe(3)
    expect(talkingPoints({ ...base, timeline: seq('a', 'a') })).toEqual([])
  })

  it('names a streak of three or more, and when one just ended', () => {
    expect(talkingPoints({ ...base, timeline: seq('b', 'a', 'a', 'a') })[0]).toEqual({ id: 'streak', text: 'Alex has won the last 3 games in a row.' })
    expect(talkingPoints({ ...base, timeline: seq('a', 'a', 'a', 'a', 'b') }).map((f) => f.text)).toContain("Alex's 4-game winning streak is over.")
  })

  it('reports a series lead change and a tie, but not an unchanged lead', () => {
    const takes = talkingPoints({ ...base, timeline: seq('b', 'b', 'a', 'a', 'a') })
    expect(takes.find((f) => f.id === 'series').text).toBe('Alex takes the series lead with 3 wins.')
    const tied = talkingPoints({ ...base, timeline: seq('a', 'a', 'b', 'a', 'b', 'b') })
    expect(tied.find((f) => f.id === 'series').text).toBe('Alex and Jess are now tied for the series lead on 3 wins.')
    const same = talkingPoints({ ...base, timeline: seq('a', 'a', 'b', 'a') })
    expect(ids(same)).not.toContain('series')
  })

  it('handles a three-way tie and three players', () => {
    const out = talkingPoints({ ...base, timeline: seq('a', 'b', 'c') })
    expect(out.find((f) => f.id === 'series').text).toBe('Alex, Jess and Cy are now tied for the series lead on 1 win.')
  })

  it('says a player has won every game of a type', () => {
    const out = talkingPoints({ ...base, context: 'gameover', timeline: [g('a'), g('a'), g('a', 'g', 'Gin'), g('a', 'g', 'Gin'), g('b'), g('a', 'g', 'Gin')], gameTypeId: 'g', max: 5 })
    expect(out.map((f) => f.text)).toContain('Alex has won every Gin game, 3–0.')
  })

  it('ignores games won by someone outside the rivalry and caps the list', () => {
    expect(talkingPoints({ ...base, timeline: seq('x', 'x', 'x', 'x') })).toEqual([])
    expect(talkingPoints({ ...base, timeline: seq('b', 'b', 'a', 'a', 'a'), max: 1 })).toHaveLength(1)
  })
})

describe('talkingPoints: before a game', () => {
  const base = { context: 'pregame', players: players.slice(0, 2), gameTypeId: 'c' }

  it('names a streak, the series and the recent form in this game type', () => {
    const out = talkingPoints({ ...base, timeline: seq('b', 'a', 'a', 'a', 'a'), max: 5 })
    expect(out.map((f) => f.text)).toEqual([
      'Alex is on a 4-game streak.',
      'Alex leads the series with 4 wins.',
      'Alex has won 4 of the last 5 Cribbage games.'
    ])
  })

  it('says a tied series is tied', () => {
    const out = talkingPoints({ ...base, timeline: seq('a', 'b', 'a', 'b') })
    expect(out.find((f) => f.id === 'series').text).toBe('Alex and Jess are tied for the series lead on 2 wins.')
  })

  it('uses only the picked game type for the recent form', () => {
    const t = [g('a', 'g', 'Gin'), g('a', 'g', 'Gin'), g('a', 'g', 'Gin'), g('b'), g('b'), g('b')]
    const out = talkingPoints({ ...base, gameTypeId: 'g', timeline: t, max: 5 })
    expect(out.map((f) => f.text)).toContain('Alex has won 3 of the last 3 Gin games.')
    expect(talkingPoints({ ...base, gameTypeId: 'zzz', timeline: t, max: 5 }).map((f) => f.id)).not.toContain('recent-type')
  })

  it('has nothing for a new pairing', () => {
    expect(talkingPoints({ ...base, timeline: [] })).toEqual([])
    expect(talkingPoints({ ...base, timeline: seq('a', 'b') })).toEqual([])
  })
})
