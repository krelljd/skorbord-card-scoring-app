# Skorbord Hardening Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the score-sync race, UI redraw storms, SQLite connectivity gaps, socket/UX duplication, and missing access-control guardrails in the existing Skorbord app — without changing the data model or adding user accounts.

**Architecture:** Move real-time scoring to a single server-authoritative `score_update` broadcast (the REST POST is the only broadcaster; clients apply the payload instead of refetching). Make `PlayerCard` a pure props component so React's `memo` actually localizes redraws. Harden the lazy SQLite singleton with `busy_timeout`, a cached init promise, and a busy-retry wrapper. Collapse two competing socket stacks into one. Add a socket-auth gate and a per-sqid score rate limiter. Extract small pure helpers (`buildScoreUpdatePayload`, `shouldApplyRemoteTally`, `retryOnBusy`, the rate-limiter bucket) so the behavioral logic is unit-testable.

**Tech Stack:** React 18 + Vite + Vitest (frontend), Express + Socket.IO + sqlite3 (backend), Node's built-in `node:test` runner for backend tests.

---

## Source Spec

`docs/superpowers/specs/2026-06-07-hardening-pass-design.md` (merged to `main`).

## Pre-flight context for the engineer

You are working in a git worktree on branch `claude/eloquent-ishizaka-d9c665` (pushed to the remote as `claude-eloquent-ishizaka-d9c665` — the remote already has a branch literally named `claude`, which blocks any `claude/...` ref, so push with `git push origin HEAD:refs/heads/claude-eloquent-ishizaka-d9c665`).

Repo layout:
- `api/` — Express backend, ESM (`"type": "module"`), Node ≥ 20. **No test runner is installed.** This plan uses `node --test` (built into Node, native ESM, zero new deps).
- `app/` — React frontend, Vite + Vitest. Vitest is already in `devDependencies` but `vite.config.js` points `setupFiles` at `./src/test/setup.js`, which **does not exist yet** (Task 1 creates it).

Run backend tests from `api/`: `node --test`. Run a single backend file: `node --test tests/<name>.test.js`.
Run frontend tests from `app/`: `npx vitest run <path>` (single file) or `npm run test:run` (all).

Commit after every task. Keep commits small.

---

## File Structure

**Created files**
- `app/src/test/setup.js` — Vitest global setup (imports `@testing-library/jest-dom`). Referenced by existing `vite.config.js`.
- `app/src/hooks/scoreSync.js` — Pure helper: `shouldApplyRemoteTally(data, mySocketId)`. Keeps the tally-suppression decision out of the hook so it is unit-testable.
- `api/utils/scoreBroadcast.js` — Pure helper: `buildScoreUpdatePayload(...)` produces the canonical `score_update` object.
- `api/middleware/scoreRateLimit.js` — Per-sqid token-bucket rate limiter factory for score writes.
- Test files: `app/src/contexts/gameStateReducer.test.js`, `app/src/components/modern/PlayerCard.test.jsx`, `app/src/hooks/scoreSync.test.js`, `app/src/services/gameAPI.test.js`, `api/tests/scoreBroadcast.test.js`, `api/tests/database.test.js`, `api/tests/retryOnBusy.test.js`, `api/tests/scoreRateLimit.test.js`, `api/tests/socketAuth.test.js`.

**Modified files**
- `api/sockets/handlers.js` — Remove the `update_score` relay.
- `api/routes/stats.js` — Emit the canonical payload via `buildScoreUpdatePayload`; read `socketId` from the body; apply the per-sqid rate limiter; align the `PUT /:playerId` broadcast to the same schema.
- `api/db/database.js` — `busy_timeout`, cached `initPromise`, `retryOnBusy` wrapper.
- `api/index.js` — Enable `socketAuthMiddleware`; log `DATABASE_URL` consistently.
- `app/src/services/gameAPI.js` — Fix the corrupted header; `updatePlayerScore(sqid, gameId, playerId, change, socketId)` (no internal `getActiveGame`).
- `app/src/hooks/useGameManager.js` — Remove the `update_score` emit; pass `gameId`+`socketId`; apply stats directly in `handleScoreUpdate`; delete the broken `useDealerManager` export and unreachable code.
- `app/src/contexts/GameStateContext.jsx` — Export the reducer; add `GAME_STATS_SYNCED`.
- `app/src/components/modern/PlayerCard.jsx` — Take `tally` as a prop; drop `useGameState()` and the in-render `console.debug`.
- `app/src/components/modern/ReorderablePlayerCard.jsx` — Pass `tally` through.
- `app/src/components/modern/GamePlay.jsx` — Pass `tally`; gate score controls on connection; show a reconnecting banner.
- `app/src/components/ModernCardApp.jsx` — Hoist the in-render component functions.
- `app/src/contexts/ConnectionContext.jsx` — Single native-reconnection socket; send `auth: { sqid }`.
- `app/src/services/socketService.js` — **Deleted.**
- `README.md`, `api/.env.example`, `app/.env.example` — Standardize on `DATABASE_URL`.

---

## Task 1: Establish the test harness

**Files:**
- Create: `app/src/test/setup.js`
- Create: `app/src/test/smoke.test.js`
- Modify: `api/package.json` (scripts)
- Create: `api/tests/smoke.test.js`

- [ ] **Step 1: Create the Vitest setup file**

Create `app/src/test/setup.js`:

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 2: Create a frontend smoke test**

Create `app/src/test/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest'

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 3: Run the frontend smoke test**

Run: `cd app && npx vitest run src/test/smoke.test.js`
Expected: PASS (1 test).

- [ ] **Step 4: Point the backend test script at node:test**

In `api/package.json`, replace the `test`, `test:watch`, `test:coverage`, and `test:ci` scripts with:

```json
    "test": "node --test",
    "test:watch": "node --test --watch",
    "test:coverage": "node --test --experimental-test-coverage",
    "test:ci": "node --test"
```

- [ ] **Step 5: Create a backend smoke test**

Create `api/tests/smoke.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('node:test harness runs', () => {
  assert.equal(1 + 1, 2)
})
```

- [ ] **Step 6: Run the backend smoke test**

Run: `cd api && node --test tests/smoke.test.js`
Expected: PASS (`# pass 1`).

- [ ] **Step 7: Commit**

```bash
git add app/src/test/setup.js app/src/test/smoke.test.js api/package.json api/tests/smoke.test.js
git commit -m "test: add vitest setup file and node:test backend harness"
```

---

## Task 2: Add the `GAME_STATS_SYNCED` reducer action

**Files:**
- Modify: `app/src/contexts/GameStateContext.jsx`
- Test: `app/src/contexts/gameStateReducer.test.js`

- [ ] **Step 1: Export the reducer so it can be tested**

In `app/src/contexts/GameStateContext.jsx`, change the reducer declaration from:

```js
function gameStateReducer(state, action) {
```

to:

```js
export function gameStateReducer(state, action) {
```

- [ ] **Step 2: Write the failing test**

