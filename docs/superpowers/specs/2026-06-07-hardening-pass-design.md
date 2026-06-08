# Skorbord Hardening Pass — Design Spec

**Date:** 2026-06-07
**Status:** Approved design, ready for implementation planning
**Scope:** Correctness and performance hardening of the existing architecture. No data-model redesign, no user accounts.

## Goal

Fix the concrete races, redraw storms, database-connectivity gaps, and socket/UX
problems found in review, while keeping the current architecture intact. The
in-app configuration / data-management redesign is explicitly a **separate future
spec** and is out of scope here.

## Non-goals (flagged for later, not this pass)

- Redesign of in-app configuration and client/server data management (single
  source of truth, per-board config ownership). Its own spec.
- Real user authentication / accounts. We add lightweight guardrails only.
- Removing the legacy component tree wholesale (we only stop it from causing
  remounts; we do not migrate or delete legacy game logic).

## Background

Skorbord is a mobile-first card-scoring app: React 18 + Vite frontend, Express +
Socket.IO + SQLite (sqlite3, WAL) backend, deployed on a Raspberry Pi. Boards are
identified by a short `sqid` taken from the URL. Multiple clients in the same
`sqid` room score the same game in real time.

Review surfaced five clusters of issues. Each cluster below states the problem,
the fix, and the acceptance criteria.

---

## Cluster 1 — Score sync (server-authoritative)

### Problem

A single score tap currently produces **two** real-time events with **different
schemas**:

- The REST `POST /stats` route broadcasts `score_update` with
  `{ stats, player_id, score_change }` (`api/routes/stats.js:127`).
- The client also emits `update_score`, which the socket handler relays as a
  second `score_update` with `{ playerId, change }` (`api/sockets/handlers.js:28`).

The receiver reads `data.playerId` / `data.change` (`app/src/hooks/useGameManager.js:282`),
so the server's authoritative event arrives with those fields `undefined`. The two
paths fight each other.

Additionally, every remote score event triggers a full `getGame` + `getGameStats`
refetch (`useGameManager.js:314`), and `getGameStats` internally calls
`getActiveGame` — roughly three HTTP requests on **every other client per tap**.
Each local tap also calls `getActiveGame` before its POST (`gameAPI.js:112`), an
extra round-trip per tap. On a Raspberry Pi under rapid tapping this is a
thundering herd.

### Decision

**Server-authoritative model with one canonical event.** The REST POST is the only
broadcaster. The client relay is removed. Clients apply the broadcast payload
directly instead of refetching. The acting client keeps its optimistic update for
instant local feedback and reconciles against the authoritative event when it
returns.

### Canonical event schema

`score_update` (server → all clients in the sqid room):

```json
{
  "sqid": "<sqid>",
  "gameId": "<gameId>",
  "stats": [ /* full authoritative stats rows */ ],
  "playerId": "<playerId | null>",
  "change": "<integer delta | null>",
  "winnerId": "<playerId | null>",
  "originSocketId": "<socketId | null>"
}
```

`playerId` / `change` are populated for single-player taps (the common case) to
drive the "+N" tally animation; `null` for multi-stat updates. `originSocketId` is
the socket id the acting client sent in its POST body, echoed back so that client
can suppress a duplicate tally animation.

### Changes

**Backend**

- Delete the `update_score` relay handler (`api/sockets/handlers.js:28-35`). Keep
  `join-sqid`, `player_activity`, `show_rivalry_stats`, and disconnect handling.
- `api/routes/stats.js` POST: emit the canonical schema above. Accept an optional
  `socketId` in the request body and echo it as `originSocketId`. Keep broadcasting
  to the whole sqid room (`req.io.to(...)`) so the actor reconciles too.

**Frontend**

- `gameAPI.js`: change `updatePlayerScore` and `getGameStats` to accept `gameId`
  from caller state instead of calling `getActiveGame` first. Include the client
  `socketId` in the score POST body. Fix the corrupted file header
  (`gameAPI.js:1-23` is a garbled JSDoc comment with pasted method bodies).
- `useGameManager.js` `updatePlayerScore`: keep optimistic update + tally
  accumulator + rolling 3s timer; **remove** the `socket.emit('update_score', ...)`
  block. Pass `gameState.game.id` to the API call.
