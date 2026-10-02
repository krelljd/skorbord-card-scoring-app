import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

console.log = () => {}
console.error = () => {}

process.env.DATABASE_URL = 'sqlite:///tmp-test-roundservice/round-service-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const rounds = await import('../services/rounds.js')
const { findTotalMismatches } = await import('../db/roundTotals.js')

let gameCounter = 0

before(async () => {
  await applySchema(db)
  await db.run("INSERT INTO sqids (id, name) VALUES ('s1', 's1')")
  for (const [id, name] of [['p1', 'Ann'], ['p2', 'Bob'], ['p3', 'Cy']]) {
    await db.run('INSERT INTO players (id, sqid_id, name) VALUES (?, ?, ?)', [id, 's1', name])
  }
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test-roundservice', import.meta.url), { recursive: true, force: true })
})

/** A new game with open round 1, the way the create-game route builds it. */
async function newGame({ playerIds = ['p1', 'p2'], winValue = 10, type = 'win', finalized = 0 } = {}) {
  const id = `g${++gameCounter}`
  await db.run(
    `INSERT INTO games (id, sqid_id, game_type_id, started_at, finalized, dealer_id, win_condition_type, win_condition_value)
     VALUES (?, 's1', 'cribbage', '2026-01-01T00:00:00Z', ?, ?, ?, ?)`,
    [id, finalized, playerIds[0], type, winValue]
  )
  for (const [i, playerId] of playerIds.entries()) {
    await db.run('INSERT INTO stats (id, game_id, player_id, score, player_order) VALUES (?, ?, ?, 0, ?)', [`${id}-${playerId}`, id, playerId, i + 1])
  }
  await db.run("INSERT INTO rounds (id, game_id, round_number, dealer_id, status) VALUES (?, ?, 1, ?, 'open')", [`${id}-r1`, id, playerIds[0]])
  for (const playerId of playerIds) {
    await db.run('INSERT INTO round_scores (round_id, game_id, player_id, points) VALUES (?, ?, ?, 0)', [`${id}-r1`, id, playerId])
  }
  return id
}

const total = async (gameId, playerId) => (await db.get('SELECT score FROM stats WHERE game_id = ? AND player_id = ?', [gameId, playerId])).score
const player = (state, id) => state.players.find((p) => p.player_id === id)

test('taps add to the open draft and keep stats.score equal to committed plus draft', async () => {
  const g = await newGame()
  await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 5 }] })
  await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: -2 }, { playerId: 'p2', delta: 3 }] })

  const state = await rounds.getRoundState(db, g)
  assert.equal(player(state, 'p1').draft, 3)
  assert.equal(player(state, 'p2').draft, 3)
  assert.equal(await total(g, 'p1'), 3)
  assert.equal(state.open_round, 1)
  assert.deepEqual(await findTotalMismatches(db), [])
})

test('setDraft sets points or derives the draft from a total, and 0 records a clear', async () => {
  const g = await newGame()
  await rounds.setDraft(db, { gameId: g, playerId: 'p1', points: 7 })
  assert.equal(await total(g, 'p1'), 7)
  await rounds.setDraft(db, { gameId: g, playerId: 'p1', total: 9 })
  assert.equal(await total(g, 'p1'), 9)
  await rounds.setDraft(db, { gameId: g, playerId: 'p1', points: 0 })
  assert.equal(await total(g, 'p1'), 0)
  const kinds = (await db.query('SELECT kind FROM score_audit WHERE game_id = ? ORDER BY id', [g])).map((r) => r.kind)
  assert.deepEqual(kinds, ['set', 'set', 'clear'])
})

test('a repeated opId is applied once', async () => {
  const g = await newGame()
  const first = await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 4 }], opId: 'op-1' })
  const second = await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 4 }], opId: 'op-1' })
  assert.equal(first.duplicate, false)
  assert.equal(second.duplicate, true)
  assert.equal(await total(g, 'p1'), 4)
})

test('invalid input is rejected without changing anything', async () => {
  const g = await newGame()
  await assert.rejects(() => rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 1.5 }] }), /integer/)
  await assert.rejects(() => rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'nobody', delta: 1 }] }), /Player not found/)
  await assert.rejects(() => rounds.addToDraft(db, { gameId: g, entries: [] }), /At least one/)
  await assert.rejects(() => rounds.addToDraft(db, { gameId: 'missing', entries: [{ playerId: 'p1', delta: 1 }] }), /Game not found/)
  assert.equal(await total(g, 'p1'), 0)
})

test('a tap that would leave the allowed range is rejected and rolled back, including other players in the same call', async () => {
  const g = await newGame()
  await assert.rejects(
    () => rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p2', delta: 5 }, { playerId: 'p1', delta: 1000 }] }),
    /Score must be between/
  )
  assert.equal(await total(g, 'p1'), 0)
  assert.equal(await total(g, 'p2'), 0)
  assert.deepEqual(await findTotalMismatches(db), [])
})