Create `app/src/contexts/gameStateReducer.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { gameStateReducer } from './GameStateContext.jsx'

const baseState = {
  game: { id: 'g1', dealer_id: 'p1', finalized: false },
  gameStats: [{ player_id: 'p1', score: 1 }],
  scoreTallies: { p1: { total: 5, timestamp: 123 } },
  glowingCards: new Set(['p2']),
  winner: null,
  dealer: 'p1',
  loading: false,
  error: null,
  isReorderMode: false,
  sqid: 'abcd'
}

describe('GAME_STATS_SYNCED', () => {
  it('replaces only gameStats and leaves everything else intact', () => {
    const newStats = [{ player_id: 'p1', score: 9 }, { player_id: 'p2', score: 3 }]
    const next = gameStateReducer(baseState, {
      type: 'GAME_STATS_SYNCED',
      payload: { stats: newStats }
    })

    expect(next.gameStats).toEqual(newStats)
    // Untouched slices keep their identity / value
    expect(next.game).toBe(baseState.game)
    expect(next.dealer).toBe('p1')
    expect(next.scoreTallies).toBe(baseState.scoreTallies)
    expect(next.glowingCards).toBe(baseState.glowingCards)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd app && npx vitest run src/contexts/gameStateReducer.test.js`
Expected: FAIL — reducer throws `Unknown action: GAME_STATS_SYNCED`.

- [ ] **Step 4: Implement the action**

In `app/src/contexts/GameStateContext.jsx`, add this case immediately before the `case 'GAME_FINALIZED':` case:

```js
    case 'GAME_STATS_SYNCED': {
      // Replace only the stats array from an authoritative server broadcast.
      // Leaves game, dealer, scoreTallies, and glowingCards untouched.
      return {
        ...state,
        gameStats: action.payload.stats || []
      }
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app && npx vitest run src/contexts/gameStateReducer.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/contexts/GameStateContext.jsx app/src/contexts/gameStateReducer.test.js
git commit -m "feat: add GAME_STATS_SYNCED reducer action for authoritative stats"
```

---

## Task 3: Canonical score-update payload helper + remove relay

**Files:**
- Create: `api/utils/scoreBroadcast.js`
- Test: `api/tests/scoreBroadcast.test.js`
- Modify: `api/sockets/handlers.js`

- [ ] **Step 1: Write the failing test**

Create `api/tests/scoreBroadcast.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && node --test tests/scoreBroadcast.test.js`
Expected: FAIL — cannot find module `../utils/scoreBroadcast.js`.

- [ ] **Step 3: Implement the helper**

Create `api/utils/scoreBroadcast.js`:

```js
/**
 * Builds the single canonical `score_update` event payload broadcast to a
 * sqid room. This is the only score event in the system — there is no
 * client-relayed second event.
 *
 * @param {object} args
 * @param {string} args.sqid
 * @param {string} args.gameId
 * @param {Array}  args.stats - full authoritative stats rows for the game
 * @param {string|null} [args.playerId] - player for the single-tap tally
 * @param {number|null} [args.change] - integer delta for the tally animation
 * @param {string|null} [args.winnerId]
 * @param {string|null} [args.originSocketId] - socket id of the acting client
 * @returns {object}
 */
export function buildScoreUpdatePayload({
  sqid,
  gameId,
  stats,
  playerId = null,
  change = null,
  winnerId = null,
  originSocketId = null
}) {
  return {
    sqid,
    gameId,
    stats,
    playerId,
    change,
    winnerId,
    originSocketId,
    timestamp: new Date().toISOString()
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && node --test tests/scoreBroadcast.test.js`
Expected: PASS (`# pass 2`).

- [ ] **Step 5: Remove the client-relay handler**

In `api/sockets/handlers.js`, delete this entire block (the `update_score` listener):

```js
  // Broadcast score updates to sqid room (exclude sender)
  socket.on('update_score', async (data) => {
    if (!socket.sqid) return;
    socket.to(`/sqid/${socket.sqid}`).emit('score_update', { 
      ...data, 
      timestamp: new Date().toISOString(),
      senderId: socket.id // Include sender ID for debugging
    });
  });
```

Leave `join-sqid`, `player_activity`, `show_rivalry_stats`, and `disconnect` handlers in place.

- [ ] **Step 6: Run the full backend suite**

Run: `cd api && node --test`
Expected: PASS (all backend tests, including smoke).

- [ ] **Step 7: Commit**

```bash
git add api/utils/scoreBroadcast.js api/tests/scoreBroadcast.test.js api/sockets/handlers.js
git commit -m "feat: add canonical score payload helper and remove client relay"
```

---

## Task 4: Stats route emits the canonical payload

**Files:**
- Modify: `api/routes/stats.js`

- [ ] **Step 1: Import the helper**

At the top of `api/routes/stats.js`, add after the existing `helpers.js` import line:

```js
import { buildScoreUpdatePayload } from '../utils/scoreBroadcast.js';
```

- [ ] **Step 2: Replace the POST `/` broadcast with the canonical payload**

In the `POST '/'` handler, find this block:

```js
    // For tally: get the last changed player and delta
    let player_id = null;
    let score_change = null;
    if (stats && stats.length === 1) {
      player_id = stats[0].player_id;
      score_change = stats[0].score;
    }

    // Broadcast score update with player_id and score_change for tally
    req.io?.to(`/sqid/${sqid}`).emit('score_update', {
      type: 'score_update',
      game_id: gameId,
      sqid_id: sqid,
      stats: allStats,
      player_id,
      score_change,
      timestamp: new Date().toISOString()
    });
```

Replace it with:

```js
    // For tally: the last changed player and delta (single-tap case)
    let playerId = null;
    let change = null;
    if (stats && stats.length === 1) {
      playerId = stats[0].player_id;
      change = stats[0].score;
    }

    // Re-read the winner the transaction may have just set, so the broadcast
    // carries authoritative winner info.
    const gameRow = await db.get('SELECT winner_id FROM games WHERE id = ?', [gameId]);

    // Broadcast the single canonical score_update event to the whole sqid room
    // (including the acting client, which reconciles its optimistic state).
    req.io?.to(`/sqid/${sqid}`).emit('score_update', buildScoreUpdatePayload({
      sqid,
      gameId,
      stats: allStats,
      playerId,
      change,
      winnerId: gameRow?.winner_id || null,
      originSocketId: req.body.socketId || null
    }));
```

- [ ] **Step 3: Align the PUT `/:playerId` broadcast to the same schema**

There is a second, unused-by-the-modern-client `score_update` emit in the `PUT '/:playerId'` handler with a different shape. Align it so only one schema exists in the codebase. Find:

```js
    // Broadcast individual score update
    req.io?.to(`/sqid/${sqid}`).emit('score_update', {
      type: 'score_update',
      gameId: gameId,
      sqidId: sqid,
      playerId: playerId,
      score: score,
      winnerId: winnerId,
      timestamp: timestamp
    });
```

