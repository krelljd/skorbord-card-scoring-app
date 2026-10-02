import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

console.log = () => {}
console.error = () => {}

process.env.DATABASE_URL = 'sqlite:///tmp-test-rounds/rounds-migration-test.db'
const { default: db } = await import('../db/database.js')
const { MigrationRunner } = await import('../db/migrations/migrationRunner.js')
const { findTotalMismatches } = await import('../db/roundTotals.js')

const migrationsDir = fileURLToDir(new URL('../db/migrations', import.meta.url))

function fileURLToDir(url) {
  return url.pathname
}

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-rounds', import.meta.url), { recursive: true, force: true })
})

test('002_rounds backfills legacy games and keeps totals consistent', async () => {
  // 1. Bring the database to the baseline only (what production looks like today).
  const baselineOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-only-'))
  try {
    fs.copyFileSync(path.join(migrationsDir, '001_baseline.sql'), path.join(baselineOnly, '001_baseline.sql'))
    await new MigrationRunner(db, { migrationsDir: baselineOnly }).run()
  } finally {
    fs.rmSync(baselineOnly, { recursive: true, force: true })
  }

  // 2. Seed one finalized game and one unfinished game with scores.
  await db.run("INSERT INTO sqids (id, name) VALUES ('s1', 's1')")
  await db.run("INSERT INTO players (id, sqid_id, name) VALUES ('p1', 's1', 'Ann'), ('p2', 's1', 'Bob')")
  await db.run(`INSERT INTO games (id, sqid_id, game_type_id, started_at, ended_at, winner_id, finalized, dealer_id)
                VALUES ('g-done', 's1', 'cribbage', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', 'p1', 1, 'p2')`)
  await db.run(`INSERT INTO games (id, sqid_id, game_type_id, started_at, finalized, dealer_id)
                VALUES ('g-live', 's1', 'cribbage', '2026-02-01T10:00:00Z', 0, 'p1')`)
  await db.run(`INSERT INTO stats (id, game_id, player_id, score, player_order) VALUES
                ('a1', 'g-done', 'p1', 121, 1), ('a2', 'g-done', 'p2', 90, 2),
                ('b1', 'g-live', 'p1', 40, 1), ('b2', 'g-live', 'p2', 55, 2)`)

  // 3. Apply the rest of the migrations.
  await new MigrationRunner(db).run()

  const rounds = await db.query('SELECT game_id, round_number, status, is_backfill, dealer_id FROM rounds ORDER BY game_id, round_number')
  assert.deepEqual(rounds, [
    { game_id: 'g-done', round_number: 1, status: 'committed', is_backfill: 1, dealer_id: 'p2' },
    { game_id: 'g-live', round_number: 1, status: 'committed', is_backfill: 1, dealer_id: 'p1' },
    { game_id: 'g-live', round_number: 2, status: 'open', is_backfill: 0, dealer_id: 'p1' }
  ])

  const scores = await db.query(`
    SELECT r.game_id, r.round_number, rs.player_id, rs.points
    FROM round_scores rs JOIN rounds r ON r.id = rs.round_id
    ORDER BY r.game_id, r.round_number, rs.player_id`)
  assert.deepEqual(scores, [
    { game_id: 'g-done', round_number: 1, player_id: 'p1', points: 121 },
    { game_id: 'g-done', round_number: 1, player_id: 'p2', points: 90 },
    { game_id: 'g-live', round_number: 1, player_id: 'p1', points: 40 },
    { game_id: 'g-live', round_number: 1, player_id: 'p2', points: 55 },
    { game_id: 'g-live', round_number: 2, player_id: 'p1', points: 0 },
    { game_id: 'g-live', round_number: 2, player_id: 'p2', points: 0 }
  ])

  assert.deepEqual(await findTotalMismatches(db), [])

  // Existing tables are untouched.
  assert.equal((await db.get("SELECT score FROM stats WHERE id = 'a1'")).score, 121)
})

test('findTotalMismatches reports a cached total that disagrees with its rounds', async () => {
  await db.run("UPDATE stats SET score = 100 WHERE id = 'b1'")
  assert.deepEqual(await findTotalMismatches(db), [
    { game_id: 'g-live', player_id: 'p1', cached_total: 100, round_total: 40 }
  ])
  await db.run("UPDATE stats SET score = 40 WHERE id = 'b1'")
  assert.deepEqual(await findTotalMismatches(db), [])
})

test('a game can have only one open round, and round numbers are unique', async () => {
  await assert.rejects(
    () => db.run("INSERT INTO rounds (id, game_id, round_number, status) VALUES ('x', 'g-live', 3, 'open')"),
    /UNIQUE/
  )
  await assert.rejects(
    () => db.run("INSERT INTO rounds (id, game_id, round_number, status) VALUES ('y', 'g-live', 1, 'committed')"),
    /UNIQUE/
  )
  await assert.rejects(
    () => db.run("INSERT INTO rounds (id, game_id, round_number, status) VALUES ('z', 'g-live', 4, 'bogus')"),
    /CHECK/
  )
})

test('deleting a game cascades to its rounds and scores; deleting a dealer keeps the round', async () => {
  await db.run("DELETE FROM games WHERE id = 'g-done'")
  assert.equal((await db.query("SELECT id FROM rounds WHERE game_id = 'g-done'")).length, 0)
  assert.equal((await db.query("SELECT 1 FROM round_scores WHERE game_id = 'g-done'")).length, 0)

  await db.run("UPDATE games SET dealer_id = NULL WHERE id = 'g-live'")
  await db.run("DELETE FROM stats WHERE player_id = 'p1'")
  await db.run("DELETE FROM players WHERE id = 'p1'")
  const rounds = await db.query("SELECT dealer_id FROM rounds WHERE game_id = 'g-live' ORDER BY round_number")
  assert.deepEqual(rounds.map((r) => r.dealer_id), [null, null])
  assert.equal((await db.query("SELECT 1 FROM round_scores WHERE player_id = 'p1'")).length, 0)
})