test('commit saves the round, advances the dealer, and opens the next round', async () => {
  const g = await newGame({ playerIds: ['p1', 'p2', 'p3'] })
  await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 4 }, { playerId: 'p3', delta: 2 }] })
  await rounds.commitRound(db, { gameId: g, expectedRound: 1 })

  const state = await rounds.getRoundState(db, g)
  assert.deepEqual(state.rounds.map((r) => [r.round_number, r.status]), [[1, 'committed'], [2, 'open']])
  assert.deepEqual(state.rounds[0].scores, { p1: 4, p2: 0, p3: 2 })
  assert.equal(state.rounds[0].dealer_id, 'p1') // the dealer for the round that was just saved
  assert.equal(state.game.dealer_id, 'p2') // advanced in player order
  assert.equal(state.rounds[1].dealer_id, 'p2')
  assert.equal(player(state, 'p1').committed_total, 4)
  assert.equal(player(state, 'p1').draft, 0)
  assert.equal(await total(g, 'p1'), 4)
})

test('dealer advance wraps around the table', async () => {
  const g = await newGame({ playerIds: ['p1', 'p2'] })
  await rounds.commitRound(db, { gameId: g })
  await rounds.commitRound(db, { gameId: g })
  assert.equal((await rounds.getRoundState(db, g)).game.dealer_id, 'p1')
})

test('committing a stale round number is a conflict and a second commit cannot double-save', async () => {
  const g = await newGame()
  await rounds.commitRound(db, { gameId: g, expectedRound: 1 })
  await assert.rejects(() => rounds.commitRound(db, { gameId: g, expectedRound: 1 }), /not the open round/)
  assert.equal((await rounds.getRoundState(db, g)).rounds.length, 2)
})

test('the winner is only set when confirmed at commit, and must match the standings', async () => {
  const g = await newGame({ winValue: 10 })
  await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 12 }] })

  // Draft alone never produces a candidate.
  assert.equal((await rounds.getRoundState(db, g)).winner_candidate, null)

  // Wrong confirmation is rejected and the round stays open.
  await assert.rejects(() => rounds.commitRound(db, { gameId: g, winnerId: 'p2' }), /not the winner/)
  assert.equal((await rounds.getRoundState(db, g)).open_round, 1)

  // Commit without confirming: candidate is reported, winner_id stays unset.
  const g2 = await newGame({ winValue: 10 })
  await rounds.addToDraft(db, { gameId: g2, entries: [{ playerId: 'p1', delta: 12 }] })
  await rounds.commitRound(db, { gameId: g2 })
  let state = await rounds.getRoundState(db, g2)
  assert.equal(state.winner_candidate, 'p1')
  assert.equal(state.game.winner_id, null)

  // Commit with confirmation sets it.
  await rounds.commitRound(db, { gameId: g, winnerId: 'p1' })
  state = await rounds.getRoundState(db, g)
  assert.equal(state.game.winner_id, 'p1')
})

test('editing a saved round recalculates totals and clears a winner the scores no longer support', async () => {
  const g = await newGame({ winValue: 10 })
  await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 12 }] })
  await rounds.commitRound(db, { gameId: g, winnerId: 'p1' })
  assert.equal((await rounds.getRoundState(db, g)).game.winner_id, 'p1')

  await rounds.editRound(db, { gameId: g, roundNumber: 1, playerId: 'p1', points: 7 })
  const state = await rounds.getRoundState(db, g)
  assert.equal(await total(g, 'p1'), 7)
  assert.equal(state.game.winner_id, null)
  assert.equal(state.winner_candidate, null)
  assert.equal(state.rounds[0].edited.p1, true)
  assert.equal(state.rounds[0].revision, 2) // commit + edit
  assert.deepEqual(await findTotalMismatches(db), [])
})

test('edit rejects a stale revision, the open round, unknown rounds, and bad totals', async () => {
  const g = await newGame()
  await rounds.commitRound(db, { gameId: g })
  await assert.rejects(() => rounds.editRound(db, { gameId: g, roundNumber: 1, playerId: 'p1', points: 3, expectedRevision: 99 }), /changed by someone else/)
  await assert.rejects(() => rounds.editRound(db, { gameId: g, roundNumber: 2, playerId: 'p1', points: 3 }), /open round/)
  await assert.rejects(() => rounds.editRound(db, { gameId: g, roundNumber: 9, playerId: 'p1', points: 3 }), /Round not found/)
  await assert.rejects(() => rounds.editRound(db, { gameId: g, roundNumber: 1, playerId: 'p1', points: 5000 }), /Score must be between/)
  await rounds.editRound(db, { gameId: g, roundNumber: 1, playerId: 'p1', points: 3, expectedRevision: 1 })
  assert.equal(await total(g, 'p1'), 3)
})

