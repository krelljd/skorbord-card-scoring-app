import { test } from 'node:test'
import assert from 'node:assert/strict'
import { socketAuthMiddleware } from '../middleware/socketAuth.js'

function makeSocket(authSqid) {
  return {
    id: 'sock-1',
    handshake: { auth: { sqid: authSqid } },
    joined: [],
    join(room) { this.joined.push(room) }
  }
}

test('rejects a socket with no sqid', () => {
  const socket = makeSocket(undefined)
  let err = null
  socketAuthMiddleware(socket, (e) => { err = e })
  assert.ok(err instanceof Error)
})

test('rejects an invalid sqid', () => {
  const socket = makeSocket('!!')
  let err = null
  socketAuthMiddleware(socket, (e) => { err = e })
  assert.ok(err instanceof Error)
})

test('accepts a valid sqid and joins the room', () => {
  const socket = makeSocket('abcd')
  let called = false
  let errArg = 'unset'
  socketAuthMiddleware(socket, (e) => { called = true; errArg = e })
  assert.equal(called, true)
  assert.equal(errArg, undefined) // next() called with no error
  assert.equal(socket.sqid, 'abcd')
  assert.ok(socket.joined.includes('/sqid/abcd'))
})
