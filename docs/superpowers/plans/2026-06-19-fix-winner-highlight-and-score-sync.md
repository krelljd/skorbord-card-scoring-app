# Fix Winner-Highlight Persistence and Score-Sync Corruption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two live-play defects — a stale winner highlight that survives into a new game, and score updates that corrupt when two taps' transactions overlap on the shared SQLite connection.

**Architecture:** Defect 1 is fixed in the frontend state layer: reset transient winner/tally/glow fields on `GAME_LOADED`, and compute the winner from freshly-fetched data at load time via a new pure helper instead of through a stale-closure ref. Defect 2 is fixed in the backend DB layer: serialize `DatabaseManager.transaction()` calls behind an in-process promise queue so a second transaction's `BEGIN` is never issued before the first's `COMMIT`/`ROLLBACK` completes.

**Tech Stack:** React 18 + Vite frontend (vitest), Express + Socket.IO + SQLite (sqlite3) backend (`node --test`).

## Global Constraints

- No data-model changes, no new dependencies (per spec scope).
- The previously proposed atomic `UPDATE stats SET score = score + ?` change to `stats.js` is explicitly **dropped** — do not make it. Once `transaction()` is serialized, the existing read-then-write in `stats.js` has no race window.
- Existing vitest (`app/`) and `node --test` (`api/`) suites must stay green throughout.
- Follow each file's existing style exactly: `app/src/**/*.js(x)` files use no semicolons; `api/**/*.js` source files use semicolons; `api/tests/*.test.js` files use no semicolons (see `api/tests/retryOnBusy.test.js`, `api/tests/database.test.js`).

---

## File Structure

- Modify `app/src/contexts/GameStateContext.jsx` — reset `winner`/`scoreTallies`/`glowingCards` in the `GAME_LOADED` reducer case.
- Modify `app/src/contexts/gameStateReducer.test.js` — add a test for that reset behavior.
- Create `app/src/hooks/winnerLogic.js` — pure `computeWinner(game, stats)` helper, extracted from `useGameManager.js`'s `checkForWinnerRef.current`.
- Create `app/src/hooks/winnerLogic.test.js` — unit tests for `computeWinner`.
- Modify `app/src/hooks/useGameManager.js` — use `computeWinner` in `checkForWinnerRef.current`, and call it directly (not through the stale ref) in `loadGame` and the `dealer_changed` socket handler.
- Modify `api/db/database.js` — add an in-process `transactionQueue` to `DatabaseManager` so `transaction()` calls serialize.
- Create `api/tests/transactionQueue.test.js` — concurrency regression tests against the real `database.js`.

---

### Task 1: Reset transient state on `GAME_LOADED`

**Files:**
- Modify: `app/src/contexts/GameStateContext.jsx:6-15`
- Test: `app/src/contexts/gameStateReducer.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GAME_LOADED` reducer case now always resets `winner: null`, `scoreTallies: {}`, `glowingCards: new Set()` regardless of prior state. No other task depends on this directly, but Task 3 relies on this reset being in place so it doesn't need to separately dispatch `WINNER_CLEARED`.

- [ ] **Step 1: Write the failing test**

Add this new `describe` block to the end of `app/src/contexts/gameStateReducer.test.js` (after the existing `GAME_STATS_SYNCED` block):

```js
describe('GAME_LOADED', () => {
  it('resets winner, scoreTallies, and glowingCards even when prior state had values', () => {
    const priorState = {
      ...baseState,
      winner: { player_id: 'p1', score: 11 }
    }
    const newGame = { id: 'g2', dealer_id: 'p2', finalized: false }
    const newStats = [{ player_id: 'p2', score: 0 }]

    const next = gameStateReducer(priorState, {
      type: 'GAME_LOADED',
      payload: { game: newGame, stats: newStats }
    })

    expect(next.winner).toBeNull()
    expect(next.scoreTallies).toEqual({})
    expect(next.glowingCards).toEqual(new Set())
    expect(next.game).toBe(newGame)
    expect(next.gameStats).toBe(newStats)
    expect(next.dealer).toBe('p2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/contexts/gameStateReducer.test.js`
