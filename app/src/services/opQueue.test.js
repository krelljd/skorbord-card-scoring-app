import { describe, it, expect } from 'vitest'
import { createOpQueue, flushQueue } from './opQueue.js'

const memory = () => {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v }, data }
}
const tap = (n, gameId = 'g1') => ({ opId: `op${n}`, gameId, playerId: 'p1', delta: n })
const netErr = () => Object.assign(new Error('offline'), { status: 0 })

describe('opQueue', () => {
  it('keeps taps across a reload and only for the same game', () => {
    const storage = memory()
    const q = createOpQueue(storage)
    q.load('g1')
    q.push(tap(1)); q.push(tap(2, 'other'))
    const after = createOpQueue(storage)
    expect(after.load('g1')).toBe(1)
    expect(after.peek().opId).toBe('op1')
  })

  it('replays in order and empties the queue', async () => {
    const q = createOpQueue(memory())
    q.push(tap(1)); q.push(tap(2)); q.push(tap(3))
    const seen = []
    const result = await flushQueue(q, async (op) => { seen.push(op.opId) })
    expect(seen).toEqual(['op1', 'op2', 'op3'])
    expect(result).toMatchObject({ sent: 3, stalled: false })
    expect(q.size).toBe(0)
  })

  it('stops on a network error and keeps the rest queued', async () => {
    const q = createOpQueue(memory())
    q.push(tap(1)); q.push(tap(2)); q.push(tap(3))
    let calls = 0
    const result = await flushQueue(q, async () => { if (++calls === 2) throw netErr() })
    expect(result).toMatchObject({ sent: 1, stalled: true })
    expect(q.size).toBe(2)
    expect(q.peek().opId).toBe('op2')
  })

  it('drops a tap the server refuses and carries on', async () => {
    const q = createOpQueue(memory())
    q.push(tap(1)); q.push(tap(2))
    const result = await flushQueue(q, async (op) => {
      if (op.opId === 'op1') throw Object.assign(new Error('finalized'), { status: 409 })
    })
    expect(result.sent).toBe(1)
    expect(result.dropped).toHaveLength(1)
    expect(q.size).toBe(0)
  })
})
