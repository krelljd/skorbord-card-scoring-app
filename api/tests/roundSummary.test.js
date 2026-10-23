import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

console.log = () => {}
console.error = () => {}

process.env.DATABASE_URL = 'sqlite:///tmp-test-roundsummary/round-summary-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const { summarizeGameRounds, getRivalryRounds } = await import('../services/roundSummary.js')

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
  fs.rmSync(new URL('../tmp-test-roundsummary', import.meta.url), { recursive: true, force: true })
})

// one row per player per round
const rows = (gameId, winner, perRound, extra = {}) => perRound.flatMap((scores, i) =>
  Object.entries(scores).map(([player_id, points]) => ({
    game_id: gameId, winner_id: winner, game_type_id: 'cribbage', game_type_name: 'Cribbage', ended_at: '2026-01-01T00:00:00Z',
    round_number: i + 1, is_backfill: 0, dealer_id: i % 2 ? 'p2' : 'p1', player_id, points, ...extra
  })))

test('a comeback, a blown lead and lead changes come from the running totals', () => {
  // Bob leads 30-10 after two rounds, then Ann wins it back
  const [g] = summarizeGameRounds(rows('g1', 'p1', [{ p1: 5, p2: 20 }, { p1: 5, p2: 10 }, { p1: 40, p2: 5 }, { p1: 80, p2: 5 }]), new Map())
  assert.equal(g.rounds, 4)
  assert.equal(g.comeback, 20)
  assert.equal(g.blown_lead, 20)
  assert.equal(g.blown_by, 'p2')
  assert.equal(g.lead_changes, 1)
  assert.equal(g.first_dealer_id, 'p1')
})

test('lowest score wins flips the direction', () => {
  // Golf: Ann wins with the lowest total. Bob was lower after round one, so Bob "led".
  const [g] = summarizeGameRounds(rows('g1', 'p1', [{ p1: 12, p2: 2 }, { p1: 1, p2: 15 }, { p1: 1, p2: 15 }]), new Map([['cribbage', false]]))
  assert.equal(g.comeback, 10)
  assert.equal(g.blown_by, 'p2')
})

test('games under three real rounds are left out, and backfill is not a round', () => {
  assert.deepEqual(summarizeGameRounds(rows('g1', 'p1', [{ p1: 50, p2: 10 }, { p1: 50, p2: 10 }]), new Map()), [])
  const legacy = [{ ...rows('g2', 'p1', [{ p1: 100, p2: 40 }])[0], is_backfill: 1 }, { ...rows('g2', 'p1', [{ p1: 100, p2: 40 }])[1], is_backfill: 1 }]
  assert.deepEqual(summarizeGameRounds(legacy, new Map()), [])
})

test('three players: the blown lead is the biggest any non-winner held', () => {
  const [g] = summarizeGameRounds(rows('g1', 'p3', [{ p1: 30, p2: 10, p3: 0 }, { p1: 0, p2: 20, p3: 10 }, { p1: 0, p2: 0, p3: 60 }]), new Map())
  assert.equal(g.blown_by, 'p1')
  assert.equal(g.blown_lead, 30)
})

test('getRivalryRounds reads committed rounds of finished games only', async () => {
  const mk = async (id, finalized, winner, perRound) => {
    await db.run(
      `INSERT INTO games (id, sqid_id, game_type_id, rivalry_id, started_at, ended_at, finalized, winner_id)
       VALUES (?, 's1', 'cribbage', 'rv1', ?, ?, ?, ?)`,
      [id, `2026-02-0${id.slice(-1)}T00:00:00Z`, `2026-02-0${id.slice(-1)}T01:00:00Z`, finalized, winner]
    )
    for (const [i, scores] of perRound.entries()) {
      const rid = `${id}-r${i + 1}`
      await db.run("INSERT INTO rounds (id, game_id, round_number, dealer_id, status) VALUES (?, ?, ?, 'p1', 'committed')", [rid, id, i + 1])
      for (const [p, pts] of Object.entries(scores)) {
        await db.run('INSERT INTO round_scores (round_id, game_id, player_id, points) VALUES (?, ?, ?, ?)', [rid, id, p, pts])
      }
    }
  }
  const rounds = [{ p1: 10, p2: 30 }, { p1: 40, p2: 5 }, { p1: 80, p2: 5 }]
  await mk('gm1', 1, 'p1', rounds)
  await mk('gm2', 0, null, rounds)
  const out = await getRivalryRounds(db, 'rv1')
  assert.deepEqual(out.map((g) => [g.id, g.rounds, g.comeback, g.first_dealer_id]), [['gm1', 3, 20, 'p1']])
})
