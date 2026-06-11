import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retryOnBusy } from '../db/database.js'

test('retries on SQLITE_BUSY then succeeds', async () => {
  let calls = 0
  const result = await retryOnBusy(async () => {
    calls++
    if (calls < 3) {
      const err = new Error('database is locked')
      err.code = 'SQLITE_BUSY'
      throw err
    }
    return 'ok'
  }, { retries: 5, delayMs: 1 })

  assert.equal(result, 'ok')
  assert.equal(calls, 3)
})

test('does not retry non-busy errors', async () => {
  let calls = 0
  await assert.rejects(
    () => retryOnBusy(async () => {
      calls++
      const err = new Error('syntax error')
      err.code = 'SQLITE_ERROR'
      throw err
    }, { retries: 5, delayMs: 1 }),
    /syntax error/
  )
  assert.equal(calls, 1)
})

test('gives up after exhausting retries', async () => {
  let calls = 0
  await assert.rejects(
    () => retryOnBusy(async () => {
      calls++
      const err = new Error('locked')
      err.code = 'SQLITE_BUSY'
      throw err
    }, { retries: 2, delayMs: 1 }),
    /locked/
  )
  assert.equal(calls, 3) // initial + 2 retries
})
