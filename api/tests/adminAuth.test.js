import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireAdminPin } from '../middleware/adminAuth.js'

function makeRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

test('fails closed with 503 when ADMIN_PIN is not configured', () => {
  delete process.env.ADMIN_PIN
  const req = { headers: {} }
  const res = makeRes()
  let nextCalled = false
  requireAdminPin(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.success, false)
})

test('rejects a missing X-Admin-Pin header', () => {
  process.env.ADMIN_PIN = 'secret123'
  const req = { headers: {} }
  const res = makeRes()
  let err = null
  requireAdminPin(req, res, (e) => { err = e })
  assert.ok(err instanceof Error)
  assert.equal(err.name, 'ForbiddenError')
})

test('rejects a wrong X-Admin-Pin header', () => {
  process.env.ADMIN_PIN = 'secret123'
  const req = { headers: { 'x-admin-pin': 'wrong' } }
  const res = makeRes()
  let err = null
  requireAdminPin(req, res, (e) => { err = e })
  assert.ok(err instanceof Error)
  assert.equal(err.name, 'ForbiddenError')
})

test('calls next() with no error for the correct PIN', () => {
  process.env.ADMIN_PIN = 'secret123'
  const req = { headers: { 'x-admin-pin': 'secret123' } }
  const res = makeRes()
  let called = false
  let errArg = 'unset'
  requireAdminPin(req, res, (e) => { called = true; errArg = e })
  assert.equal(called, true)
  assert.equal(errArg, undefined)
})

test('rejects a PIN of different length without throwing', () => {
  process.env.ADMIN_PIN = 'secret123'
  const req = { headers: { 'x-admin-pin': 'short' } }
  const res = makeRes()
  let err = null
  assert.doesNotThrow(() => {
    requireAdminPin(req, res, (e) => { err = e })
  })
  assert.equal(err.name, 'ForbiddenError')
})