- `useGameManager.js` `handleScoreUpdate`: **apply `data.stats` directly** via a
  new `GAME_STATS_SYNCED` reducer action (no refetch). Run `checkForWinner` against
  the authoritative `data.stats`. Use `data.winnerId` when present. Skip the
  `SCORE_TALLY_SET` animation when `data.originSocketId === socket.id` (the actor
  already displayed its accumulated tally locally), but still apply the stats
  reconciliation.
- `GameStateContext.jsx`: add `GAME_STATS_SYNCED` action that replaces only
  `gameStats` (leaving `game`, `dealer`, `scoreTallies`, `glowingCards` untouched).

**Dead-code removal in this cluster**

- Remove the broken `useDealerManager` export (`useGameManager.js:473`) — it
  references `gameState`, `loadGame`, `updatePlayerScore`, etc. that are not in its
  scope and would throw if invoked. The working `setDealer` already lives in
  `useGameManager`.
- Remove the unreachable code after `return response` in `updatePlayerOrder`
  (`useGameManager.js:260`).

### Acceptance criteria

- A score tap produces exactly one `score_update` broadcast, in the canonical
  schema.
- Receiving clients update their cards and show the "+N" tally **without** issuing
  any `getGame` / `getGameStats` request.
- The acting client issues exactly one HTTP request per tap (the POST) — no
  preceding `getActiveGame`.
- The acting client does not double-animate its own tally.
- Winner state derives from the authoritative stats and matches the server.

---

## Cluster 2 — UI redraw

### Problem

`PlayerCard` is wrapped in `memo()` but calls `useGameState()` internally to read
its tally (`app/src/components/modern/PlayerCard.jsx:55`). Subscribing to the whole
context defeats the memo: any state change anywhere — any player's tally tick,
score, glow, or dealer change — re-renders **every** card.

`ModernCardApp` declares `ModernApp` and `LegacyApp` as functions **inside** its
render body (`app/src/components/ModernCardApp.jsx:120`). They get a new identity on
every render, so React remounts the entire subtree and discards child state; the
outer `memo()` is therefore moot.

### Changes

