import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

process.env.DATABASE_URL = 'sqlite:///tmp-test/transaction-queue-test.db'
const { default: db } = await import('../db/database.js')

before(async () => {
  await db.run('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)')
  await db.run('INSERT INTO counter (id, value) VALUES (1, 0)')
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test', import.meta.url), { recursive: true, force: true })
})

test('two concurrent read-then-write +1 transactions on the same row both apply with no SQLITE_ERROR', async () => {
  const increment = () => db.transaction(async (tx) => {
    const row = await tx.get('SELECT value FROM counter WHERE id = 1')
    const next = row.value + 1
    await tx.run('UPDATE counter SET value = ? WHERE id = 1', [next])
    return next
  })

  const results = await Promise.all([increment(), increment()])

  const final = await db.get('SELECT value FROM counter WHERE id = 1')
  assert.equal(final.value, 2)
  assert.deepEqual(results.slice().sort(), [1, 2])
})

test('a transaction that throws rolls back, and a transaction queued behind it still runs', async () => {
  await db.run('UPDATE counter SET value = 10 WHERE id = 1')

  const throwing = db.transaction(async (tx) => {
    await tx.run('UPDATE counter SET value = ? WHERE id = 1', [999])
    throw new Error('simulated failure')
  })

  const succeeding = db.transaction(async (tx) => {
    const row = await tx.get('SELECT value FROM counter WHERE id = 1')
    await tx.run('UPDATE counter SET value = ? WHERE id = 1', [row.value + 1])
    return row.value + 1
  })

  await assert.rejects(throwing, /simulated failure/)
  await succeeding

  const final = await db.get('SELECT value FROM counter WHERE id = 1')
  // Rollback must have restored 10 before the queued transaction read it,
  // so the queued +1 lands on 10, not on the throwing transaction's 999.
  assert.equal(final.value, 11)
})
