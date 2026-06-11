import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

// Point the singleton at a throwaway DB under api/ before importing it.
process.env.DATABASE_URL = 'sqlite:///tmp-test/hardening-test.db'
const { default: db } = await import('../db/database.js')

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test', import.meta.url), { recursive: true, force: true })
})

test('concurrent first queries all see a fully-initialized handle', async () => {
  // Fire parallel queries as the very first DB access (cold start).
  const results = await Promise.all([
    db.query('PRAGMA busy_timeout'),
    db.query('PRAGMA journal_mode'),
    db.query('PRAGMA busy_timeout')
  ])

  // busy_timeout PRAGMA returns [{ timeout: 5000 }]
  assert.equal(results[0][0].timeout, 5000)
  assert.equal(results[2][0].timeout, 5000)
  // WAL mode applied
  assert.equal(String(results[1][0].journal_mode).toLowerCase(), 'wal')
})
