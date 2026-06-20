# Fix Winner-Highlight Persistence and Score-Sync Corruption — Design Spec

**Date:** 2026-06-19
**Status:** Approved design, ready for implementation planning
**Scope:** Two user-reported defects in live play. No data-model changes, no new dependencies.

## Goal

Fix two defects observed during real play:

1. Starting a new game immediately after finishing one keeps the previous
   winner highlighted until the next point is scored.
2. Score updates sometimes don't sync correctly when entered close together —
   one tap appears to apply, then the displayed score changes to something
   else.

## Background

Skorbord is a React 18 + Vite frontend over an Express + Socket.IO + SQLite
(sqlite3, WAL) backend. `GameStateProvider` (`app/src/contexts/GameStateContext.jsx`)
wraps the whole app and never unmounts between games — only the
GameSetup/GamePlay child views toggle inside it. The API server holds a single
shared `sqlite3.Database` connection (`api/db/database.js`), used by every
route across every sqid/game.

Both defects were diagnosed by reading the code, then independently verified:
defect 1 by dispatching a second model against the same code with no shared
context, defect 2 by writing a throwaway script that exercised the real
`api/db/database.js` directly to observe actual behavior rather than relying
on theory. The verification changed the diagnosis and fix for defect 2 from
what was first proposed (see "Process note" at the end).

---

## Defect 1 — Stale winner highlight on new game

### Problem

`winner`, `scoreTallies`, and `glowingCards` in `gameStateReducer`
(`app/src/contexts/GameStateContext.jsx`) are not reset when a new game loads.
Since `GameStateProvider` persists across games, the previous game's winner
stays in state.

Separately, `useGameManager.js` computes the winner through
`checkForWinnerRef.current`, a ref reassigned synchronously **during render**
(`useGameManager.js:21`) so it always closes over that render's `gameState`.
`loadGame()` calls `checkForWinner(statsData)` synchronously, in the same tick,
right after `dispatch({ type: 'GAME_LOADED', ... })` (`useGameManager.js:91,101`).
Because React has not re-rendered yet, that call still observes the
**previous** game's `gameState.game`. If that previous game was finalized, the
guard `if (!gameState.game || gameState.game.finalized) return`
(`useGameManager.js:22`) makes the call a no-op — the stale winner is never
cleared. It only clears on the next real score event (`updatePlayerScore` or
the `score_update` socket handler), once a fresh render has rebound the ref to
the new, non-finalized game. That's exactly "adding a point fixed it."

The same `GAME_LOADED` dispatch, with the same stale-ref gap, also happens in
the `dealer_changed` socket handler (`useGameManager.js:305-328`), which
refetches game + stats and dispatches `GAME_LOADED` but never recomputes the
winner afterward at all.

### Fix

**1. Reset transient fields on `GAME_LOADED`.** In the `GAME_LOADED` case in
`GameStateContext.jsx`, reset `winner: null`, `scoreTallies: {}`,
`glowingCards: new Set()` alongside the existing fields. This guarantees a
freshly loaded game never displays a leftover winner/tally/glow from
whatever was in state before.

**2. Compute the winner from fresh data at load time, not through the stale
ref.** Extract the win-condition logic currently inlined in
`checkForWinnerRef.current` (`useGameManager.js:24-48`) into a pure helper:

```js
function computeWinner(game, stats) {
  if (!game || game.finalized) return null
  const winCondition = game.win_condition_value
  const winConditionType = game.win_condition_type
  if (winConditionType === 'win') {
    const qualified = stats.filter(s => s.score >= winCondition && s.score > 0)
    return qualified.length
      ? qualified.reduce((max, cur) => (cur.score > max.score ? cur : max))
      : null
  }
  if (winConditionType === 'lose') {
    const anyLoser = stats.some(s => s.score >= winCondition)
    if (!anyLoser) return null
    const eligible = stats.filter(s => s.score > 0)
    return eligible.length
      ? eligible.reduce((min, cur) => (cur.score < min.score ? cur : min))
      : null
  }
  return null
}
```

`checkForWinnerRef.current` becomes a thin wrapper that calls `computeWinner`
with the current closed-over `gameState.game` and dispatches
`WINNER_DETECTED`/`WINNER_CLEARED` — unchanged behavior for the real-time
paths (`updatePlayerScore`, the `score_update` socket handler), which already
run after `gameState.game` is current.

At the two `GAME_LOADED` call sites (`loadGame` and the `dealer_changed`
handler), call `computeWinner(gameData, statsData)` directly with the
just-fetched data instead of going through the ref, and dispatch
`WINNER_DETECTED` if it returns a winner:

```js
const gameWinner = computeWinner(gameData, statsData)
if (gameWinner) {
  dispatch({ type: 'WINNER_DETECTED', payload: { winner: gameWinner } })
}
```

(`WINNER_CLEARED` is unnecessary here since the `GAME_LOADED` reducer fix
above already resets `winner` to `null`.)

This closes the gap the reducer-only fix would leave: reconnecting to or
reloading an in-progress (non-finalized) game that already meets its win
condition now shows the winner immediately, instead of waiting for the next
score event.

### Acceptance criteria

- Finishing a game and starting a new one shows no winner highlight before
  any point is scored in the new game.
- Loading or reconnecting to an in-progress game that already meets its win
  condition immediately shows the correct winner, with no score update
  required to trigger it.
- A dealer change mid-game does not clear or fail to recompute an existing
  winner.

---

## Defect 2 — Score updates corrupt under concurrent taps

### Problem

