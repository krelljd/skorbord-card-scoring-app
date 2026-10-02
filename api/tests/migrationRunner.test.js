import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The runner and db layer log progress with emoji; keep that out of the test
// runner's stdout, where it can interleave with the runner's own event stream.
console.log = () => {}
console.error = () => {}

process.env.DATABASE_URL = 'sqlite:///tmp-test-migrations/migration-runner-test.db'
const { default: db } = await import('../db/database.js')
const { MigrationRunner, upSection, LEGACY_MIGRATIONS, BASELINE_MIGRATION } =
  await import('../db/migrations/migrationRunner.js')

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-migrations', import.meta.url), { recursive: true, force: true })
})

async function dropAll() {
  await db.run('PRAGMA foreign_keys = OFF')
  const objects = await db.query(
    "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','view')"
  )
  for (const { type, name } of objects) {
    await db.run(`DROP ${type.toUpperCase()} IF EXISTS "${name}"`)
  }
  await db.run('PRAGMA foreign_keys = ON')
}

test('upSection drops the Down section', () => {
  const sql = '-- +migrate Up\nCREATE TABLE a (id INTEGER);\n-- +migrate Down\nDROP TABLE a;'
  assert.ok(!upSection(sql).includes('DROP TABLE'))
  assert.ok(upSection(sql).includes('CREATE TABLE a'))
})

test('an empty database gets the baseline schema and seed rows', async () => {
  await dropAll()
  await new MigrationRunner(db).run()

  const applied = (await db.query('SELECT name FROM migrations')).map((r) => r.name)
  assert.deepEqual(applied, [BASELINE_MIGRATION])

  const stats = await db.query('PRAGMA table_info(stats)')
  assert.ok(stats.some((c) => c.name === 'player_order'))
  const gameTypes = await db.query('SELECT id FROM game_types ORDER BY id')
  assert.deepEqual(gameTypes.map((r) => r.id), ['blitz', 'cribbage', 'golf', 'oklahomagin', 'pitch'])
})

test('running again applies nothing', async () => {
  const before = await db.query('SELECT * FROM migrations')
  await new MigrationRunner(db).run()
  assert.deepEqual(await db.query('SELECT * FROM migrations'), before)
})

test('a database that applied both legacy migrations is baselined without rerunning the baseline', async () => {
  // Keep the existing tables (the "production" state), but record the legacy history only.
  await db.run('DELETE FROM migrations')
  for (const name of LEGACY_MIGRATIONS) {
    await db.run('INSERT INTO migrations (name) VALUES (?)', [name])
  }
  await db.run("INSERT INTO sqids (id, name) VALUES ('keep', 'keep')")

  await new MigrationRunner(db).run() // would fail with "table already exists" if it reran the baseline

  const applied = (await db.query('SELECT name FROM migrations ORDER BY name')).map((r) => r.name)
  assert.deepEqual(applied, [BASELINE_MIGRATION, ...LEGACY_MIGRATIONS].sort())
  assert.equal((await db.query("SELECT id FROM sqids WHERE id = 'keep'")).length, 1)
})

test('a database with only some legacy migrations is rejected', async () => {
  await db.run('DELETE FROM migrations')
  await db.run('INSERT INTO migrations (name) VALUES (?)', [LEGACY_MIGRATIONS[0]])
  await assert.rejects(() => new MigrationRunner(db).run(), /only part of the legacy migrations/)
})

test('a failing migration rolls back and is not recorded; the Down section is not executed', async () => {
  await dropAll()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'))
  try {
    fs.writeFileSync(path.join(dir, '001_ok.sql'),
      "-- +migrate Up\nCREATE TABLE t1 (v TEXT);\nINSERT INTO t1 VALUES ('a;b');\n-- +migrate Down\nDROP TABLE t1;\n")
    fs.writeFileSync(path.join(dir, '002_bad.sql'),
      '-- +migrate Up\nCREATE TABLE t2 (id INTEGER);\nCREATE TABLE t2 (id INTEGER);\n')

    await assert.rejects(() => new MigrationRunner(db, { migrationsDir: dir }).run())

    // 001 applied: table exists, semicolon inside the string survived, Down did not run.
    assert.deepEqual(await db.query('SELECT v FROM t1'), [{ v: 'a;b' }])
    // 002 rolled back entirely.
    const t2 = await db.query("SELECT name FROM sqlite_master WHERE name = 't2'")
    assert.equal(t2.length, 0)
    const applied = (await db.query('SELECT name FROM migrations')).map((r) => r.name)
    assert.deepEqual(applied, ['001_ok.sql'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
