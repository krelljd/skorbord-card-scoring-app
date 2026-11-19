import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

console.log = () => {}
console.error = () => {}

process.env.DATABASE_URL = 'sqlite:///tmp-test-unfinished/unfinished-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const svc = await import('../services/unfinishedGames.js')

const NOW = new Date('2026-06-30T12:00:00Z')
let counter = 0

before(async () => {
  await applySchema(db)
  await db.run("INSERT INTO sqids (id, name) VALUES ('s1', 's1'), ('s2', 's2')")
  for (const [id, sqid, name] of [['p1', 's1', 'Ann'], ['p2', 's1', 'Bob'], ['p3', 's2', 'Cy']]) {
    await db.run('INSERT INTO players (id, sqid_id, name) VALUES (?, ?, ?)', [id, sqid, name])
  }
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-unfinished', import.meta.url), { recursive: true, force: true })
})

/** An unfinished game. scores: totals per player. activity: ISO time of the last score write. */
async function game({ sqid = 's1', players = ['p1', 'p2'], scores = [0, 0], parked = false, activity = '2026-06-30T10:00:00Z', finalized = 0, committed = false } = {}) {
  const id = `g${++counter}`
  await db.run(
    `INSERT INTO games (id, sqid_id, game_type_id, started_at, finalized, abandoned_at) VALUES (?, ?, 'cribbage', ?, ?, ?)`,
    [id, sqid, activity, finalized, parked ? activity : null]
  )
  for (const [i, p] of players.entries()) {
    await db.run('INSERT INTO stats (id, game_id, player_id, score, player_order, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [`${id}-${p}`, id, p, scores[i], i + 1, activity])
  }
  await db.run("INSERT INTO rounds (id, game_id, round_number, status) VALUES (?, ?, 1, ?)", [`${id}-r1`, id, committed ? 'committed' : 'open'])
  return id
}

const ids = (list) => list.map((g) => g.id)
const exists = async (id) => Boolean(await db.get('SELECT 1 AS x FROM games WHERE id = ?', [id]))

test('lists parked and active games with players, newest first, and flags the active one', async () => {
  await db.run("DELETE FROM games")
  const old = await game({ scores: [5, 3], parked: true, activity: '2026-06-28T10:00:00Z' })
  const active = await game({ scores: [9, 4], activity: '2026-06-30T10:00:00Z' })
  const list = await svc.listUnfinished(db, 's1', { now: NOW })
  assert.deepEqual(ids(list), [active, old])
  assert.equal(list[0].is_active, true)
  assert.equal(list[1].is_active, false)
  assert.deepEqual(list[1].players.map((p) => [p.name, p.score]), [['Ann', 5], ['Bob', 3]])
  assert.equal(list[1].current_round, 1)
  assert.equal(list[1].win_condition_value, 121)
})

test('hides parked games older than 30 days but keeps the rows', async () => {
  await db.run("DELETE FROM games")
  const stale = await game({ scores: [5, 3], parked: true, activity: '2026-05-01T10:00:00Z' })
  const fresh = await game({ scores: [5, 3], parked: true, activity: '2026-06-20T10:00:00Z' })
  const list = await svc.listUnfinished(db, 's1', { now: NOW })
  assert.deepEqual(ids(list), [fresh])
  assert.equal(await exists(stale), true)
})

test('quietly discards games with no scores, keeps games with a committed round or a score', async () => {
  await db.run("DELETE FROM games")
  const empty = await game({ parked: true })
  const emptyActive = await game()
  const scored = await game({ scores: [0, 2], parked: true })
  const roundDone = await game({ scores: [0, 0], parked: true, committed: true })
  const list = await svc.listUnfinished(db, 's1', { now: NOW })
  assert.deepEqual(ids(list).sort(), [scored, roundDone].sort())
  assert.equal(await exists(empty), false)
  assert.equal(await exists(emptyActive), false)
  assert.equal(await db.get('SELECT COUNT(*) AS n FROM stats WHERE game_id = ?', [empty]).then((r) => r.n), 0)
})

test('leaves finished games and other boards alone', async () => {
  await db.run("DELETE FROM games")
  const done = await game({ scores: [121, 100], finalized: 1 })
  const other = await game({ sqid: 's2', players: ['p3'], scores: [4], parked: true })
  assert.deepEqual(await svc.listUnfinished(db, 's1', { now: NOW }), [])
  assert.equal(await exists(done), true)
  assert.deepEqual(ids(await svc.listUnfinished(db, 's2', { now: NOW })), [other])
})

test('resume makes the parked game active and parks the one being played', async () => {
  await db.run("DELETE FROM games")
  const parked = await game({ scores: [5, 3], parked: true, activity: '2026-06-28T10:00:00Z' })
  const playing = await game({ scores: [9, 4] })
  await svc.resumeGame(db, 's1', parked, { now: NOW })
  assert.equal((await db.get('SELECT abandoned_at FROM games WHERE id = ?', [parked])).abandoned_at, null)
  assert.equal(Boolean((await db.get('SELECT abandoned_at FROM games WHERE id = ?', [playing])).abandoned_at), true)
  const active = await db.query('SELECT id FROM games WHERE sqid_id = ? AND finalized = false AND abandoned_at IS NULL', ['s1'])
  assert.deepEqual(ids(active), [parked])
})

test('resume discards the game being played when it has no scores', async () => {
  await db.run("DELETE FROM games")
  const parked = await game({ scores: [5, 3], parked: true })
  const playing = await game()
  await svc.resumeGame(db, 's1', parked, { now: NOW })
  assert.equal(await exists(playing), false)
  assert.equal(await exists(parked), true)
})

test('resume refuses finished games, other boards, unknown ids and games over 30 days old', async () => {
  await db.run("DELETE FROM games")
  const done = await game({ scores: [121, 100], finalized: 1 })
  const other = await game({ sqid: 's2', players: ['p3'], scores: [4], parked: true })
  const stale = await game({ scores: [5, 3], parked: true, activity: '2026-05-01T10:00:00Z' })
  await assert.rejects(svc.resumeGame(db, 's1', done, { now: NOW }), { name: 'ConflictError' })
  await assert.rejects(svc.resumeGame(db, 's1', other, { now: NOW }), { name: 'NotFoundError' })
  await assert.rejects(svc.resumeGame(db, 's1', 'nope', { now: NOW }), { name: 'NotFoundError' })
  await assert.rejects(svc.resumeGame(db, 's1', stale, { now: NOW }), { name: 'ConflictError' })
})

test('resuming the game already active changes nothing', async () => {
  await db.run("DELETE FROM games")
  const playing = await game({ scores: [9, 4] })
  await svc.resumeGame(db, 's1', playing, { now: NOW })
  assert.equal((await db.get('SELECT abandoned_at FROM games WHERE id = ?', [playing])).abandoned_at, null)
})