Expected: FAIL — `next.winner` is `{ player_id: 'p1', score: 11 }`, not `null` (the reducer doesn't reset it yet).

- [ ] **Step 3: Implement the fix**

In `app/src/contexts/GameStateContext.jsx`, replace the `GAME_LOADED` case (lines 6-15):

```js
    case 'GAME_LOADED': {
      return {
        ...state,
        game: action.payload.game,
        gameStats: action.payload.stats || [],
        dealer: action.payload.game?.dealer_id || null, // Set dealer from game
        winner: null,
        scoreTallies: {},
        glowingCards: new Set(),
        loading: false,
        error: null
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/contexts/gameStateReducer.test.js`
Expected: PASS (both the existing `GAME_STATS_SYNCED` test and the new `GAME_LOADED` test).

- [ ] **Step 5: Commit**

```bash
git add app/src/contexts/GameStateContext.jsx app/src/contexts/gameStateReducer.test.js
git commit -m "fix: reset winner, tallies, and glow on GAME_LOADED"
```

---

### Task 2: Extract `computeWinner` as a pure, testable helper

**Files:**
- Create: `app/src/hooks/winnerLogic.js`
- Create: `app/src/hooks/winnerLogic.test.js`

**Interfaces:**
- Consumes: nothing (pure function, no app state).
- Produces: `computeWinner(game, stats)` — exported function. `game` is the game object with `finalized: boolean`, `win_condition_type: 'win' | 'lose'`, `win_condition_value: number`. `stats` is an array of `{ player_id, score, ... }`. Returns the winning stat object, or `null` if no one has met the win condition (or the game has no game, or the game is finalized). Task 3 imports this from `'./winnerLogic.js'` inside `useGameManager.js`.

- [ ] **Step 1: Write the failing tests**

Create `app/src/hooks/winnerLogic.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { computeWinner } from './winnerLogic.js'

describe('computeWinner', () => {
  it('returns null when there is no game', () => {
    expect(computeWinner(null, [])).toBeNull()
  })

  it('returns null when the game is already finalized', () => {
    const game = { finalized: true, win_condition_type: 'win', win_condition_value: 10 }
    const stats = [{ player_id: 'p1', score: 12 }]
    expect(computeWinner(game, stats)).toBeNull()
  })

  it('returns the highest scorer at or above the win threshold for "win" games', () => {
    const game = { finalized: false, win_condition_type: 'win', win_condition_value: 10 }
    const stats = [
      { player_id: 'p1', score: 8 },
      { player_id: 'p2', score: 11 },
      { player_id: 'p3', score: 10 }
    ]
    expect(computeWinner(game, stats)).toEqual({ player_id: 'p2', score: 11 })
  })

  it('returns null for "win" games when no one has reached the threshold', () => {
    const game = { finalized: false, win_condition_type: 'win', win_condition_value: 10 }
    const stats = [{ player_id: 'p1', score: 5 }]
    expect(computeWinner(game, stats)).toBeNull()
  })

  it('returns the lowest positive scorer once someone hits the lose threshold for "lose" games', () => {
    const game = { finalized: false, win_condition_type: 'lose', win_condition_value: 100 }
    const stats = [
      { player_id: 'p1', score: 100 },
      { player_id: 'p2', score: 40 },
      { player_id: 'p3', score: 60 }
    ]
    expect(computeWinner(game, stats)).toEqual({ player_id: 'p2', score: 40 })
  })

  it('returns null for "lose" games when no one has reached the loss threshold', () => {
    const game = { finalized: false, win_condition_type: 'lose', win_condition_value: 100 }
    const stats = [{ player_id: 'p1', score: 40 }]
    expect(computeWinner(game, stats)).toBeNull()
  })

  it('detects a winner already past the win condition on load (the bug this fixes)', () => {
    const game = { finalized: false, win_condition_type: 'win', win_condition_value: 10 }
    const stats = [{ player_id: 'p1', score: 15 }]
    expect(computeWinner(game, stats)).toEqual({ player_id: 'p1', score: 15 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/hooks/winnerLogic.test.js`
Expected: FAIL with "Failed to resolve import './winnerLogic.js'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `app/src/hooks/winnerLogic.js`:

```js
// Pure win-condition evaluation, extracted so it can run against freshly
// fetched data at load time, not only through a stale render-closure ref.
export function computeWinner(game, stats) {
  if (!game || game.finalized) return null

  const winCondition = game.win_condition_value
  const winConditionType = game.win_condition_type

  if (winConditionType === 'win') {
    // Win condition: first player to reach the target score (must be positive)
    const qualified = stats.filter(stat => stat.score >= winCondition && stat.score > 0)
    return qualified.length
      ? qualified.reduce((max, current) => (current.score > max.score ? current : max))
      : null
  }

  if (winConditionType === 'lose') {
    // Lose condition: when someone hits the target, lowest positive score wins
    const anyLoser = stats.some(stat => stat.score >= winCondition)
    if (!anyLoser) return null
    const eligible = stats.filter(stat => stat.score > 0)
    return eligible.length
      ? eligible.reduce((min, current) => (current.score < min.score ? current : min))
      : null
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/hooks/winnerLogic.test.js`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/hooks/winnerLogic.js app/src/hooks/winnerLogic.test.js
git commit -m "refactor: extract computeWinner as a pure, testable helper"
```

---

### Task 3: Wire `computeWinner` into `useGameManager` at both `GAME_LOADED` call sites

**Files:**
- Modify: `app/src/hooks/useGameManager.js:1-4` (imports), `:18-56` (`checkForWinnerRef.current`), `:91-113` (`loadGame`), `:306-328` (`dealer_changed` handler)

**Interfaces:**
- Consumes: `computeWinner(game, stats)` from Task 2 (`app/src/hooks/winnerLogic.js`).
- Produces: no change to `useGameManager`'s public return shape (`game`, `gameStats`, `winner`, `loadGame`, `updatePlayerScore`, etc. — all unchanged). Behavior change only: `loadGame` and the `dealer_changed` socket handler now compute and dispatch a winner from the data they just fetched, instead of relying on `checkForWinnerRef` (which still observes the previous render's `gameState.game` at the moment they run).

There is no existing hook-level test harness for `useGameManager` in this codebase (it's wired to live sockets and API calls) — verification for this task is the full app test suite staying green (it exercises the reducer and `computeWinner` paths this task wires together) plus a manual trace through the three call sites against the spec. This matches the spec's own Testing section, which calls for reducer + `computeWinner` unit tests but not a new hook-level test.

- [ ] **Step 1: Add the import**

In `app/src/hooks/useGameManager.js`, add to the top imports (after line 5):

```js
import { computeWinner } from './winnerLogic.js'
```

- [ ] **Step 2: Simplify `checkForWinnerRef.current` to use `computeWinner`**

Replace lines 21-56 (the full `checkForWinnerRef.current = (stats) => { ... }` body):

```js
  checkForWinnerRef.current = (stats) => {
    const gameWinner = computeWinner(gameState.game, stats)

    // Update winner state if detected
    if (gameWinner && gameWinner.player_id !== gameState.winner?.player_id) {
      dispatch({ type: 'WINNER_DETECTED', payload: { winner: gameWinner } })
    } else if (!gameWinner && gameState.winner) {
      dispatch({ type: 'WINNER_CLEARED' })
    }
  }
```

This is the same behavior as before for the real-time paths (`updatePlayerScore`, the `score_update` socket handler) — they still call `checkForWinner`, which still closes over the current render's `gameState.game`, which is already current by the time those paths run.

- [ ] **Step 3: Compute the winner directly in `loadGame` instead of through `checkForWinner`**

In `loadGame`, replace lines 91-106:

```js
      dispatch({
        type: 'GAME_LOADED',
        payload: {
          game: gameData,
          stats: statsData || []
        }
      })
      
      // Check for winner after loading game data and stats
      if (gameData && statsData && statsData.length > 0) {
        checkForWinner(statsData)
      }
      
      if (typeof clearAllTallies === 'function') {
        clearAllTallies()
      }
```

with:

```js
      dispatch({
        type: 'GAME_LOADED',
        payload: {
          game: gameData,
          stats: statsData || []
        }
      })

      // Compute the winner from the data just fetched, not through
      // checkForWinner: gameState.game (and therefore checkForWinnerRef)
      // still reflects the *previous* game until the next render, so
      // checkForWinner would observe stale state here.
      const gameWinner = computeWinner(gameData, statsData || [])
      if (gameWinner) {
        dispatch({ type: 'WINNER_DETECTED', payload: { winner: gameWinner } })
      }

      if (typeof clearAllTallies === 'function') {
        clearAllTallies()
      }
```

Then update `loadGame`'s `useCallback` dependency array on line 113 — `checkForWinner` is no longer called inside `loadGame`, so remove it:

```js
  }, [sqid, dispatch, setLoading, setError]) // checkForWinner no longer used here
