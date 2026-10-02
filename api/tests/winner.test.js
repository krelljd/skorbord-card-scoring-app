import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeWinner, resolveWinCondition } from '../utils/winner.js'

const win10 = { win_condition_type: 'win', win_condition_value: 10 }
const lose100 = { win_condition_type: 'lose', win_condition_value: 100 }

test('no winner without a game or scores', () => {
  assert.equal(computeWinner(null, []), null)
  assert.equal(computeWinner(win10, []), null)
})

test('"win" games: highest score at or above the target wins', () => {
  const scores = [
    { player_id: 'p1', score: 8 },
    { player_id: 'p2', score: 11 },
    { player_id: 'p3', score: 10 }
  ]
  assert.equal(computeWinner(win10, scores), 'p2')
})

test('"win" games: nobody at the target means no winner', () => {
  assert.equal(computeWinner(win10, [{ player_id: 'p1', score: 5 }]), null)
})

test('"lose" games: once someone reaches the target, the lowest positive score wins', () => {
  const scores = [
    { player_id: 'p1', score: 100 },
    { player_id: 'p2', score: 40 },
    { player_id: 'p3', score: 60 }
  ]
  assert.equal(computeWinner(lose100, scores), 'p2')
})

test('"lose" games: nobody at the target means no winner', () => {
  assert.equal(computeWinner(lose100, [{ player_id: 'p1', score: 40 }]), null)
})

test('only positive scores can win', () => {
  assert.equal(computeWinner(win10, [{ player_id: 'p1', score: 0 }]), null)
  assert.equal(computeWinner(lose100, [{ player_id: 'p1', score: 100 }, { player_id: 'p2', score: 0 }]), 'p1')
})

test('falls back to the game type defaults when the game has no custom condition', () => {
  const cribbage = { is_win_condition: 1, win_condition: 121, loss_condition: null }
  const golf = { is_win_condition: 0, win_condition: null, loss_condition: 100 }
  assert.deepEqual(resolveWinCondition(cribbage), { type: 'win', value: 121 })
  assert.deepEqual(resolveWinCondition(golf), { type: 'lose', value: 100 })
  assert.equal(computeWinner(cribbage, [{ player_id: 'p1', score: 121 }]), 'p1')
  assert.equal(computeWinner({}, [{ player_id: 'p1', score: 5 }]), null)
})
