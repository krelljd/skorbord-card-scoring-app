import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyPinHandler } from '../routes/admin.js'

function makeRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

test('verifyPinHandler responds success when reached (auth already passed by middleware)', () => {
  const res = makeRes()
  verifyPinHandler({}, res)
  assert.equal(res.body.success, true)
  assert.equal(res.body.data.message, 'PIN verified')
})