Replace it with:

```js
    // Re-read all stats so the broadcast carries the authoritative array,
    // matching the canonical schema used by the POST handler.
    const allStats = await db.query(
      'SELECT s.*, p.name as player_name, p.color FROM stats s JOIN players p ON s.player_id = p.id WHERE s.game_id = ? ORDER BY s.created_at ASC',
      [gameId]
    );
    req.io?.to(`/sqid/${sqid}`).emit('score_update', buildScoreUpdatePayload({
      sqid,
      gameId,
      stats: allStats,
      playerId,
      change: null, // absolute set, not a delta
      winnerId: winnerId || null,
      originSocketId: req.body.socketId || null
    }));
```

- [ ] **Step 4: Verify the backend still loads (syntax check)**

Run: `cd api && node --check routes/stats.js`
Expected: no output, exit 0.

- [ ] **Step 5: Run the full backend suite**

Run: `cd api && node --test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/routes/stats.js
git commit -m "feat: emit canonical score_update payload from stats routes"
```

---

## Task 5: `gameAPI` — fix header, drop per-tap getActiveGame, send socketId

**Files:**
- Modify: `app/src/services/gameAPI.js`
- Test: `app/src/services/gameAPI.test.js`

- [ ] **Step 1: Fix the corrupted file header**

In `app/src/services/gameAPI.js`, replace the entire garbled top of the file (lines 1–23, from `/**` through the line ending `}ls with reusable service methods\n */`) with a single clean docblock:

```js
/**
 * Modern API service layer using async/await and proper error handling.
 * Replaces inline fetch calls with reusable service methods.
 */
```

Leave the `class APIError ...` declaration that follows untouched.

- [ ] **Step 2: Write the failing test**

Create `app/src/services/gameAPI.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import gameAPI from './gameAPI.js'

describe('updatePlayerScore', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] })
    }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs to the passed gameId without a preceding getActiveGame and includes socketId', async () => {
    await gameAPI.updatePlayerScore('abcd', 'game-1', 'player-1', 3, 'sock-9')

    // Exactly one HTTP call — no getActiveGame round-trip
    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/abcd/games/game-1/stats')
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.socketId).toBe('sock-9')
    expect(body.stats).toEqual([{ player_id: 'player-1', score: 3 }])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd app && npx vitest run src/services/gameAPI.test.js`
Expected: FAIL — current signature is `updatePlayerScore(sqid, playerId, change)` and it calls `getActiveGame` first (2 fetches, wrong URL, no socketId).

- [ ] **Step 4: Rewrite `updatePlayerScore`**

In `app/src/services/gameAPI.js`, replace the active `updatePlayerScore` method (the one inside `class GameAPI`, currently starting at the comment `// Simplified method for updating a single player's score`) with:

```js
  // Update a single player's score by a delta. The caller supplies the
  // active gameId (from state) and its socketId so the server can echo
  // originSocketId on the broadcast. No getActiveGame round-trip.
  async updatePlayerScore(sqid, gameId, playerId, change, socketId = null) {
    if (!gameId) {
      throw new Error('No active game found')
    }

    const response = await this.request(`/api/${sqid}/games/${gameId}/stats`, {
      method: 'POST',
      body: JSON.stringify({
        stats: [{ player_id: playerId, score: change }],
        socketId
      })
    })
    return response?.data
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app && npx vitest run src/services/gameAPI.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/services/gameAPI.js app/src/services/gameAPI.test.js
git commit -m "feat: gameAPI takes gameId+socketId, drops per-tap getActiveGame"
```

---

## Task 6: Tally-suppression helper

**Files:**
- Create: `app/src/hooks/scoreSync.js`
- Test: `app/src/hooks/scoreSync.test.js`

- [ ] **Step 1: Write the failing test**

Create `app/src/hooks/scoreSync.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { shouldApplyRemoteTally } from './scoreSync.js'

describe('shouldApplyRemoteTally', () => {
  it('shows the tally for an event from another client', () => {
    const data = { playerId: 'p1', change: 2, originSocketId: 'other' }
    expect(shouldApplyRemoteTally(data, 'me')).toBe(true)
  })

  it('suppresses the tally for the acting client (own origin)', () => {
    const data = { playerId: 'p1', change: 2, originSocketId: 'me' }
    expect(shouldApplyRemoteTally(data, 'me')).toBe(false)
  })

  it('suppresses when there is no single-player tally (playerId null)', () => {
    const data = { playerId: null, change: null, originSocketId: 'other' }
    expect(shouldApplyRemoteTally(data, 'me')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npx vitest run src/hooks/scoreSync.test.js`
Expected: FAIL — cannot find module `./scoreSync.js`.

- [ ] **Step 3: Implement the helper**

Create `app/src/hooks/scoreSync.js`:

```js
/**
 * Decide whether a received score_update should trigger the "+N" tally
 * animation on this client.
 *
 * The acting client already showed its own (accumulated) tally locally, so it
 * must NOT re-animate from its own broadcast. Only single-player taps
 * (playerId present) animate.
 *
 * @param {{ playerId: string|null, originSocketId: string|null }} data
 * @param {string|null} mySocketId
 * @returns {boolean}
 */
export function shouldApplyRemoteTally(data, mySocketId) {
  if (!data || data.playerId == null) return false
  return data.originSocketId !== mySocketId
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npx vitest run src/hooks/scoreSync.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/hooks/scoreSync.js app/src/hooks/scoreSync.test.js
git commit -m "feat: add shouldApplyRemoteTally helper for score sync"
```

---

## Task 7: `useGameManager` — apply stats directly, remove relay + dead code

**Files:**
- Modify: `app/src/hooks/useGameManager.js`

This task has no automated test (it is hook wiring exercised by the helpers tested in Tasks 2/5/6 and verified end-to-end in Task 16). Make the edits exactly as written.

- [ ] **Step 1: Import the tally helper**

At the top of `app/src/hooks/useGameManager.js`, add after the `gameAPI` import:

```js
import { shouldApplyRemoteTally } from './scoreSync.js'
```

- [ ] **Step 2: Update the score POST call and remove the relay emit**

In `updatePlayerScore`, replace this block:

```js
      // Sync with server (individual change) - this updates the database
      await gameAPI.updatePlayerScore(sqid, playerId, change)

      // Send WebSocket event immediately with accumulated total
      // Backend will exclude this client from receiving the broadcast
      if (socket?.connected) {
        const updatedPlayerScore = gameState.gameStats.find(s => s.player_id === playerId)?.score || 0
        
        socket.emit('update_score', {
          sqid,
          playerId,
          change: newAccumulation, // Send the total accumulated change
          newScore: updatedPlayerScore + change, // Updated score after this individual change
          isAccumulated: true, // Flag to indicate this is an accumulated total
          timestamp: Date.now() // Add timestamp to help with ordering
        })
      }

```

with:

