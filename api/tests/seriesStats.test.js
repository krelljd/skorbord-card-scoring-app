import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

console.log = () => {}
console.error = () => {}

process.env.DATABASE_URL = 'sqlite:///tmp-test-seriesstats/series-stats-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const { summarizeTimeline, summarizePoints, getRivalrySeries, TIMELINE_LIMIT } = await import('../services/seriesStats.js')

before(async () => {
  await applySchema(db)
  await db.run("INSERT INTO sqids (id, name) VALUES ('s1', 's1')")
  for (const [id, name] of [['p1', 'Ann'], ['p2', 'Bob'], ['p3', 'Cy']]) {
    await db.run('INSERT INTO players (id, sqid_id, name) VALUES (?, ?, ?)', [id, 's1', name])
  }
  await db.run("INSERT INTO rivalries (id, sqid_id) VALUES ('rv1', 's1')")
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-seriesstats', import.meta.url), { recursive: true, force: true })
})

const row = (gameId, playerId, score, extra = {}) => ({
  game_id: gameId, game_type_id: 'cribbage', game_type_name: 'Cribbage', winner_id: 'p1',
  ended_at: '2026-01-01T00:00:00Z', player_id: playerId, score, ...extra
})

test('margin is the winner lead over the closest other player', () => {
  const out = summarizeTimeline(
    [row('g1', 'p1', 121), row('g1', 'p2', 100), row('g1', 'p3', 60)],
    new Map([['cribbage', true]])
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].margin, 21)
  assert.equal(out[0].winner_id, 'p1')
  assert.equal(out[0].scores, undefined)
})

test('in games where low wins, the margin is how far the closest other player is above the winner', () => {
  const out = summarizeTimeline(
    [row('g1', 'p1', 40, { game_type_id: 'golf' }), row('g1', 'p2', 55, { game_type_id: 'golf' }), row('g1', 'p3', 90, { game_type_id: 'golf' })],
    new Map([['golf', false]])
  )
  assert.equal(out[0].margin, 15)
})

test('games come out oldest first and are capped to the most recent ones', () => {
  const rows = []
  for (let i = 0; i < TIMELINE_LIMIT + 5; i++) {
    const at = new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString()
    rows.push(row(`g${i}`, 'p1', 121, { ended_at: at }), row(`g${i}`, 'p2', 100, { ended_at: at }))
  }
  rows.reverse()
  const out = summarizeTimeline(rows, new Map())
  assert.equal(out.length, TIMELINE_LIMIT)
  assert.equal(out[0].id, 'g5')
  assert.equal(out[out.length - 1].id, `g${TIMELINE_LIMIT + 4}`)
})

test('a game with no winner score or no opponent is skipped', () => {
  assert.deepEqual(summarizeTimeline([row('g1', 'p2', 10)], new Map()), [])
  assert.deepEqual(summarizeTimeline([row('g1', 'p1', 10)], new Map()), [])
})

test('points are summed per player and game type', () => {
  const out = summarizePoints([
    { game_type_id: 'a', player_id: 'p1', score: 100 },
    { game_type_id: 'a', player_id: 'p1', score: 21 },
    { game_type_id: 'b', player_id: 'p1', score: 5 },
    { game_type_id: 'a', player_id: 'p2', score: 90 }
  ])
  assert.deepEqual(out, { p1: { a: 121, b: 5 }, p2: { a: 90 } })
})

test('getRivalrySeries reads finished games with a winner, including legacy one-round games', async () => {
  const mk = async (id, finalized, winner, scores) => {
    await db.run(
      `INSERT INTO games (id, sqid_id, game_type_id, rivalry_id, started_at, ended_at, finalized, winner_id)
       VALUES (?, 's1', 'cribbage', 'rv1', ?, ?, ?, ?)`,
      [id, `2026-02-0${id.slice(-1)}T00:00:00Z`, `2026-02-0${id.slice(-1)}T01:00:00Z`, finalized, winner]
    )
    for (const [i, [p, s]] of Object.entries(scores).entries()) {
      await db.run('INSERT INTO stats (id, game_id, player_id, score, player_order) VALUES (?, ?, ?, ?, ?)', [`${id}-${p}`, id, p, s, i + 1])
    }
  }
  await mk('gm1', 1, 'p1', { p1: 121, p2: 100 })
  await mk('gm2', 1, 'p2', { p1: 90, p2: 121 })
  await mk('gm3', 0, null, { p1: 10, p2: 20 })
  const { timeline, points_totals } = await getRivalrySeries(db, 'rv1')
  assert.deepEqual(timeline.map((g) => [g.id, g.winner_id, g.margin]), [['gm1', 'p1', 21], ['gm2', 'p2', 31]])
  assert.equal(points_totals.p1.cribbage, 211)
  assert.equal(points_totals.p2.cribbage, 221)
})