`api/db/database.js` holds one shared `sqlite3.Database` connection for the
whole server process. `DatabaseManager.transaction()`
(`database.js:144-158`) issues `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`
directly against that connection with no in-process locking. Three routes
call it: `api/routes/stats.js`, `api/routes/games.js`, `api/routes/players.js`.

When two requests' transactions overlap in time — e.g., two score taps close
enough together that their HTTP round trips overlap, on the same player, a
different player, or even a different game, since it's one connection for the
whole process — the second transaction's `BEGIN` fails:

```
SQLITE_ERROR: cannot start a transaction within a transaction
```

This is not a silent lost-update read/write race (that was the first theory)
and not purely a client-side broadcast-ordering issue (an alternative theory
raised in independent review). It was confirmed by writing a throwaway script
that called the real `database.js` directly: firing two concurrent
read-then-write transactions against the same row reproduced the error above,
and — critically — also corrupted the *other* transaction's bookkeeping: its
own later `COMMIT` failed with `cannot commit - no transaction is active`.
Net effect observed in the test: one request's transaction errors out
end-to-end while the other's write still lands, and the final stored value
did not match either tap's intent (`6` instead of the correct `7` after two
`+1` increments). In the running app, the erroring request's optimistic UI
update gets reverted (`useGameManager.js`'s `updatePlayerScore` catch block)
while the other request's broadcast carries a value the user didn't expect —
matching the reported symptom: "it pretends to update, then updates to a
different score, not consistent."

### Fix

Serialize all `transaction()` calls in-process so a second transaction's
`BEGIN` can never be issued on the shared connection until the first
transaction's `COMMIT`/`ROLLBACK` has actually completed. This is a single
change in `DatabaseManager.transaction()` (`api/db/database.js`) — it fixes
`stats.js`, `games.js`, and `players.js` at once, since all three share the
one connection that the bug lives on.

```js
class DatabaseManager {
  constructor() {
    this.db = null
    this.isInitialized = false
    this.initPromise = null
    this.transactionQueue = Promise.resolve() // serializes transaction()
  }

  // ...

  async transaction(callback) {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const run = async () => {
      try {
        await this.run('BEGIN TRANSACTION')
        const result = await callback(this)
        await this.run('COMMIT')
        return result
      } catch (error) {
        await this.run('ROLLBACK')
        throw error
      }
    }

    const result = this.transactionQueue.then(run, run)
    this.transactionQueue = result.then(() => {}, () => {})
    return result
  }
}
```

This was verified against the real `database.js` with the same throwaway
script: the same two concurrent `+1` increments that previously errored and
produced `6` instead produce the correct `7`, with zero errors, once
`transaction()` queues this way.

**The previously proposed atomic `UPDATE stats SET score = score + ?` change
to `stats.js` is not needed and is dropped from this fix.** It targeted a
read/write race that doesn't occur in this codebase (the actual failure mode
is the nested-`BEGIN` error above). Once transactions can't overlap, the
existing read-then-write in `stats.js` has no race window — changing it would
be unrelated churn.

### Acceptance criteria

- Two concurrent score updates (same player or different players, same game)
  both apply correctly with no `SQLITE_ERROR`, and the final stored score
  reflects both.
- No other route that calls `db.transaction()` regresses — `games.js` and
  `players.js` continue to work under their existing single-request-at-a-time
  test coverage; this change only affects interleaving when calls genuinely
  overlap.
- Throughput note: transactions across the whole server now queue
  in-process rather than racing. This matches SQLite's actual single-writer
  model for an embedded file database — it is the intended behavior, not a
  new bottleneck, for this app's scale (a handful of concurrent clients per
  sqid on a Raspberry Pi).

---

## Testing

Existing vitest (app) and `node --test` (api) suites must stay green. Add:

- **Reducer (`gameStateReducer.test.js`):** `GAME_LOADED` resets `winner` to
  `null`, `scoreTallies` to `{}`, and `glowingCards` to an empty `Set`, even
  when the prior state had non-empty values for each.
- **`useGameManager` / winner computation:** a unit test for the extracted
  `computeWinner(game, stats)` helper covering `win` and `lose` condition
  types, the finalized-game no-op, and the "already past win condition on
  load" case it's specifically meant to fix.
- **DB concurrency (`api/tests/`, new file, following the `database.test.js`
  throwaway-file-SQLite pattern):**
  - Two concurrent `db.transaction()` calls doing a read-then-write `+1`
    increment on the same row both succeed and the final value reflects both
    (regression test for the exact bug found: asserts no `SQLITE_ERROR` and a
    correct final sum).
  - A transaction that throws (e.g., a bounds violation) still rolls back
    correctly when another transaction is queued behind it — the queue must
    not get stuck or skip the rollback.

## Process note

The initial diagnosis for defect 2 (server-side lost-update race from
unserialized reads) was independently reviewed by a second model, which
refuted it on different theoretical grounds (claimed nested transactions
would error rather than race, and proposed a client-side broadcast-ordering
explanation instead). Rather than choose between two theoretical claims, the
actual behavior was tested empirically against `api/db/database.js` with a
throwaway script (not committed). That test confirmed the second model's
claim that overlapping transactions throw `SQLITE_ERROR`, but also showed
neither theory's proposed fix was what actually mattered: the fix is
serializing `transaction()` itself, not changing `stats.js`'s arithmetic and
not changing client-side broadcast handling. This is recorded here so the
reasoning trail isn't lost: the empirical test result is the source of truth
for this defect, not either prior theory.