- `PlayerCard`: remove the internal `useGameState()`. Receive `tally` (this
  player's slice only) as a prop. The component becomes a pure function of its
  props, so `memo()` correctly bails out when `score` / `tally` / `isDealer` /
  `isWinner` are unchanged. Remove the in-render `console.debug`
  (`PlayerCard.jsx:139-141`).
- Parent `modern/GamePlay.jsx`: when mapping players, pass
  `tally={scoreTallies[player.id]}` to each `PlayerCard`. `GamePlay` still
  re-renders on context change (it must, to re-sort), but only the card whose own
  props changed re-renders.
- `ModernCardApp`: hoist the JSX out of in-render component functions. Since
  `useModern` is hardcoded `true`, inline the modern layout directly into the
  return and drop the dead `LegacyApp` wrapper function. Keep the `memo()` (now
  meaningful) or remove it — either is acceptable once the remount is fixed.

### Acceptance criteria

- Updating one player's score re-renders only that player's card (verified by a
  render-count test).
- Switching views (`setup` / `playing` / `stats` / `admin`) does not remount the
  whole app subtree on unrelated state changes.

---

## Cluster 3 — Database connectivity

### Problem

`api/db/database.js` is a lazy global sqlite3 singleton with WAL enabled (good)
but:

- No `busy_timeout`, so concurrent writes can fail fast with `SQLITE_BUSY`.
- `isInitialized` is set `true` **before** the PRAGMAs finish (`database.js:40`),
  so a concurrent first caller can receive a half-initialized handle.
- No retry or reopen on transient errors.
- Config drift: the README documents `DB_FILE`, the code reads `DATABASE_URL`
  (`database.js:22`), and `index.js` logs `DATABASE_URL` at startup.

### Changes

- Add `PRAGMA busy_timeout = 5000` in `initialize()` (after open, alongside the
  existing `foreign_keys` and `journal_mode` PRAGMAs).
- Replace the early `isInitialized = true` flag with a cached `initPromise`:
  the first caller creates the promise; concurrent callers `await` the same one.
  Run the init PRAGMAs against `this.db` directly (not through the guarded `run`)
  so they don't recurse, then resolve.
- Add a small retry wrapper around `run` / `get` / `query` that retries
  `SQLITE_BUSY` / `SQLITE_IOERR` 2–3 times with short backoff, and reopens the
  database if the handle is closed.
- Standardize configuration on `DATABASE_URL` (the value the code and deploy
  already use). Update the README's `DB_FILE` references and `app`/`api`
  `.env.example` to match. Keep the existing default
  (`sqlite:///db/cards-sqlite.db`).

### Acceptance criteria

- Concurrent first queries on a cold start all observe a fully-initialized handle
  (all PRAGMAs applied) — covered by a test that fires parallel queries before any
  `await initialize()`.
- A transient `SQLITE_BUSY` is retried rather than surfaced immediately.
- README, `.env.example`, and code agree on `DATABASE_URL`.

---

## Cluster 4 — Socket / UX cleanup

### Problem

- `app/src/services/socketService.js` is a complete second socket implementation
  that no live code imports (referenced only in docs) — dead weight and a
  confusion hazard.
- `ConnectionContext` runs a custom `tryConnection` retry ladder
  (`app/src/contexts/ConnectionContext.jsx:44`) **on top of** socket.io's built-in
  reconnection (`reconnection: true`). On `connect_error` it closes the socket and
  manually advances to the next attempt — the two mechanisms compete.
- A tap while disconnected fails without clear feedback.

### Changes

- Delete `app/src/services/socketService.js`. (Doc references are stale and can be
  left or cleaned opportunistically; no code change depends on them.)
- `ConnectionContext`: remove the recursive `tryConnection(attemptNumber)` ladder
  and the `newSocket.close()` on `connect_error`. Keep a single socket with native
  socket.io reconnection. Retain at most the one deterministic URL choice
  (dev-direct `http://localhost:2525` vs production `__API_URL__`). Map socket.io's
  `connect` / `disconnect` / `reconnect_*` events to the existing context state.
- Disconnected-tap UX: gate the score controls on `isConnected` and show a visible
  "reconnecting — changes may not be saved" banner instead of a silent skip. The
  existing failed-POST path already reverts the optimistic update and toasts. **No
  offline queue** (YAGNI for this pass).

### Acceptance criteria

- `socketService.js` is gone and the app builds and connects.
- There is exactly one reconnection mechanism; logs show no competing manual +
  native reconnect attempts.
- Tapping while disconnected produces visible feedback, not a silent no-op.

---

## Cluster 5 — Lightweight auth hardening

### Problem

Socket auth is commented out (`api/index.js:184`) and REST routes have no
per-board access control: anyone with the sqid URL has full write access. For a
casual friends-and-family scoreboard this trust model is accepted, but it has no
guardrails at all.

### Decision

Keep the open-by-URL trust model (no accounts), but add guardrails.

### Changes

- Implement / re-enable `socketAuthMiddleware` (`api/middleware/socketAuth.js`,
  wired at `api/index.js:184`) so a socket must present a valid `sqid` before it is
  allowed to emit game events.
- Add a server-side per-sqid rate limit on score writes (the current
  `express-rate-limit` is per-IP only). A simple in-memory token bucket keyed by
  sqid is sufficient for the single-process Pi deployment.

### Acceptance criteria

- A socket cannot emit game events without a valid sqid.
- Score writes for a single sqid are rate-limited server-side; normal play is
  unaffected, abusive bursts are throttled.

---

## Testing

Existing jest (api) and vitest (app) suites must stay green. Add:

- **Reducer:** `GAME_STATS_SYNCED` replaces only `gameStats` and leaves `game`,
  `dealer`, `scoreTallies`, `glowingCards` intact.
- **Redraw:** a render-count test proving one player's score change re-renders only
  that player's `PlayerCard`, not its siblings.
- **DB:** parallel queries on a cold start all see a fully-initialized handle;
  `busy_timeout` is set; a simulated `SQLITE_BUSY` is retried.
- **Socket schema:** the unified `score_update` carries the canonical fields, and a
  client suppresses its own tally when `originSocketId` matches its socket id.
- **Auth:** a socket without a valid sqid is rejected; per-sqid score rate limit
  triggers under burst.

## Rollout / risk notes

- The score-sync change is behavioral; verify with two clients in one sqid that
  spectators still update (one RTT behind the actor) and tallies animate.
- The DB `initPromise` refactor touches the hot path of every query — keep the
  retry conservative to avoid masking real errors.
- Auth hardening must not break the existing legacy components that share the same
  socket; verify both modern and legacy paths still connect.