test('undo reopens the last round, merges taps already made in the new round, and restores the dealer', async () => {
  const g = await newGame({ winValue: 10 })
  await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 12 }] })
  await rounds.commitRound(db, { gameId: g, winnerId: 'p1' })
  await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p2', delta: 3 }] }) // tapped into round 2 before undo

  await rounds.undoCommit(db, { gameId: g })
  const state = await rounds.getRoundState(db, g)
  assert.deepEqual(state.rounds.map((r) => [r.round_number, r.status]), [[1, 'open']])
  assert.deepEqual(state.rounds[0].scores, { p1: 12, p2: 3 })
  assert.equal(state.game.dealer_id, 'p1')
  assert.equal(state.game.winner_id, null)
  assert.equal(state.winner_candidate, null)
  assert.equal(await total(g, 'p1'), 12)
  assert.deepEqual(await findTotalMismatches(db), [])
})

test('there is nothing to undo on a fresh game, and legacy rounds cannot be reopened', async () => {
  const g = await newGame()
  await assert.rejects(() => rounds.undoCommit(db, { gameId: g }), /no saved round/)

  await db.run("UPDATE rounds SET status = 'committed', is_backfill = 1 WHERE id = ?", [`${g}-r1`])
  await db.run("INSERT INTO rounds (id, game_id, round_number, status) VALUES (?, ?, 2, 'open')", [`${g}-r2`, g])
  await db.run('INSERT INTO round_scores (round_id, game_id, player_id, points) VALUES (?, ?, ?, 0), (?, ?, ?, 0)', [`${g}-r2`, g, 'p1', `${g}-r2`, g, 'p2'])
  await assert.rejects(() => rounds.undoCommit(db, { gameId: g }), /before round tracking/)
})

test('a finalized game rejects every change', async () => {
  const g = await newGame({ finalized: 1 })
  await assert.rejects(() => rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 1 }] }), /finalized/)
  await assert.rejects(() => rounds.setDraft(db, { gameId: g, playerId: 'p1', points: 1 }), /finalized/)
  await assert.rejects(() => rounds.commitRound(db, { gameId: g }), /finalized/)
  await assert.rejects(() => rounds.undoCommit(db, { gameId: g }), /finalized/)
  await assert.rejects(() => rounds.editRound(db, { gameId: g, roundNumber: 1, playerId: 'p1', points: 1 }), /finalized/)
})

test('finalizing saves a non-empty draft as the last round and drops an empty one', async () => {
  const withDraft = await newGame()
  await rounds.addToDraft(db, { gameId: withDraft, entries: [{ playerId: 'p1', delta: 5 }] })
  await rounds.closeOpenRound(db, withDraft)
  let state = await rounds.getRoundState(db, withDraft)
  assert.deepEqual(state.rounds.map((r) => [r.round_number, r.status]), [[1, 'committed']])
  assert.equal(state.open_round, null)
  assert.equal(await total(withDraft, 'p1'), 5)

  const empty = await newGame()
  await rounds.commitRound(db, { gameId: empty }) // round 1 saved, empty round 2 open
  await rounds.closeOpenRound(db, empty)
  state = await rounds.getRoundState(db, empty)
  assert.deepEqual(state.rounds.map((r) => [r.round_number, r.status]), [[1, 'committed']])
})

test('a game with scores but no rounds gets a legacy round first, so no points are lost', async () => {
  const id = `g${++gameCounter}`
  await db.run("INSERT INTO games (id, sqid_id, game_type_id, finalized, dealer_id, win_condition_type, win_condition_value) VALUES (?, 's1', 'cribbage', 0, 'p1', 'win', 50)", [id])
  await db.run("INSERT INTO stats (id, game_id, player_id, score, player_order) VALUES (?, ?, 'p1', 20, 1), (?, ?, 'p2', 8, 2)", [`${id}-a`, id, `${id}-b`, id])

  await rounds.addToDraft(db, { gameId: id, entries: [{ playerId: 'p1', delta: 5 }] })
  const state = await rounds.getRoundState(db, id)
  assert.deepEqual(state.rounds.map((r) => [r.round_number, r.status, r.is_backfill]), [[1, 'committed', 1], [2, 'open', 0]])
  assert.equal(await total(id, 'p1'), 25)
  assert.equal(await total(id, 'p2'), 8)
})

test('the audit log records each change with old and new points', async () => {
  const g = await newGame()
  await rounds.addToDraft(db, { gameId: g, entries: [{ playerId: 'p1', delta: 5 }], origin: 'sock-1' })
  await rounds.commitRound(db, { gameId: g })
  await rounds.editRound(db, { gameId: g, roundNumber: 1, playerId: 'p1', points: 6 })
  const rows = await db.query('SELECT kind, player_id, old_points, new_points, origin FROM score_audit WHERE game_id = ? ORDER BY id', [g])
  assert.deepEqual(rows[0], { kind: 'tap', player_id: 'p1', old_points: 0, new_points: 5, origin: 'sock-1' })
  assert.deepEqual(rows.filter((r) => r.kind === 'commit').map((r) => [r.player_id, r.new_points]), [['p1', 5], ['p2', 0]])
  assert.deepEqual(rows.at(-1), { kind: 'edit', player_id: 'p1', old_points: 5, new_points: 6, origin: null })
})
