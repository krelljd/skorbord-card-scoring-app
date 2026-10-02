import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

process.env.DATABASE_URL = 'sqlite:///tmp-test-playerAdmin/player-admin-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const { renamePlayer } = await import('../utils/playerAdmin.js')

before(async () => {
  await applySchema(db)
  await db.run("INSERT INTO sqids (id, name) VALUES ('sqidA', 'Sqid A')")
  await db.run("INSERT INTO players (id, sqid_id, name, color) VALUES ('p1', 'sqidA', 'Alice', 'primary')")
  await db.run("INSERT INTO players (id, sqid_id, name, color) VALUES ('p2', 'sqidA', 'Bob', 'secondary')")
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-playerAdmin', import.meta.url), { recursive: true, force: true })
})

test('renames a player and returns the updated row', async () => {
  const updated = await renamePlayer(db, { sqidId: 'sqidA', playerId: 'p1', name: '  Alicia  ' })
  assert.equal(updated.name, 'Alicia')
  const row = await db.get('SELECT name FROM players WHERE id = ?', ['p1'])
  assert.equal(row.name, 'Alicia')
})

test('rejects a rename that collides case-insensitively with another player', async () => {
  await assert.rejects(
    renamePlayer(db, { sqidId: 'sqidA', playerId: 'p2', name: 'alicia' }),
    (err) => err.name === 'ConflictError'
  )
})

test('throws NotFoundError for a player outside the sqid', async () => {
  await assert.rejects(
    renamePlayer(db, { sqidId: 'other-sqid', playerId: 'p2', name: 'Bobby' }),
    (err) => err.name === 'NotFoundError'
  )
})

test('rejects an empty name', async () => {
  await assert.rejects(
    renamePlayer(db, { sqidId: 'sqidA', playerId: 'p2', name: '   ' }),
    (err) => err.name === 'ValidationError'
  )
})
