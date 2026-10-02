import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

console.log = () => {}
console.error = () => {}

process.env.DATABASE_URL = 'sqlite:///tmp-test-scoreparts/score-parts-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const { upSection } = await import('../db/migrations/migrationRunner.js')

before(async () => {
  await applySchema(db)
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-scoreparts', import.meta.url), { recursive: true, force: true })
})

test('the seeded cribbage type has parts and other types do not', async () => {
  const rows = await db.query('SELECT id, score_parts FROM game_types ORDER BY id')
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.score_parts]))
  assert.equal(byId.cribbage, '["play","hand","crib"]')
  assert.equal(byId.pitch, null)
  assert.equal(byId.golf, null)
})

test('a Cribbage type with another id gets parts from 005, by name, and other types are untouched', async () => {
  await db.run("INSERT INTO game_types (id, name, win_condition, is_win_condition) VALUES ('custom-1', ' Cribbage ', 121, 1)")
  await db.run("INSERT INTO game_types (id, name, win_condition, is_win_condition) VALUES ('custom-2', 'Cribbage Variant', 121, 1)")
  const sql = fs.readFileSync(new URL('../db/migrations/005_cribbage_parts_by_name.sql', import.meta.url), 'utf8')
  await db.exec(upSection(sql))
  const got = async (id) => (await db.get('SELECT score_parts FROM game_types WHERE id = ?', [id])).score_parts
  assert.equal(await got('custom-1'), '["play","hand","crib"]')
  assert.equal(await got('custom-2'), null)
  assert.equal(await got('pitch'), null)
})
