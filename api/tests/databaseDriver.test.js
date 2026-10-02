import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

process.env.DATABASE_URL = 'sqlite:///tmp-test-driver/driver-test.db'
const { default: db, bindParams } = await import('../db/database.js')

before(async () => {
  await db.run('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, flag BOOLEAN, at TEXT)')
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-driver', import.meta.url), { recursive: true, force: true })
})

test('bindParams converts booleans, undefined, and Dates', () => {
  const date = new Date('2026-01-02T03:04:05.000Z')
  assert.deepEqual(bindParams([true, false, undefined, null, 'x', 3, date]), [1, 0, null, null, 'x', 3, '2026-01-02T03:04:05.000Z'])
  assert.deepEqual(bindParams(), [])
})

test('run binds booleans and undefined, and reports changes and lastID', async () => {
  const first = await db.run('INSERT INTO t (name, flag, at) VALUES (?, ?, ?)', ['a', true, undefined])
  assert.equal(first.changes, 1)
  assert.equal(first.lastID, 1)
  const second = await db.run('INSERT INTO t (name, flag, at) VALUES (?, ?, ?)', ['b', false, new Date('2026-01-02T00:00:00Z')])
  assert.equal(second.lastID, 2)

  const rows = await db.query('SELECT name, flag, at FROM t ORDER BY id')
  assert.deepEqual(rows, [
    { name: 'a', flag: 1, at: null },
    { name: 'b', flag: 0, at: '2026-01-02T00:00:00.000Z' }
  ])

  const updated = await db.run('UPDATE t SET flag = ? WHERE flag = ?', [true, false])
  assert.equal(updated.changes, 1)
})

test('get returns a row, or undefined when nothing matches', async () => {
  assert.equal((await db.get('SELECT name FROM t WHERE id = ?', [1])).name, 'a')
  assert.equal(await db.get('SELECT name FROM t WHERE id = ?', [999]), undefined)
})

test('query handles PRAGMA reads and returns [] for statements that return no rows', async () => {
  const fk = await db.query('PRAGMA foreign_keys')
  assert.equal(fk[0].foreign_keys, 1)
  assert.deepEqual(await db.query('DELETE FROM t WHERE id = 999'), [])
})

test('exec runs a multi-statement script', async () => {
  await db.exec("INSERT INTO t (name) VALUES ('x;y'); INSERT INTO t (name) VALUES ('z');")
  const names = (await db.query("SELECT name FROM t WHERE name IN ('x;y', 'z') ORDER BY name")).map((r) => r.name)
  assert.deepEqual(names, ['x;y', 'z'])
})

test('SQL errors reject with the SQLite error code', async () => {
  const silence = console.error
  console.error = () => {}
  try {
    await assert.rejects(() => db.run('INSERT INTO t (id, name) VALUES (1, ?)', ['dup']), (err) => /^SQLITE_CONSTRAINT/.test(err.code))
  } finally {
    console.error = silence
  }
})
