import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

process.env.DATABASE_URL = 'sqlite:///tmp-test/rivalry-admin-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const { deleteRivalryCascade } = await import('../utils/rivalryAdmin.js')

async function seedRivalry(db, { sqidId, rivalryId, playerIds, gameTypeId, gameId, statIds }) {
  await db.run('INSERT INTO rivalries (id, sqid_id) VALUES (?, ?)', [rivalryId, sqidId])
  for (const playerId of playerIds) {
    await db.run('INSERT INTO rivalry_players (rivalry_id, player_id) VALUES (?, ?)', [rivalryId, playerId])
  }
  await db.run('INSERT INTO rivalry_game_types (rivalry_id, game_type_id) VALUES (?, ?)', [rivalryId, gameTypeId])
  await db.run(
    'INSERT INTO rivalry_stats (id, rivalry_id, game_type_id, total_games) VALUES (?, ?, ?, 1)',
    [`${rivalryId}-stats`, rivalryId, gameTypeId]
  )
  for (const playerId of playerIds) {
    await db.run(
      'INSERT INTO rivalry_player_stats (id, rivalry_id, player_id, game_type_id, total_games) VALUES (?, ?, ?, ?, 1)',
      [`${rivalryId}-${playerId}-stats`, rivalryId, playerId, gameTypeId]
    )
  }
  await db.run(
    'INSERT INTO games (id, sqid_id, game_type_id, rivalry_id, finalized) VALUES (?, ?, ?, ?, 1)',
    [gameId, sqidId, gameTypeId, rivalryId]
  )
  for (let i = 0; i < playerIds.length; i++) {
    await db.run(
      'INSERT INTO stats (id, game_id, player_id, score) VALUES (?, ?, ?, ?)',
      [statIds[i], gameId, playerIds[i], 10 + i]
    )
  }
}

before(async () => {
  await applySchema(db)
  await db.run("INSERT INTO sqids (id, name) VALUES ('sqidB', 'Sqid B')")
  await db.run("INSERT INTO players (id, sqid_id, name, color) VALUES ('pA', 'sqidB', 'Ann', 'primary')")
  await db.run("INSERT INTO players (id, sqid_id, name, color) VALUES ('pB', 'sqidB', 'Ben', 'secondary')")

  await seedRivalry(db, {
    sqidId: 'sqidB', rivalryId: 'riv-target', playerIds: ['pA', 'pB'],
    gameTypeId: 'cribbage', gameId: 'game-target', statIds: ['stat-target-a', 'stat-target-b']
  })
  await seedRivalry(db, {
    sqidId: 'sqidB', rivalryId: 'riv-keep', playerIds: ['pA', 'pB'],
    gameTypeId: 'golf', gameId: 'game-keep', statIds: ['stat-keep-a', 'stat-keep-b']
  })
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test', import.meta.url), { recursive: true, force: true })
})

test('throws NotFoundError for a rivalry that does not belong to the sqid', async () => {
  await assert.rejects(
    deleteRivalryCascade(db, { sqidId: 'wrong-sqid', rivalryId: 'riv-target' }),
    (err) => err.name === 'NotFoundError'
  )
})

test('deletes the rivalry, its games/stats, and its cascaded rows, leaving other rivalries untouched', async () => {
  await deleteRivalryCascade(db, { sqidId: 'sqidB', rivalryId: 'riv-target' })

  assert.equal(await db.get('SELECT id FROM rivalries WHERE id = ?', ['riv-target']), undefined)
  assert.equal(await db.get('SELECT id FROM games WHERE id = ?', ['game-target']), undefined)
  assert.deepEqual(await db.query('SELECT id FROM stats WHERE game_id = ?', ['game-target']), [])
  assert.deepEqual(await db.query('SELECT * FROM rivalry_players WHERE rivalry_id = ?', ['riv-target']), [])
  assert.deepEqual(await db.query('SELECT * FROM rivalry_game_types WHERE rivalry_id = ?', ['riv-target']), [])
  assert.deepEqual(await db.query('SELECT * FROM rivalry_stats WHERE rivalry_id = ?', ['riv-target']), [])
  assert.deepEqual(await db.query('SELECT * FROM rivalry_player_stats WHERE rivalry_id = ?', ['riv-target']), [])

  assert.ok(await db.get('SELECT id FROM rivalries WHERE id = ?', ['riv-keep']))
  assert.ok(await db.get('SELECT id FROM games WHERE id = ?', ['game-keep']))
  const keptStats = await db.query('SELECT id FROM stats WHERE game_id = ?', ['game-keep'])
  assert.equal(keptStats.length, 2)

  const survivingPlayers = await db.query('SELECT id FROM players WHERE sqid_id = ?', ['sqidB'])
  assert.equal(survivingPlayers.length, 2)
})