```

- [ ] **Step 4: Compute the winner directly in the `dealer_changed` handler**

Replace the `handleDealerChanged` function (lines 306-328):

```js
    const handleDealerChanged = (data) => {
      if (data.sqid === sqid) {
        // Fetch latest game and stats from API to ensure fresh state
        const refreshGameData = async () => {
          try {
            const [gameData, statsData] = await Promise.all([
              gameAPI.getGame(sqid),
              gameAPI.getGameStats(sqid)
            ])
            dispatch({
              type: 'GAME_LOADED',
              payload: {
                game: gameData,
                stats: statsData
              }
            })

            // Same stale-ref gap as loadGame: compute directly from the data
            // just fetched, not through checkForWinner.
            const gameWinner = computeWinner(gameData, statsData || [])
            if (gameWinner) {
              dispatch({ type: 'WINNER_DETECTED', payload: { winner: gameWinner } })
            }
          } catch (error) {
            console.error('Failed to refresh game data after dealer_changed:', error)
          }
        }
        refreshGameData()
      }
    }
```

- [ ] **Step 5: Run the full app test suite**

Run: `cd app && npx vitest run`
Expected: PASS — all existing suites (including `gameStateReducer.test.js`, `scoreSync.test.js`, and the new `winnerLogic.test.js`) stay green.

- [ ] **Step 6: Commit**

```bash
git add app/src/hooks/useGameManager.js
git commit -m "fix: compute winner from fresh data on game load, not via stale ref"
```

---

### Task 4: Serialize `DatabaseManager.transaction()` calls

**Files:**
- Modify: `api/db/database.js:32-37` (constructor), `:144-158` (`transaction` method)
- Test: Create `api/tests/transactionQueue.test.js`

**Interfaces:**
- Consumes: nothing new — uses the existing `db.run`/`db.get`/`db.query` methods on the singleton.
- Produces: `DatabaseManager.transaction(callback)` behavior is unchanged from the caller's perspective (same signature, same resolve/reject semantics) — the only change is that a second call's `BEGIN TRANSACTION` now waits for the first call's `COMMIT`/`ROLLBACK` to finish first. `stats.js`, `games.js`, `players.js` need no changes since they all go through this one method.

- [ ] **Step 1: Write the failing tests**

Create `api/tests/transactionQueue.test.js`:

```js
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

