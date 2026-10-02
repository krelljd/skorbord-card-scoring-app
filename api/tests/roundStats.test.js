import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

console.log = () => {}
console.error = () => {}

process.env.DATABASE_URL = 'sqlite:///tmp-test-roundstats/round-stats-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const rounds = await import('../services/rounds.js')
const { summarizeRounds, summarizeParts, getRivalryRoundStats } = await import('../services/roundStats.js')

before(async () => {
  await applySchema(db)
  await db.run("INSERT INTO sqids (id, name) VALUES ('s1', 's1')")
  for (const [id, name] of [['p1', 'Ann'], ['p2', 'Bob']]) {
    await db.run('INSERT INTO players (id, sqid_id, name) VALUES (?, ?, ?)', [id, 's1', name])
  }
  await db.run("INSERT INTO rivalries (id, sqid_id) VALUES ('rv1', 's1')")
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-roundstats', import.meta.url), { recursive: true, force: true })
})

const row = (points, extra = {}) => ({ player_id: 'p1', game_type_id: 't', points, game_id: 'g', round_number: 1, ended_at: null, ...extra })

test('average, best and worst, rounded to one decimal', () => {
  const out = summarizeRounds([row(5), row(10, { round_number: 2 }), row(-3, { round_number: 3 })], new Map([['t', true]]))
  const s = out.p1.t
  assert.equal(s.rounds_played, 3)
  assert.equal(s.avg_round, 4)
  assert.equal(s.best_round.points, 10)
  assert.equal(s.worst_round.points, -3)
})

test('in games where low is good, best and worst swap', () => {
  const out = summarizeRounds([row(5), row(10), row(2)], new Map([['t', false]]))
  assert.equal(out.p1.t.best_round.points, 2)
  assert.equal(out.p1.t.worst_round.points, 10)
})

test('only saved rounds of finished games count, and the earlier-games row is left out', async () => {
  // finished game: round 1 saved with 12 and 4, then finalized with a draft of 8 and 0
  const mk = async (id, finalized) => {
    await db.run(
      `INSERT INTO games (id, sqid_id, game_type_id, rivalry_id, started_at, ended_at, finalized, dealer_id, win_condition_type, win_condition_value)
       VALUES (?, 's1', 'cribbage', 'rv1', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 0, 'p1', 'win', 1000)`,
      [id]
    )
    for (const [i, p] of ['p1', 'p2'].entries()) {
      await db.run('INSERT INTO stats (id, game_id, player_id, score, player_order) VALUES (?, ?, ?, 0, ?)', [`${id}-${p}`, id, p, i + 1])
    }
    await db.run("INSERT INTO rounds (id, game_id, round_number, dealer_id, status) VALUES (?, ?, 1, 'p1', 'open')", [`${id}-r1`, id])
    for (const p of ['p1', 'p2']) {
      await db.run('INSERT INTO round_scores (round_id, game_id, player_id, points) VALUES (?, ?, ?, 0)', [`${id}-r1`, id, p])
    }
    await rounds.setDraft(db, { gameId: id, playerId: 'p1', points: 12 })
    await rounds.setDraft(db, { gameId: id, playerId: 'p2', points: 4 })
    await rounds.commitRound(db, { gameId: id })
    await rounds.setDraft(db, { gameId: id, playerId: 'p1', points: 8 })
    if (finalized) {
      await rounds.closeOpenRound(db, id)
      await db.run('UPDATE games SET finalized = 1 WHERE id = ?', [id])
    }
  }
  await mk('done', true)
  await mk('unfinished', false)

  // an old game: one backfill round that holds totals only
  await db.run(
    `INSERT INTO games (id, sqid_id, game_type_id, rivalry_id, started_at, ended_at, finalized, win_condition_type, win_condition_value)
     VALUES ('old', 's1', 'cribbage', 'rv1', '2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z', 1, 'win', 1000)`
  )
  await db.run("INSERT INTO rounds (id, game_id, round_number, status, is_backfill) VALUES ('old-r1', 'old', 1, 'committed', 1)")
  await db.run("INSERT INTO round_scores (round_id, game_id, player_id, points) VALUES ('old-r1', 'old', 'p1', 90)")

  const stats = await getRivalryRoundStats(db, 'rv1')
  assert.equal(stats.p1.cribbage.rounds_played, 2) // 12 and 8, not the 90 and not the unfinished game
  assert.equal(stats.p1.cribbage.avg_round, 10)
  assert.equal(stats.p1.cribbage.best_round.points, 12)
  assert.equal(stats.p2.cribbage.rounds_played, 2) // 4, then a 0 in the final round
  assert.equal(stats.p2.cribbage.avg_round, 2)
})

const partRow = (extra) => ({ player_id: 'p1', game_type_id: 'cribbage', dealer_id: 'p1', play_points: 0, hand_points: 0, crib_points: 0, ...extra })

test('part stats: averages, bests and shares; crib counts only rounds the player dealt', () => {
  const out = summarizeParts([
    partRow({ play_points: 4, hand_points: 12, crib_points: 8 }),
    partRow({ dealer_id: 'p2', play_points: 6, hand_points: 8, crib_points: null }),
    partRow({ play_points: 2, hand_points: 20, crib_points: 4 })
  ]).p1.cribbage
  assert.equal(out.rounds_tracked, 3)
  assert.equal(out.cribs_dealt, 2)
  assert.equal(out.avg_play, 4)
  assert.equal(out.avg_hand, 13.3)
  assert.equal(out.avg_crib, 6)
  assert.equal(out.best_hand, 20)
  assert.equal(out.best_crib, 8)
  assert.equal(out.share_play + out.share_hand + out.share_crib > 99.5, true)
})

test('part stats skip rounds with no parts and report no crib average without a dealt crib', () => {
  const out = summarizeParts([
    partRow({ play_points: null, hand_points: null, crib_points: null }),
    partRow({ dealer_id: 'p2', play_points: 3, hand_points: 5, crib_points: null })
  ]).p1.cribbage
  assert.equal(out.rounds_tracked, 1)
  assert.equal(out.avg_crib, null)
  assert.equal(out.best_crib, null)
  assert.equal(summarizeParts([partRow({ play_points: null, hand_points: null, crib_points: null })]).p1, undefined)
})