```js
      // Sync with server. The server is the single broadcaster: it emits the
      // authoritative score_update to the whole room (including us). We pass our
      // socketId so the server echoes originSocketId and we can suppress our own
      // tally re-animation. No client relay emit.
      await gameAPI.updatePlayerScore(sqid, gameState.game?.id, playerId, change, socket?.id || null)

```

- [ ] **Step 3: Replace the refetch in `handleScoreUpdate` with a direct stats apply**

In the WebSocket effect, replace the entire `handleScoreUpdate` function:

```js
    // Listen for score updates from other clients
    const handleScoreUpdate = (data) => {
      if (data.sqid === sqid) {
        console.debug('[WS] handleScoreUpdate received from another client:', data)
        
        // Display the accumulated total received from the sender
        // Use SCORE_TALLY_SET to show exactly what was sent (no local accumulation)
        dispatch({
          type: 'SCORE_TALLY_SET',
          payload: {
            playerId: data.playerId,
            change: data.change // This is the total accumulated change from the sender
          }
        })
        
        // Clear any existing timeout for this player (rolling window)
        if (remoteTallyTimeouts.current[data.playerId]) {
          clearTimeout(remoteTallyTimeouts.current[data.playerId])
        }
        
        // Set new 3-second timer for this specific player (rolling window)
        remoteTallyTimeouts.current[data.playerId] = setTimeout(() => {
          dispatch({
            type: 'SCORE_TALLY_CLEARED',
            payload: { playerId: data.playerId }
          })
          
          // Clean up the timeout reference
          delete remoteTallyTimeouts.current[data.playerId]
        }, 3000)
        
        // Fetch latest game stats immediately to sync with server state
        // No debouncing needed since this client won't receive its own events
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
            checkForWinner(statsData)
          } catch (error) {
            console.error('Failed to refresh game data after score update:', error)
          }
        }
        refreshGameData()
      }
    }
```

with:

```js
    // Apply the authoritative score_update broadcast directly — no refetch.
    const handleScoreUpdate = (data) => {
      if (data.sqid !== sqid) return

      // Apply authoritative stats. This reconciles the acting client's
      // optimistic value too (server wins on any drift).
      dispatch({ type: 'GAME_STATS_SYNCED', payload: { stats: data.stats } })

      // Winner derives from the authoritative stats (equals the server's
      // winnerId, since it is the same data).
      checkForWinner(data.stats)

      // Animate the "+N" tally for events from other clients only.
      if (shouldApplyRemoteTally(data, socket?.id || null)) {
        dispatch({
          type: 'SCORE_TALLY_SET',
          payload: { playerId: data.playerId, change: data.change }
        })

        if (remoteTallyTimeouts.current[data.playerId]) {
          clearTimeout(remoteTallyTimeouts.current[data.playerId])
        }
        remoteTallyTimeouts.current[data.playerId] = setTimeout(() => {
          dispatch({ type: 'SCORE_TALLY_CLEARED', payload: { playerId: data.playerId } })
          delete remoteTallyTimeouts.current[data.playerId]
        }, 3000)
      }
    }
```

- [ ] **Step 4: Remove the unreachable code in `updatePlayerOrder`**

In `updatePlayerOrder`, delete the dead block after the `return response` statement:

```js
      return response

      // Clear glow effect after animation
      if (movedPlayerId) {
        setTimeout(() => {
          dispatch({
            type: 'GLOW_CLEARED',
            payload: { playerId: movedPlayerId }
          })
        }, 1000)
      }
```

so it becomes simply:

```js
      return response
```

- [ ] **Step 5: Delete the broken `useDealerManager` export**

At the bottom of `app/src/hooks/useGameManager.js`, delete the entire `export function useDealerManager(sqid) { ... }` block (it references `gameState`, `loadGame`, `updatePlayerScore`, etc. that are out of its scope and throw if invoked). The working `setDealer` already lives inside `useGameManager` and is returned from it. Confirm nothing imports `useDealerManager`:

Run: `cd app && npx vitest run src/contexts/gameStateReducer.test.js 2>/dev/null; grep -rn "useDealerManager" src/ || echo "no references"`
Expected: `no references`.

- [ ] **Step 6: Verify the app still builds**

Run: `cd app && npx vite build`
Expected: build succeeds (no import/reference errors).

- [ ] **Step 7: Commit**

```bash
git add app/src/hooks/useGameManager.js
git commit -m "feat: apply authoritative stats directly, remove relay and dead code"
```

---

## Task 8: `PlayerCard` becomes a pure props component

**Files:**
- Modify: `app/src/components/modern/PlayerCard.jsx`
- Test: `app/src/components/modern/PlayerCard.test.jsx`

- [ ] **Step 1: Write the failing render-count test**

Create `app/src/components/modern/PlayerCard.test.jsx`. The render-count test works by mocking `usePointerInteraction` (which `PlayerCard` calls **exactly twice per render** — once for the minus button, once for the plus button). Counting those calls is a deterministic proxy for how many times `PlayerCard`'s render body actually executed; a memoized card that bails out adds zero calls.

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock the pointer hook so we can count PlayerCard render executions.
vi.mock('../../hooks/usePointerInteraction.js', () => ({
  usePointerInteraction: vi.fn(() => ({
    glowingButton: null,
    handlePointerDown: () => {},
    handlePointerMove: () => {},
    handlePointerUp: () => {},
    handlePointerCancel: () => {},
    handlePointerLeave: () => {}
  }))
}))

import { usePointerInteraction } from '../../hooks/usePointerInteraction.js'
import PlayerCard from './PlayerCard.jsx'

// Stable props (module-level) so memo can bail out for the unchanged card.
const playerA = { id: 'a', name: 'Alice', score: 1 }
const playerB = { id: 'b', name: 'Bob', score: 2 }
const noop = () => {}

function Harness() {
  const [tallyA, setTallyA] = useState(null)
  return (
    <div>
      <button onClick={() => setTallyA({ total: 5, timestamp: 1 })}>bump-a</button>
      <PlayerCard player={playerA} playerIndex={0} tally={tallyA}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
      <PlayerCard player={playerB} playerIndex={1} tally={null}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
    </div>
  )
}

