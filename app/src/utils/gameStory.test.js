import { describe, it, expect } from 'vitest'
import { gameStory, storyChips, MIN_ROUNDS } from './gameStory.js'

// perPlayer: { a: [points per round], b: [...] }
const state = (perPlayer, extra = {}, type = 'win') => {
  const ids = Object.keys(perPlayer)
  const n = Math.max(...ids.map((id) => perPlayer[id].length))
  return {
    game: { win_condition_type: type },
    players: ids.map((id) => ({ player_id: id, player_name: id.toUpperCase() })),
    rounds: Array.from({ length: n }, (_, i) => ({
      round_number: i + 1, status: 'committed', is_backfill: 0,
      scores: Object.fromEntries(ids.map((id) => [id, perPlayer[id][i] ?? 0]))
    })),
    ...extra
  }
}
const names = { a: 'Alex', b: 'Jess', c: 'Cy' }

const comeback = state({
  a: [5, 8, 6, 10, 7, 9, 26, 11, 12, 15, 12],
  b: [12, 9, 14, 6, 11, 8, 2, 10, 13, 9, 7]
})

describe('gameStory', () => {
  it('reads a comeback: one lead change, a 16 point deficit, round 7 swing', () => {
    const s = gameStory(comeback, { winnerId: 'a' })
    expect(s.rounds).toBe(11)
    expect(s.leadChanges).toBe(1)
    expect(s.roundsLed).toEqual({ a: 5, b: 6 })
    expect(s.deficit).toEqual({ playerId: 'a', points: 16 })
    expect(s.swing).toEqual({ round: 7, playerId: 'a', points: 26, gap: 24 })
    expect(s.cells.map((c) => c.leaderId).slice(0, 7)).toEqual(['b', 'b', 'b', 'b', 'b', 'b', 'a'])
  })

  it('has no deficit or lead change in a wire-to-wire win', () => {
    const s = gameStory(state({ a: [10, 10, 10, 10], b: [1, 2, 3, 4] }), { winnerId: 'a' })
    expect(s.leadChanges).toBe(0)
    expect(s.deficit.points).toBe(0)
    expect(storyChips(s, { winnerId: 'a', names, target: 121 })).toEqual([])
  })

  it('treats a tie for first as no leader and does not count it as a lead change', () => {
    const s = gameStory(state({ a: [5, 5, 5], b: [5, 5, 5] }))
    expect(s.cells.every((c) => c.leaderId === null)).toBe(true)
    expect(s.leadChanges).toBe(0)
    // a leads, tie, a leads again: still no change; a leads, tie, b leads: one change
    expect(gameStory(state({ a: [5, 0, 5], b: [0, 5, 0] })).leadChanges).toBe(0)
    expect(gameStory(state({ a: [5, 0, 0], b: [0, 5, 5] })).leadChanges).toBe(1)
  })

  it('flips ahead and swing for games where the lowest score wins', () => {
    const s = gameStory(state({ a: [1, 2, 3, 2], b: [9, 8, 7, 8] }, {}, 'lose'), { winnerId: 'a' })
    expect(s.higherIsBetter).toBe(false)
    expect(s.cells.every((c) => c.leaderId === 'a')).toBe(true)
    expect(s.deficit.points).toBe(0)
    expect(s.swing).toMatchObject({ round: 1, playerId: 'a', points: 1 })
  })

  it('works for three and four players', () => {
    const three = gameStory(state({ a: [10, 0, 0, 0], b: [0, 12, 12, 0], c: [5, 5, 5, 40] }), { winnerId: 'c' })
    expect(three.cells.map((c) => c.leaderId)).toEqual(['a', 'b', 'b', 'c'])
    expect(three.leadChanges).toBe(2)
    expect(three.deficit.points).toBe(9) // after round 3 b has 24 and c has 15
    expect(three.swing).toMatchObject({ round: 4, playerId: 'c', points: 40, gap: 40 })
    const four = gameStory(state({ a: [1, 1, 1], b: [2, 2, 2], c: [3, 3, 3], d: [4, 4, 4] }), { winnerId: 'd' })
    expect(four.roundsLed).toEqual({ a: 0, b: 0, c: 0, d: 3 })
  })

  it('needs three real rounds and ignores the earlier-games row', () => {
    expect(MIN_ROUNDS).toBe(3)
    expect(gameStory(state({ a: [1, 2], b: [2, 1] }))).toBeNull()
    const s = state({ a: [100, 5, 5, 5], b: [50, 9, 9, 9] })
    s.rounds[0].is_backfill = 1
    const out = gameStory(s, { winnerId: 'a' })
    expect(out.rounds).toBe(3)
    // the 100 to 50 head start counts toward who leads, but is not a round
    expect(out.cells.every((c) => c.leaderId === 'a')).toBe(true)
    expect(out.cells[0].round).toBe(2)
  })

  it('counts the open round only when asked and only when it has points', () => {
    const s = state({ a: [1, 1, 1, 9], b: [2, 2, 2, 0] })
    s.rounds[3].status = 'open'
    expect(gameStory(s, { winnerId: 'a' }).rounds).toBe(3)
    expect(gameStory(s, { winnerId: 'a', includeOpen: true }).rounds).toBe(4)
    s.rounds[3].scores = { a: 0, b: 0 }
    expect(gameStory(s, { includeOpen: true }).rounds).toBe(3)
  })

  it('is null without two players', () => {
    expect(gameStory({ players: [{ player_id: 'a' }], rounds: [] })).toBeNull()
    expect(gameStory(null)).toBeNull()
  })
})

describe('storyChips', () => {
  const story = gameStory(comeback, { winnerId: 'a' })

  it('lists the comeback, who led more rounds, the lead change count and the swing round', () => {
    expect(storyChips(story, { winnerId: 'a', names, target: 121 })).toEqual([
      'Trailed by 16, won', 'Jess led 6 of 11 rounds', 'Swing round: R7, Alex +26'
    ])
  })

  it('needs a bigger deficit when the target is large', () => {
    expect(storyChips(story, { winnerId: 'a', names, target: 200 })).not.toContain('Trailed by 16, won')
    expect(storyChips(story, { winnerId: 'a', names, target: 121 })).toContain('Trailed by 16, won')
  })

  it('shows a lead change chip from two changes up', () => {
    const s = gameStory(state({ a: [10, 0, 20, 0], b: [0, 15, 0, 20] }), { winnerId: 'b' })
    expect(s.leadChanges).toBe(3)
    expect(storyChips(s, { winnerId: 'b', names, target: null })).toContain('Lead changed 3×')
  })

  it('is empty without a story or winner', () => {
    expect(storyChips(null, { winnerId: 'a', names })).toEqual([])
    expect(storyChips(story, { winnerId: null, names })).toEqual([])
  })
})
