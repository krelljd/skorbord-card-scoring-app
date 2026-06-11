import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScoreUpdatePayload } from '../utils/scoreBroadcast.js'

test('builds the canonical score_update payload for a single tap', () => {
  const stats = [{ player_id: 'p1', score: 10 }, { player_id: 'p2', score: 4 }]
  const payload = buildScoreUpdatePayload({
    sqid: 'abcd',
    gameId: 'g1',
    stats,
    playerId: 'p1',
    change: 2,
    winnerId: null,
    originSocketId: 'sock123'
  })

  assert.equal(payload.sqid, 'abcd')
  assert.equal(payload.gameId, 'g1')
  assert.deepEqual(payload.stats, stats)
  assert.equal(payload.playerId, 'p1')
  assert.equal(payload.change, 2)
  assert.equal(payload.winnerId, null)
  assert.equal(payload.originSocketId, 'sock123')
  assert.equal(typeof payload.timestamp, 'string')
})

test('defaults optional tally fields to null', () => {
  const payload = buildScoreUpdatePayload({ sqid: 'abcd', gameId: 'g1', stats: [] })
  assert.equal(payload.playerId, null)
  assert.equal(payload.change, null)
  assert.equal(payload.winnerId, null)
  assert.equal(payload.originSocketId, null)
})