describe('PlayerCard redraw isolation', () => {
  beforeEach(() => {
    usePointerInteraction.mockClear()
  })

  it('re-renders only the card whose tally changed', () => {
    render(<Harness />)

    // Two cards * 2 pointer hooks each = 4 calls on initial mount.
    const afterMount = usePointerInteraction.mock.calls.length

    fireEvent.click(screen.getByText('bump-a'))

    // Only card A re-rendered -> exactly 2 more calls (not 4).
    const afterClick = usePointerInteraction.mock.calls.length
    expect(afterClick - afterMount).toBe(2)
  })

  it('renders the tally value from props with no GameState provider', () => {
    // If PlayerCard still called useGameState() this would throw — proving the
    // component no longer subscribes to global game state.
    render(
      <PlayerCard player={playerA} playerIndex={0} tally={{ total: 7, timestamp: 1 }}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
    )
    expect(screen.getByText('+7')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npx vitest run src/components/modern/PlayerCard.test.jsx`
Expected: FAIL — `PlayerCard` still reads tally from `useGameState()` (no provider → throws), and ignores the `tally` prop.

- [ ] **Step 3: Remove the context subscription and accept `tally` as a prop**

In `app/src/components/modern/PlayerCard.jsx`:

(a) Change the import line:

```js
import { useState, useCallback, memo, useRef, forwardRef } from 'react'
import { useGameState } from '../../contexts/GameStateContext.jsx'
import { usePointerInteraction } from '../../hooks/usePointerInteraction.js'
```

to:

```js
import { useCallback, memo, useRef, forwardRef } from 'react'
import { usePointerInteraction } from '../../hooks/usePointerInteraction.js'
```

(b) Add `tally` to the destructured props and remove the `useGameState()` call. Change:

```js
const PlayerCard = forwardRef(({ 
  player, 
  playerIndex = 0, // Default to 0 if not provided
  isDealer, 
  isWinner,
  onScoreUpdate, 
  onDealerClick,
  disabled = false 
}, ref) => {
  const gameState = useGameState()
  const lastUpdateRef = useRef(0)
```

to:

```js
const PlayerCard = forwardRef(({ 
  player, 
  playerIndex = 0, // Default to 0 if not provided
  isDealer, 
  isWinner,
  tally = null,
  onScoreUpdate, 
  onDealerClick,
  disabled = false 
}, ref) => {
  const lastUpdateRef = useRef(0)
```

(c) Remove the in-render debug block:

```js
  // Debug: log tally state for this player
  if (gameState.scoreTallies[safePlayer.id]) {
    console.debug('PlayerCard tally:', safePlayer.id, gameState.scoreTallies[safePlayer.id])
  }
  return (
```

becomes:

```js
  return (
```

(d) Replace the three reads of `gameState.scoreTallies[safePlayer.id]` in the tally JSX. Change:

```js
              {/* Score Tally - Left of Score */}
              {gameState.scoreTallies[safePlayer.id] && (
                <div
                  key={gameState.scoreTallies[safePlayer.id].timestamp}
                  className={`text-xl font-bold score-tally-animation ${
                    gameState.scoreTallies[safePlayer.id].total > 0 
                      ? 'text-success' 
                      : 'text-error'
                  }`}
                >
                  {gameState.scoreTallies[safePlayer.id].total > 0 ? '+' : ''}
                  {gameState.scoreTallies[safePlayer.id].total}
                </div>
              )}
```

to:

```js
              {/* Score Tally - Left of Score */}
              {tally && (
                <div
                  key={tally.timestamp}
                  className={`text-xl font-bold score-tally-animation ${
                    tally.total > 0 ? 'text-success' : 'text-error'
                  }`}
                >
                  {tally.total > 0 ? '+' : ''}
                  {tally.total}
                </div>
              )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npx vitest run src/components/modern/PlayerCard.test.jsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/modern/PlayerCard.jsx app/src/components/modern/PlayerCard.test.jsx
git commit -m "feat: PlayerCard takes tally as a prop so memo localizes redraws"
```

---

## Task 9: Thread `tally` through `ReorderablePlayerCard` and `GamePlay`

**Files:**
- Modify: `app/src/components/modern/ReorderablePlayerCard.jsx`
- Modify: `app/src/components/modern/GamePlay.jsx`

`ReorderablePlayerCard` already forwards unknown props via `...playerCardProps`, so `tally` passes through with no change there. Verify, then wire `GamePlay`.

- [ ] **Step 1: Confirm the wrapper forwards extra props**

Read `app/src/components/modern/ReorderablePlayerCard.jsx` and confirm both render paths spread `...playerCardProps` / `...modifiedProps` onto `<PlayerCard>`. No edit needed (the `tally` prop flows through automatically). If it does not spread, add `tally` to the destructure and pass it explicitly.

- [ ] **Step 2: Pass `tally` from `GamePlay`**

In `app/src/components/modern/GamePlay.jsx`, inside the `sortedPlayers.map(...)` render, add the `tally` prop to `<ReorderablePlayerCard>`. Change:

```jsx
                  <ReorderablePlayerCard
                    key={playerStat.player_id}
                    player={{
                      id: playerStat.player_id,
                      name: playerStat.player_name,
                      score: currentScore,
                      gamesWon: playerStat.games_won
                    }}
                    playerIndex={index}
                    isReorderMode={gameState.isReorderMode}
```

to:

```jsx
                  <ReorderablePlayerCard
                    key={playerStat.player_id}
                    player={{
                      id: playerStat.player_id,
                      name: playerStat.player_name,
                      score: currentScore,
                      gamesWon: playerStat.games_won
                    }}
                    playerIndex={index}
                    tally={gameState.scoreTallies[playerStat.player_id] || null}
                    isReorderMode={gameState.isReorderMode}
```

- [ ] **Step 3: Verify the build**

Run: `cd app && npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Run the frontend suite**

Run: `cd app && npm run test:run`
Expected: PASS (all frontend tests so far).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/modern/ReorderablePlayerCard.jsx app/src/components/modern/GamePlay.jsx
git commit -m "feat: pass per-player tally prop down to PlayerCard"
```

---

## Task 10: Hoist in-render components out of `ModernCardApp`

**Files:**
- Modify: `app/src/components/ModernCardApp.jsx`

`useModern` is hardcoded `true`, so the `LegacyApp` path is dead. The fix: inline the modern layout directly into the component's return so it is no longer a function redeclared every render. This stops the subtree remount.

- [ ] **Step 1: Inline the modern layout and remove the inner component functions**

In `app/src/components/ModernCardApp.jsx`:

(a) Remove the `const useModern = true // Default to modern` line.

(b) Replace the `const ModernApp = () => ( ... )` function, the `const LegacyApp = () => ( ... )` function, and the final `return useModern ? <ModernApp /> : <LegacyApp />` with a single direct `return` of the modern JSX. Concretely, change:

```jsx
  // Modern component wrapper
  const ModernApp = () => (
    <ErrorBoundary>
```

to:

```jsx
  return (
    <ErrorBoundary>
```

(c) Then delete everything from the end of that returned JSX (the `)` closing the old `ModernApp` arrow) through the end of the old `LegacyApp` function and the final ternary return. That is, delete this whole trailing section:

```jsx
  )

  // Legacy component wrapper for fallback
  const LegacyApp = () => (
    <div className="mobile-container">
      ...
    </div>
  )

  // Render modern or legacy based on param
  return useModern ? <ModernApp /> : <LegacyApp />
```

leaving the single `return ( <ErrorBoundary> ... </ErrorBoundary> )` as the component body's only return.

(d) Remove now-unused legacy imports at the top:

```jsx
// Legacy components for fallback during migration
import LegacyGameSetup from './GameSetup.jsx'
import LegacyGamePlay from './GamePlay.jsx'
import RivalryStats from './RivalryStats.jsx'
import AdminPanel from './AdminPanel.jsx'
```

(Keep `LazyAdminPanel`, `LazyRivalryStats`, and the modern `GameSetup`/`GamePlay` imports — those are still used.)

- [ ] **Step 2: Verify no dangling references**

Run: `cd app && grep -n "LegacyApp\|ModernApp\|useModern\|LegacyGameSetup\|LegacyGamePlay" src/components/ModernCardApp.jsx || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Verify the build**

Run: `cd app && npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ModernCardApp.jsx
git commit -m "fix: inline ModernCardApp layout to stop subtree remounts"
```

---

## Task 11: Database busy-retry helper

**Files:**
- Modify: `api/db/database.js`
- Test: `api/tests/retryOnBusy.test.js`

- [ ] **Step 1: Write the failing test**

Create `api/tests/retryOnBusy.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retryOnBusy } from '../db/database.js'

test('retries on SQLITE_BUSY then succeeds', async () => {
  let calls = 0
  const result = await retryOnBusy(async () => {
    calls++
    if (calls < 3) {
      const err = new Error('database is locked')
      err.code = 'SQLITE_BUSY'
      throw err
    }
    return 'ok'
  }, { retries: 5, delayMs: 1 })

  assert.equal(result, 'ok')
  assert.equal(calls, 3)
})

test('does not retry non-busy errors', async () => {
  let calls = 0
  await assert.rejects(
    () => retryOnBusy(async () => {
      calls++
      const err = new Error('syntax error')
      err.code = 'SQLITE_ERROR'
      throw err
    }, { retries: 5, delayMs: 1 }),
    /syntax error/
  )
  assert.equal(calls, 1)
})

test('gives up after exhausting retries', async () => {
  let calls = 0
  await assert.rejects(
    () => retryOnBusy(async () => {
      calls++
      const err = new Error('locked')
      err.code = 'SQLITE_BUSY'
      throw err
    }, { retries: 2, delayMs: 1 }),
    /locked/
  )
  assert.equal(calls, 3) // initial + 2 retries
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && node --test tests/retryOnBusy.test.js`
Expected: FAIL — `retryOnBusy` is not exported.

- [ ] **Step 3: Implement and export `retryOnBusy`**

In `api/db/database.js`, add this exported function near the top of the file, immediately after the `__dirname` setup (before `class DatabaseManager`):

```js
const RETRYABLE_CODES = new Set(['SQLITE_BUSY', 'SQLITE_IOERR', 'SQLITE_LOCKED']);

/**
 * Retry a DB operation on transient SQLite errors with linear backoff.
 * @param {() => Promise<any>} fn
 * @param {{ retries?: number, delayMs?: number }} [opts]
 */
export async function retryOnBusy(fn, { retries = 3, delayMs = 50 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!RETRYABLE_CODES.has(error?.code) || attempt >= retries) {
        throw error;
      }
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && node --test tests/retryOnBusy.test.js`
Expected: PASS (`# pass 3`).

- [ ] **Step 5: Commit**

```bash
git add api/db/database.js api/tests/retryOnBusy.test.js
git commit -m "feat: add retryOnBusy helper for transient SQLite errors"
```

---

## Task 12: Harden `database.js` init + wrap operations with retry

**Files:**
- Modify: `api/db/database.js`
- Test: `api/tests/database.test.js`

- [ ] **Step 1: Write the failing test**

Create `api/tests/database.test.js`:

```js
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

// Point the singleton at a throwaway DB under api/ before importing it.
process.env.DATABASE_URL = 'sqlite:///tmp-test/hardening-test.db'
const { default: db } = await import('../db/database.js')

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test', import.meta.url), { recursive: true, force: true })
})

test('concurrent first queries all see a fully-initialized handle', async () => {
  // Fire parallel queries as the very first DB access (cold start).
  const results = await Promise.all([
    db.query('PRAGMA busy_timeout'),
    db.query('PRAGMA journal_mode'),
    db.query('PRAGMA busy_timeout')
  ])

  // busy_timeout PRAGMA returns [{ timeout: 5000 }]
  assert.equal(results[0][0].timeout, 5000)
  assert.equal(results[2][0].timeout, 5000)
  // WAL mode applied
  assert.equal(String(results[1][0].journal_mode).toLowerCase(), 'wal')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && node --test tests/database.test.js`
Expected: FAIL — `busy_timeout` is 0 (not set), and/or the init-flag race surfaces an error.

- [ ] **Step 3: Rewrite `initialize()` with a cached promise and busy_timeout**

In `api/db/database.js`, replace the `constructor` and `initialize()` method of `DatabaseManager` with:

```js
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  initialize() {
    // Cache the in-flight promise so concurrent first callers await one init.
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize().catch((error) => {
      // Allow a later retry if init failed.
      this.initPromise = null;
      this.isInitialized = false;
      throw error;
    });
    return this.initPromise;
  }

  async _doInitialize() {
    const dbUrl = process.env.DATABASE_URL || 'sqlite:///db/cards-sqlite.db';
    let dbPath = dbUrl.replace(/^sqlite:\/\/\//, '');

    if (!dbPath.startsWith('/')) {
      dbPath = join(__dirname, '..', dbPath);
    }

    const dbDir = dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath);

    // Run PRAGMAs directly against the handle (not through the guarded run()),
    // and only mark initialized once they have all completed.
    await this._runRaw('PRAGMA foreign_keys = ON');
    await this._runRaw('PRAGMA journal_mode = WAL');
    await this._runRaw('PRAGMA busy_timeout = 5000');

    this.isInitialized = true;
    console.log(`📊 SQLite database initialized: ${dbPath}`);
    return this.db;
  }

  // Raw run that does NOT trigger initialize() — used only during init.
  _runRaw(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }
```

- [ ] **Step 4: Wrap `query`, `run`, and `get` with retry**

Still in `api/db/database.js`, replace the `query`, `run`, and `get` methods with versions that await init via the cached promise and use `retryOnBusy`:

```js
  async query(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(() => new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) { console.error('❌ Database query error:', err); reject(err); }
        else resolve(rows);
      });
    }));
  }

  async run(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(() => new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) { console.error('❌ Database run error:', err); reject(err); }
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    }));
  }

  async get(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(() => new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) { console.error('❌ Database get error:', err); reject(err); }
        else resolve(row);
      });
    }));
  }
```

Note: transactions (`BEGIN`/`COMMIT`/`ROLLBACK` via `run`) must NOT be retried mid-transaction at the statement level in a way that double-applies; the per-statement retry here only re-runs an individual failed statement before it has taken effect, which is safe for `SQLITE_BUSY` (the statement did not commit). Leave the existing `transaction()` and `close()` methods as they are, except update `close()` to also reset `initPromise` (next step).

- [ ] **Step 5: Reset `initPromise` on close**

In the `close()` method, set `this.initPromise = null` wherever `this.isInitialized = false` is set. The method becomes:

```js
  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            console.error('❌ Database close error:', err);
          }
          this.isInitialized = false;
          this.initPromise = null;
          resolve();
        });
      });
    }
    this.isInitialized = false;
    this.initPromise = null;
  }
```

- [ ] **Step 6: Run the database test**

Run: `cd api && node --test tests/database.test.js`
Expected: PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `cd api && node --test`
Expected: PASS (all backend tests).

- [ ] **Step 8: Commit**

```bash
git add api/db/database.js api/tests/database.test.js
git commit -m "fix: cache DB init promise, set busy_timeout, retry on busy"
```

---

## Task 13: Standardize DB config on `DATABASE_URL`

**Files:**
- Modify: `README.md`
- Modify: `api/.env.example`
- Modify: `app/.env.example` (only if it contains a DB var; otherwise leave)

- [ ] **Step 1: Inspect the current env examples**

Run: `cd .. ; grep -rn "DB_FILE\|DATABASE_URL" README.md api/.env.example app/.env.example`
Expected: shows the README's `DB_FILE=...` line and whatever the `.env.example` files currently contain.

- [ ] **Step 2: Fix the README backend env block**

In `README.md`, in the **Backend (.env)** code block, replace the line:

```bash
DB_FILE=./data/skorbord.db
```

with:

```bash
DATABASE_URL=sqlite:///db/cards-sqlite.db
```

- [ ] **Step 3: Ensure `api/.env.example` documents `DATABASE_URL`**

In `api/.env.example`, ensure there is a `DATABASE_URL` entry and no `DB_FILE` entry. If `DB_FILE` is present, replace it; if no DB var is present, add:

```bash
DATABASE_URL=sqlite:///db/cards-sqlite.db
```

- [ ] **Step 4: Verify there are no remaining `DB_FILE` references**

Run: `grep -rn "DB_FILE" README.md api/ --include=*.md --include=.env.example || echo "no DB_FILE references"`
Expected: `no DB_FILE references`.

- [ ] **Step 5: Commit**

```bash
git add README.md api/.env.example app/.env.example
git commit -m "docs: standardize database config on DATABASE_URL"
```

---

## Task 14: Delete the dead `socketService.js`

**Files:**
- Delete: `app/src/services/socketService.js`

- [ ] **Step 1: Confirm no live code imports it**

Run: `cd app && grep -rn "socketService" src/ || echo "no source references"`
Expected: `no source references` (it is referenced only in `docs/` and root markdown).

- [ ] **Step 2: Delete the file**

Run: `git rm app/src/services/socketService.js`

- [ ] **Step 3: Verify the build**

Run: `cd app && npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove dead socketService second socket stack"
```

---

## Task 15: Simplify `ConnectionContext` to one reconnection mechanism + send auth

**Files:**
- Modify: `app/src/contexts/ConnectionContext.jsx`

This removes the custom `tryConnection` retry ladder that competes with socket.io's native reconnection, and sends `auth: { sqid }` so the (soon-to-be-enabled) socket auth middleware accepts the connection. No automated test (behavioral; verified in Task 18). Make the edits exactly.

- [ ] **Step 1: Replace `createSocket` to include auth and native reconnection**

In `app/src/contexts/ConnectionContext.jsx`, replace the `createSocket` function:

```jsx
  const createSocket = (socketUrl, options = {}) => {
    console.log('🔌 Creating socket connection to:', socketUrl)
    return io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      upgrade: true,
      rememberUpgrade: false,
      ...options
    })
  }
```

with:

```jsx
  const createSocket = (socketUrl) => {
    console.log('🔌 Creating socket connection to:', socketUrl)
    return io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      upgrade: true,
      rememberUpgrade: false,
      auth: { sqid } // required by the server socket auth middleware
    })
  }
```

- [ ] **Step 2: Replace the connection effect with a single socket + native reconnection**

Replace the entire `useEffect(() => { ... }, [sqid])` block with:

```jsx
  useEffect(() => {
    if (!sqid) return

    const socketUrl = process.env.NODE_ENV === 'production' ? __API_URL__ : 'http://localhost:2525'
    const newSocket = createSocket(socketUrl)

    newSocket.on('connect', () => {
      console.log('✅ Socket connected:', newSocket.id)
      newSocket.emit('join-sqid', sqid)
      setIsConnected(true)
      setConnectionError(null)
      setIsReconnecting(false)
      setConnectionAttempts(0)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      setIsConnected(false)
      // socket.io auto-reconnects unless the server explicitly disconnected us.
      if (reason === 'io server disconnect') {
        newSocket.connect()
      }
    })

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      setIsConnected(false)
      setConnectionError('Unable to connect to server')
    })

    newSocket.io.on('reconnect_attempt', (attempt) => {
      console.log('Socket reconnect attempt:', attempt)
      setIsReconnecting(true)
      setConnectionAttempts(attempt)
    })

    newSocket.io.on('reconnect', (attempt) => {
      console.log('Socket reconnected after', attempt, 'attempts')
      setIsReconnecting(false)
      setConnectionError(null)
    })

    newSocket.io.on('reconnect_failed', () => {
      console.error('Socket reconnect failed')
      setConnectionError('Unable to reconnect')
      setIsReconnecting(false)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [sqid])
```

Note: manager-level events (`reconnect_attempt`, `reconnect`, `reconnect_failed`) are on `socket.io`, not the socket itself — that is why they are registered on `newSocket.io`.

- [ ] **Step 3: Verify the build**

Run: `cd app && npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/src/contexts/ConnectionContext.jsx
git commit -m "fix: single socket with native reconnection and auth sqid"
```

---

## Task 16: Disconnected-tap UX in `GamePlay`

**Files:**
- Modify: `app/src/components/modern/GamePlay.jsx`

- [ ] **Step 1: Add a reconnecting banner above the players grid**

In `app/src/components/modern/GamePlay.jsx`, immediately before the `{/* Players Grid */}` comment, add:

```jsx
      {/* Connection warning - changes may not be saved while offline */}
      {!gameManager.isConnected && (
        <div className="alert alert-warning">
          <span>⚠️ Reconnecting — score changes may not be saved.</span>
        </div>
      )}
```

(`gameManager.isConnected` is already returned by `useGameManager`.)

- [ ] **Step 2: Disable score controls while disconnected**

In the same file, in the `<ReorderablePlayerCard>` props, change:

```jsx
                    disabled={isFinalized || gameManager.loading || gameState.isReorderMode}
```

to:

```jsx
                    disabled={isFinalized || gameManager.loading || gameState.isReorderMode || !gameManager.isConnected}
```

- [ ] **Step 3: Verify the build**

Run: `cd app && npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/modern/GamePlay.jsx
git commit -m "feat: warn and disable scoring while socket is disconnected"
```

---

## Task 17: Per-sqid score rate limiter

**Files:**
- Create: `api/middleware/scoreRateLimit.js`
- Test: `api/tests/scoreRateLimit.test.js`
- Modify: `api/routes/stats.js`

- [ ] **Step 1: Write the failing test**

Create `api/tests/scoreRateLimit.test.js`:

```js
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
  // Different sqid has its own bucket
  assert.equal(limiter.take('b', now), true)
})

test('refills over time', () => {
  const limiter = createScoreRateLimiter({ capacity: 2, refillPerSec: 1 })
  const t0 = 0
  assert.equal(limiter.take('a', t0), true)
  assert.equal(limiter.take('a', t0), true)
  assert.equal(limiter.take('a', t0), false)
  // 1 second later, 1 token refilled
  assert.equal(limiter.take('a', t0 + 1000), true)
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && node --test tests/scoreRateLimit.test.js`
Expected: FAIL — cannot find module `../middleware/scoreRateLimit.js`.

- [ ] **Step 3: Implement the limiter**

Create `api/middleware/scoreRateLimit.js`:

```js
/**
 * Per-sqid token-bucket rate limiter for score writes. In-memory, suitable for
 * the single-process Pi deployment. The per-IP express-rate-limit still applies
 * globally; this adds a per-board cap so one sqid cannot be flooded.
 *
 * @param {{ capacity?: number, refillPerSec?: number }} [opts]
 */
export function createScoreRateLimiter({ capacity = 20, refillPerSec = 10 } = {}) {
  const buckets = new Map(); // sqid -> { tokens, last }

  function take(key, now = Date.now()) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, last: now };
      buckets.set(key, bucket);
    }
    // Refill based on elapsed time.
    const elapsedSec = Math.max(0, (now - bucket.last) / 1000);
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
    bucket.last = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  function middleware(req, res, next) {
    const key = req.params.sqid || 'unknown';
    if (take(key)) {
      return next();
    }
    return res.status(429).json({
      success: false,
      error: 'Too many score updates, slow down'
    });
  }

  return { take, middleware };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && node --test tests/scoreRateLimit.test.js`
Expected: PASS (`# pass 3`).

- [ ] **Step 5: Wire the limiter into the stats POST route**

In `api/routes/stats.js`, add the import near the top:

```js
import { createScoreRateLimiter } from '../middleware/scoreRateLimit.js';
```

Then, after `const router = express.Router({ mergeParams: true });`, add:

```js
// Per-sqid cap on score writes (in addition to the global per-IP limiter).
const scoreLimiter = createScoreRateLimiter({ capacity: 30, refillPerSec: 15 });
```

Finally, add `scoreLimiter.middleware` to the `POST '/'` route's middleware chain, before `validateUpdateStats`. Change:

```js
router.post('/', validateGameAccess, validateUpdateStats, async (req, res, next) => {
```

to:

```js
router.post('/', validateGameAccess, scoreLimiter.middleware, validateUpdateStats, async (req, res, next) => {
```

- [ ] **Step 6: Syntax-check and run backend suite**

Run: `cd api && node --check routes/stats.js && node --test`
Expected: no syntax errors; all backend tests PASS.

- [ ] **Step 7: Commit**

```bash
git add api/middleware/scoreRateLimit.js api/tests/scoreRateLimit.test.js api/routes/stats.js
git commit -m "feat: per-sqid score write rate limiter"
```

---

## Task 18: Enable socket auth

**Files:**
- Modify: `api/index.js`
- Test: `api/tests/socketAuth.test.js`

The client already sends `auth: { sqid }` after Task 15. The middleware already exists in `api/middleware/socketAuth.js`. This task enables it and tests it directly.

- [ ] **Step 1: Write the failing test**

Create `api/tests/socketAuth.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it passes against the existing middleware**

Run: `cd api && node --test tests/socketAuth.test.js`
Expected: PASS — the middleware already behaves correctly; this test locks in that behavior before we enable it.

(If any assertion fails, fix `api/middleware/socketAuth.js` to match — but per the current source it should pass as written.)

- [ ] **Step 3: Enable the middleware in `index.js`**

In `api/index.js`, uncomment the import (line ~26):

```js
import { socketAuthMiddleware } from './middleware/socketAuth.js';
```

and uncomment the registration (line ~184), so the socket section reads:

```js
// Socket.IO middleware and handlers
io.use(socketAuthMiddleware);
io.on('connection', (socket) => handleConnection(io, socket));
```

- [ ] **Step 4: Make the startup DB log consistent**

In `api/index.js`, the startup log references `process.env.DATABASE_URL`, which may be undefined when the default is used. Change:

```js
  console.log(`🗄️ Database: ${process.env.DATABASE_URL}`);
```

to:

```js
  console.log(`🗄️ Database: ${process.env.DATABASE_URL || 'sqlite:///db/cards-sqlite.db (default)'}`);
```

- [ ] **Step 5: Syntax-check and run the full backend suite**

Run: `cd api && node --check index.js && node --test`
Expected: no syntax errors; all backend tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/index.js api/tests/socketAuth.test.js
git commit -m "feat: enable socket auth middleware (require valid sqid)"
```

---

## Task 19: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend suite**

Run: `cd api && node --test`
Expected: all tests PASS, `# fail 0`.

- [ ] **Step 2: Run the entire frontend suite**

Run: `cd app && npm run test:run`
Expected: all tests PASS.

- [ ] **Step 3: Production build of the frontend**

Run: `cd app && npx vite build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Manual two-client smoke test (documented for the human reviewer)**

Start both servers (`npm run dev` from repo root, or the API and Vite dev servers individually). Open the same `sqid` URL in two browser windows. Verify:
- Tapping +1 in window A updates A immediately and updates B within ~1 round-trip, with a "+1" tally flash on B.
- Window A does NOT show a duplicated "+1" flash from its own broadcast.
- Network tab on B shows the `score_update` socket frame but **no** `GET /api/.../games/active` or `/stats` request per tap.
- Disconnect the API server: both windows show the "Reconnecting" banner and score buttons disable. Restart the API: they reconnect and re-enable without a page reload.

- [ ] **Step 5: Push the branch**

```bash
git push origin HEAD:refs/heads/claude-eloquent-ishizaka-d9c665
```

---

## Spec Coverage Check

- Cluster 1 (score sync): Tasks 2–7 (canonical payload, relay removal, gameAPI, direct apply, tally suppression, dead-code removal). ✓
- Cluster 2 (UI redraw): Tasks 8–10 (PlayerCard pure props, tally threading, ModernCardApp hoist). ✓
- Cluster 3 (DB): Tasks 11–13 (retry helper, init promise + busy_timeout, config standardization). ✓
- Cluster 4 (socket/UX): Tasks 14–16 (delete socketService, single reconnection, disconnected-tap UX). ✓
- Cluster 5 (auth): Tasks 17–18 (per-sqid rate limit, socket auth enable). ✓
- Testing requirements (reducer, redraw render-count, DB init/busy, socket schema, auth, tally suppression): Tasks 2, 8, 12, 3, 18, 6. ✓
