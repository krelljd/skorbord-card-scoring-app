import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createScoreRateLimiter } from '../middleware/scoreRateLimit.js'

test('allows up to capacity then blocks, per sqid', () => {
  const limiter = createScoreRateLimiter({ capacity: 3, refillPerSec: 0 })
  const now = 1000
  assert.equal(limiter.take('a', now), true)
  assert.equal(limiter.take('a', now), true)
  assert.equal(limiter.take('a', now), true)
  assert.equal(limiter.take('a', now), false) // 4th exceeds capacity
  assert.equal(limiter.take('b', now), true)   // different sqid, own bucket
})

test('refills over time', () => {
  const limiter = createScoreRateLimiter({ capacity: 2, refillPerSec: 1 })
  const t0 = 0
  assert.equal(limiter.take('a', t0), true)
  assert.equal(limiter.take('a', t0), true)
  assert.equal(limiter.take('a', t0), false)
  assert.equal(limiter.take('a', t0 + 1000), true) // 1 token refilled after 1s
  assert.equal(limiter.take('a', t0 + 1000), false)
})

test('middleware returns 429 when blocked', () => {
  const limiter = createScoreRateLimiter({ capacity: 1, refillPerSec: 0 })
  const mw = limiter.middleware
  const makeRes = () => {
    const res = { statusCode: 200, body: null }
    res.status = (c) => { res.statusCode = c; return res }
    res.json = (b) => { res.body = b; return res }
    return res
  }

  let nextCalls = 0
  const req = { params: { sqid: 'x' } }
  mw(req, makeRes(), () => { nextCalls++ })
  assert.equal(nextCalls, 1)

  const res2 = makeRes()
  mw(req, res2, () => { nextCalls++ })
  assert.equal(nextCalls, 1) // not called again
  assert.equal(res2.statusCode, 429)
  assert.equal(res2.body.success, false)
})