process.env.DATABASE_URL = 'sqlite:///tmp-test/transaction-queue-test.db'
const { default: db } = await import('../db/database.js')

before(async () => {
  await db.run('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)')
  await db.run('INSERT INTO counter (id, value) VALUES (1, 0)')
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test', import.meta.url), { recursive: true, force: true })
})

test('two concurrent read-then-write +1 transactions on the same row both apply with no SQLITE_ERROR', async () => {
  const increment = () => db.transaction(async (tx) => {
    const row = await tx.get('SELECT value FROM counter WHERE id = 1')
    const next = row.value + 1
    await tx.run('UPDATE counter SET value = ? WHERE id = 1', [next])
    return next
  })

  const results = await Promise.all([increment(), increment()])

  const final = await db.get('SELECT value FROM counter WHERE id = 1')
  assert.equal(final.value, 2)
  assert.deepEqual(results.slice().sort(), [1, 2])
})

test('a transaction that throws rolls back, and a transaction queued behind it still runs', async () => {
  await db.run('UPDATE counter SET value = 10 WHERE id = 1')

  const throwing = db.transaction(async (tx) => {
    await tx.run('UPDATE counter SET value = ? WHERE id = 1', [999])
    throw new Error('simulated failure')
  })

  const succeeding = db.transaction(async (tx) => {
    const row = await tx.get('SELECT value FROM counter WHERE id = 1')
    await tx.run('UPDATE counter SET value = ? WHERE id = 1', [row.value + 1])
    return row.value + 1
  })

  await assert.rejects(throwing, /simulated failure/)
  await succeeding

  const final = await db.get('SELECT value FROM counter WHERE id = 1')
  // Rollback must have restored 10 before the queued transaction read it,
  // so the queued +1 lands on 10, not on the throwing transaction's 999.
  assert.equal(final.value, 11)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && node --test tests/transactionQueue.test.js`
Expected: FAIL — without serialization, the two concurrent transactions in the first test race on the shared connection's `BEGIN`/`COMMIT`, producing either a `SQLITE_ERROR: cannot start a transaction within a transaction` rejection or a final `counter.value` of `1` instead of `2`.

- [ ] **Step 3: Implement the queue**

In `api/db/database.js`, update the constructor (lines 32-37):

```js
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;
    this.transactionQueue = Promise.resolve(); // serializes transaction()
  }
```

Replace the `transaction` method (lines 144-158):

```js
  // Transaction support — serialized so a second transaction's BEGIN can
  // never be issued before the first transaction's COMMIT/ROLLBACK has
  // actually completed on the one shared connection.
  async transaction(callback) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const run = async () => {
      try {
        await this.run('BEGIN TRANSACTION');
        const result = await callback(this);
        await this.run('COMMIT');
        return result;
      } catch (error) {
        await this.run('ROLLBACK');
        throw error;
      }
    };

    const result = this.transactionQueue.then(run, run);
    this.transactionQueue = result.then(() => {}, () => {});
    return result;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && node --test tests/transactionQueue.test.js`
Expected: PASS — both tests green, no `SQLITE_ERROR`.

- [ ] **Step 5: Run the full api test suite**

Run: `cd api && npm test`
Expected: PASS — all existing suites (`database.test.js`, `retryOnBusy.test.js`, `scoreBroadcast.test.js`, `scoreRateLimit.test.js`, `smoke.test.js`, `socketAuth.test.js`) stay green alongside the new `transactionQueue.test.js`.

- [ ] **Step 6: Commit**

```bash
git add api/db/database.js api/tests/transactionQueue.test.js
git commit -m "fix: serialize DatabaseManager.transaction() to prevent overlapping BEGIN/COMMIT"
```

---

## Final Verification

- [ ] **Step 1: Run the full app suite**

Run: `cd app && npx vitest run`
Expected: PASS, all suites green.

- [ ] **Step 2: Run the full api suite**

Run: `cd api && npm test`
Expected: PASS, all suites green.

- [ ] **Step 3: Manually confirm acceptance criteria from the spec**

Walk through each acceptance criterion in `docs/superpowers/specs/2026-06-19-fix-winner-highlight-and-score-sync-design.md` against the changed code:
- Defect 1: `GAME_LOADED` reducer reset (Task 1) + `computeWinner` at both load sites (Task 3) together cover "no stale winner on new game," "immediate winner on reconnect to an already-won game," and "dealer change doesn't clear/fail to recompute an existing winner."
- Defect 2: the serialized `transaction()` queue (Task 4) covers "two concurrent score updates both apply, no `SQLITE_ERROR`" and "other transaction-using routes (`games.js`, `players.js`) don't regress" (they're unaffected call sites of the same now-serialized method).
