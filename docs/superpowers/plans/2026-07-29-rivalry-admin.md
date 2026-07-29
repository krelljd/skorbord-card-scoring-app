# Rivalry Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin rename rivalry participants and delete rivalries (with all their games/stats), gated behind a shared PIN instead of the app's current "anyone with the sqid URL" access model.

**Architecture:** A new `requireAdminPin` Express middleware compares an `X-Admin-Pin` request header against an `ADMIN_PIN` env var (timing-safe, fails closed if unset) and gates three routes: a new PIN-verification endpoint, the existing (currently unused) player-rename endpoint, and a new rivalry-delete endpoint. Rivalry deletion and player renaming are pulled out into small, directly-testable helper functions in `api/utils/`, called by thin route handlers. A new `RivalryAdmin.jsx` view — reached via a "Manage" button on the existing Rivalry Stats screen — shows a PIN-entry gate, then a per-rivalry rename/delete UI. The PIN is cached client-side in `sessionStorage` per sqid and resent on every gated call.

**Tech Stack:** Express 4 + `express-rate-limit` (already a dependency) on the backend; React 18 + Vitest/@testing-library/react on the frontend. Backend tests use Node's built-in `node --test` runner against a throwaway SQLite file (existing project convention — no supertest in this repo).

## Global Constraints

- Fail closed: if `ADMIN_PIN` isn't set on the server, gated routes reject every request (503), never fall open.
- PIN comparison must be timing-safe (`crypto.timingSafeEqual`).
- `verify-pin` and the two gated mutation routes (`PUT /api/:sqid/players/:playerId`, `DELETE /api/:sqid/rivalries/:rivalryId`) get a dedicated rate limiter: 10 requests / 15 minutes / IP.
- Deleting a rivalry deletes everything under it: the rivalry row, its games, those games' stats, and (via existing `ON DELETE CASCADE` FKs) `rivalry_players`, `rivalry_game_types`, `rivalry_stats`, `rivalry_player_stats`. Players themselves are never deleted by this feature.
- Renaming a participant edits the shared `players` row for that sqid — the new name appears everywhere that player is used, not just in one rivalry.
- The PIN travels as a header (`X-Admin-Pin`) on every gated request; no server-side session/token. Cached in `sessionStorage`, keyed per sqid.
- No new npm dependencies. Reuse `express-rate-limit` (backend) and `@testing-library/react` + `vitest` (frontend), both already installed.
- Follow existing test conventions exactly: backend tests import `db` after setting `process.env.DATABASE_URL` to a throwaway file under `api/tmp-test/`, clean up in `after()`; frontend tests mock `global.fetch` and render with Testing Library.

---

## File Structure

**Backend — new files:**
- `api/middleware/adminAuth.js` — `requireAdminPin` middleware + `adminActionLimiter` rate limiter.
- `api/routes/admin.js` — `POST /api/:sqid/admin/verify-pin`.
- `api/utils/playerAdmin.js` — `renamePlayer(db, { sqidId, playerId, name })`.
- `api/utils/rivalryAdmin.js` — `deleteRivalryCascade(db, { sqidId, rivalryId })`.
- `api/tests/helpers/applySchema.js` — test helper that loads the real migration schema into a throwaway DB.
- `api/tests/adminAuth.test.js`, `api/tests/playerAdmin.test.js`, `api/tests/rivalryAdmin.test.js`, `api/tests/admin.route.test.js`.

**Backend — modified files:**
- `api/routes/players.js` — gate `PUT /:playerId` with `adminActionLimiter` + `requireAdminPin`, delegate to `renamePlayer`.
- `api/routes/rivalries.js` — add `DELETE /:rivalryId`, gated, delegating to `deleteRivalryCascade`.
- `api/index.js` — mount the new admin router.
- `api/.env.example` — document `ADMIN_PIN`.

**Frontend — new files:**
- `app/src/utils/adminPin.js` — `sessionStorage` helpers scoped per sqid.
- `app/src/utils/adminPin.test.js`
- `app/src/components/RivalryAdmin.jsx` — the new admin view.
- `app/src/components/RivalryAdmin.test.jsx`

**Frontend — modified files:**
- `app/src/components/LazyComponents.jsx` — export `LazyRivalryAdmin`.
- `app/src/components/ModernCardApp.jsx` — add `'rivalry-admin'` view.
- `app/src/components/RivalryStats.jsx` — add a "Manage" entry point button.

---

### Task 1: Admin PIN middleware + rate limiter

**Files:**
- Create: `api/middleware/adminAuth.js`
- Test: `api/tests/adminAuth.test.js`
- Modify: `api/.env.example`

**Interfaces:**
- Produces: `requireAdminPin(req, res, next)` — Express middleware. `adminActionLimiter` — an `express-rate-limit` middleware instance (10 req / 15 min / IP).

- [ ] **Step 1: Write the failing tests**

```js
// api/tests/adminAuth.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireAdminPin } from '../middleware/adminAuth.js'

function makeRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

test('fails closed with 503 when ADMIN_PIN is not configured', () => {
  delete process.env.ADMIN_PIN
  const req = { headers: {} }
  const res = makeRes()
  let nextCalled = false
  requireAdminPin(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.success, false)
})

test('rejects a missing X-Admin-Pin header', () => {
  process.env.ADMIN_PIN = 'secret123'
  const req = { headers: {} }
  const res = makeRes()
  let err = null
  requireAdminPin(req, res, (e) => { err = e })
  assert.ok(err instanceof Error)
  assert.equal(err.name, 'ForbiddenError')
})

test('rejects a wrong X-Admin-Pin header', () => {
  process.env.ADMIN_PIN = 'secret123'
  const req = { headers: { 'x-admin-pin': 'wrong' } }
  const res = makeRes()
  let err = null
  requireAdminPin(req, res, (e) => { err = e })
  assert.ok(err instanceof Error)
  assert.equal(err.name, 'ForbiddenError')
})

test('calls next() with no error for the correct PIN', () => {
  process.env.ADMIN_PIN = 'secret123'
  const req = { headers: { 'x-admin-pin': 'secret123' } }
  const res = makeRes()
  let called = false
  let errArg = 'unset'
  requireAdminPin(req, res, (e) => { called = true; errArg = e })
  assert.equal(called, true)
  assert.equal(errArg, undefined)
})

test('rejects a PIN of different length without throwing', () => {
  process.env.ADMIN_PIN = 'secret123'
  const req = { headers: { 'x-admin-pin': 'short' } }
  const res = makeRes()
  let err = null
  assert.doesNotThrow(() => {
    requireAdminPin(req, res, (e) => { err = e })
  })
  assert.equal(err.name, 'ForbiddenError')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `api/`): `node --test tests/adminAuth.test.js`
Expected: FAIL — `Cannot find module '../middleware/adminAuth.js'`

- [ ] **Step 3: Implement the middleware**

```js
// api/middleware/adminAuth.js
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { ForbiddenError } from './errorHandler.js';

/**
 * Gates a route behind the shared ADMIN_PIN env var. Fails closed (503) if
 * ADMIN_PIN isn't configured; otherwise does a timing-safe comparison of
 * the X-Admin-Pin header against it.
 */
export function requireAdminPin(req, res, next) {
  const configuredPin = process.env.ADMIN_PIN;
  if (!configuredPin) {
    res.status(503).json({ success: false, error: 'Admin features not configured' });
    return;
  }

  const suppliedPin = req.headers['x-admin-pin'];
  if (typeof suppliedPin !== 'string' || !pinsMatch(suppliedPin, configuredPin)) {
    next(new ForbiddenError('Invalid admin PIN'));
    return;
  }

  next();
}

function pinsMatch(supplied, configured) {
  const suppliedBuf = Buffer.from(supplied);
  const configuredBuf = Buffer.from(configured);
  if (suppliedBuf.length !== configuredBuf.length) {
    // Still run a timing-safe compare of matching length so a length
    // mismatch doesn't short-circuit faster than a content mismatch.
    crypto.timingSafeEqual(suppliedBuf, Buffer.alloc(suppliedBuf.length));
    return false;
  }
  return crypto.timingSafeEqual(suppliedBuf, configuredBuf);
}

/**
 * Rate limiter for PIN-gated admin endpoints, to blunt brute-forcing a
 * short PIN. Not covered by automated tests (same as the app's existing
 * global rate limiter in index.js) since express-rate-limit's internals
 * need a real HTTP request; verified manually per the tasks that use it.
 */
export const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many admin attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/adminAuth.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Document the env var**

Edit `api/.env.example`, appending:

```
# Shared PIN gating rivalry admin actions (rename participant, delete
# rivalry). Admin routes reject every request with 503 until this is set.
ADMIN_PIN=
```

- [ ] **Step 6: Commit**

```bash
git add api/middleware/adminAuth.js api/tests/adminAuth.test.js api/.env.example
git commit -m "feat: add PIN-gated admin auth middleware"
```

---

### Task 2: Verify-PIN endpoint

**Files:**
- Create: `api/routes/admin.js`
- Test: `api/tests/admin.route.test.js`
- Modify: `api/index.js`

**Interfaces:**
- Consumes: `requireAdminPin`, `adminActionLimiter` from `api/middleware/adminAuth.js` (Task 1).
- Produces: `POST /api/:sqid/admin/verify-pin` — 200 `{ success: true, data: { message: 'PIN verified' } }` on a correct `X-Admin-Pin` header, otherwise whatever `requireAdminPin` produces (403/503).

- [ ] **Step 1: Write the failing test**

```js
// api/tests/admin.route.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/admin.route.test.js`
Expected: FAIL — `Cannot find module '../routes/admin.js'`

- [ ] **Step 3: Implement the route**

```js
// api/routes/admin.js
import express from 'express';
import { createResponse } from '../utils/helpers.js';
import { requireAdminPin, adminActionLimiter } from '../middleware/adminAuth.js';

const router = express.Router({ mergeParams: true });

/**
 * POST /api/:sqid/admin/verify-pin - Check an admin PIN
 * The PIN travels in the X-Admin-Pin header (requireAdminPin reads it);
 * this just turns a pass into a response the UI can key off before
 * caching the PIN for subsequent admin calls.
 */
export function verifyPinHandler(req, res) {
  res.json(createResponse(true, { message: 'PIN verified' }));
}

router.post('/verify-pin', adminActionLimiter, requireAdminPin, verifyPinHandler);

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/admin.route.test.js`
Expected: PASS

- [ ] **Step 5: Mount the router**

Edit `api/index.js`. Add the import near the other route imports (after the `rivalryRoutes` import, line 20):

```js
import rivalryRoutes from './routes/rivalries.js';
import adminRoutes from './routes/admin.js';
import favoritesRoutes from './routes/favorites.js';
```

Add the mount after the rivalries mount (currently line 172, `app.use('/api/:sqid/rivalries', validateSquid, rivalryRoutes);`):

```js
app.use('/api/:sqid/rivalries', validateSquid, rivalryRoutes);
app.use('/api/:sqid/admin', validateSquid, adminRoutes);
app.use('/api/:sqid/game_types/:gameTypeId/favorite', validateSquid, favoritesRoutes);
```

- [ ] **Step 6: Manually verify the route is wired**

In `api/.env` (local, not committed), set `ADMIN_PIN=devpin1234`. Then, from `api/`:

```bash
npm run dev
```

In another terminal:

```bash
curl -s -X POST http://localhost:2525/api/demo/admin/verify-pin -H "X-Admin-Pin: devpin1234"
curl -s -X POST http://localhost:2525/api/demo/admin/verify-pin -H "X-Admin-Pin: wrong"
```

Expected: first call returns `{"success":true,"data":{"message":"PIN verified"}}`; second returns `{"success":false,"error":"Forbidden"}` with a 403 status (`curl -i` to see the status line if needed). Stop the dev server after checking.

- [ ] **Step 7: Commit**

```bash
git add api/routes/admin.js api/tests/admin.route.test.js api/index.js
git commit -m "feat: add PIN-gated admin PIN verification endpoint"
```

---

### Task 3: Player rename helper + gated route

**Files:**
- Create: `api/utils/playerAdmin.js`
- Create: `api/tests/helpers/applySchema.js`
- Test: `api/tests/playerAdmin.test.js`
- Modify: `api/routes/players.js:1-10,228-266`

**Interfaces:**
- Produces: `applySchema(db)` (test helper) — applies every migration's "Up" SQL to a throwaway DB handle. `renamePlayer(db, { sqidId, playerId, name })` — returns the updated player row `{ id, sqid_id, name, created_at, color }`; throws `ValidationError` (empty/too-long name), `NotFoundError` (player doesn't exist in that sqid), or `ConflictError` (name collides case-insensitively with another player in the sqid).
- Consumes: `NotFoundError`, `ConflictError`, `ValidationError` from `api/middleware/errorHandler.js` (already exist). `requireAdminPin`, `adminActionLimiter` from Task 1.

- [ ] **Step 1: Create the schema test helper**

```js
// api/tests/helpers/applySchema.js
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Applies the "Up" portion of every migration in db/migrations, in order,
 * against the given db handle. Tests use this instead of a hand-rolled
 * subset of tables so foreign keys, cascades, and unique indexes all
 * behave exactly like production.
 */
export async function applySchema(db) {
  const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(join(migrationsDir, file), 'utf8');
    const upSql = sql.split('-- +migrate Down')[0];
    const statements = upSql.split(';').map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) {
      await db.run(statement);
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

```js
// api/tests/playerAdmin.test.js
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

process.env.DATABASE_URL = 'sqlite:///tmp-test/player-admin-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const { renamePlayer } = await import('../utils/playerAdmin.js')

before(async () => {
  await applySchema(db)
  await db.run("INSERT INTO sqids (id, name) VALUES ('sqidA', 'Sqid A')")
  await db.run("INSERT INTO players (id, sqid_id, name, color) VALUES ('p1', 'sqidA', 'Alice', 'primary')")
  await db.run("INSERT INTO players (id, sqid_id, name, color) VALUES ('p2', 'sqidA', 'Bob', 'secondary')")
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test', import.meta.url), { recursive: true, force: true })
})

test('renames a player and returns the updated row', async () => {
  const updated = await renamePlayer(db, { sqidId: 'sqidA', playerId: 'p1', name: '  Alicia  ' })
  assert.equal(updated.name, 'Alicia')
  const row = await db.get('SELECT name FROM players WHERE id = ?', ['p1'])
  assert.equal(row.name, 'Alicia')
})

test('rejects a rename that collides case-insensitively with another player', async () => {
  await assert.rejects(
    renamePlayer(db, { sqidId: 'sqidA', playerId: 'p2', name: 'alicia' }),
    (err) => err.name === 'ConflictError'
  )
})

test('throws NotFoundError for a player outside the sqid', async () => {
  await assert.rejects(
    renamePlayer(db, { sqidId: 'other-sqid', playerId: 'p2', name: 'Bobby' }),
    (err) => err.name === 'NotFoundError'
  )
})

test('rejects an empty name', async () => {
  await assert.rejects(
    renamePlayer(db, { sqidId: 'sqidA', playerId: 'p2', name: '   ' }),
    (err) => err.name === 'ValidationError'
  )
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/playerAdmin.test.js`
Expected: FAIL — `Cannot find module '../utils/playerAdmin.js'`

- [ ] **Step 4: Implement the helper**

```js
// api/utils/playerAdmin.js
import { NotFoundError, ConflictError, ValidationError } from '../middleware/errorHandler.js';

/**
 * Renames a player within a sqid, rejecting names that collide
 * case-insensitively with another player already in that sqid.
 * @param {import('../db/database.js').default} db
 * @param {{ sqidId: string, playerId: string, name: string }} params
 * @returns {Promise<{ id: string, sqid_id: string, name: string, created_at: string, color: string }>}
 */
export async function renamePlayer(db, { sqidId, playerId, name }) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Player name is required');
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 64) {
    throw new ValidationError('Player name must be 64 characters or less');
  }

  const player = await db.get(
    'SELECT id FROM players WHERE id = ? AND sqid_id = ?',
    [playerId, sqidId]
  );
  if (!player) {
    throw new NotFoundError('Player not found');
  }

  const duplicate = await db.get(
    'SELECT id FROM players WHERE sqid_id = ? AND LOWER(TRIM(name)) = ? AND id != ?',
    [sqidId, trimmedName.toLowerCase(), playerId]
  );
  if (duplicate) {
    throw new ConflictError('Player name already exists in this Sqid');
  }

  await db.run('UPDATE players SET name = ? WHERE id = ?', [trimmedName, playerId]);

  return db.get(
    'SELECT id, sqid_id, name, created_at, color FROM players WHERE id = ?',
    [playerId]
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/playerAdmin.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Gate the existing route and delegate to the helper**

In `api/routes/players.js`, add imports after the existing `db` import (line 8):

```js
import db from '../db/database.js';
import { requireAdminPin, adminActionLimiter } from '../middleware/adminAuth.js';
import { renamePlayer } from '../utils/playerAdmin.js';
```

Replace the existing `PUT /:playerId` handler (lines 228-266):

```js
/**
 * PUT /api/:sqid/players/:playerId - Update player details (admin only)
 */
router.put('/:playerId', adminActionLimiter, requireAdminPin, validatePlayerAccess, async (req, res, next) => {
  try {
    const { playerId, sqid } = req.params;
    const { name } = req.body;

    const updatedPlayer = await renamePlayer(db, { sqidId: sqid, playerId, name });

    // Broadcast player updated event
    req.io?.to(`/sqid/${sqid}`).emit('player_updated', {
      type: 'player_updated',
      player: updatedPlayer,
      sqidId: sqid,
      timestamp: new Date().toISOString()
    });

    res.json(createResponse(true, updatedPlayer));
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 7: Manually verify the route is gated and works**

With the dev server running (`npm run dev` in `api/`, `ADMIN_PIN=devpin1234` set in `api/.env`) and at least one player created in the `demo` sqid via the UI or `POST /api/demo/players`:

```bash
# Note a real player id from this response first:
curl -s http://localhost:2525/api/demo/players

# Missing PIN -> 403
curl -s -i -X PUT http://localhost:2525/api/demo/players/<playerId> \
  -H "Content-Type: application/json" -d '{"name":"Renamed"}'

# Correct PIN -> 200 with updated player
curl -s -i -X PUT http://localhost:2525/api/demo/players/<playerId> \
  -H "Content-Type: application/json" -H "X-Admin-Pin: devpin1234" -d '{"name":"Renamed"}'
```

Expected: first call is `403`; second is `200` and the response body's `data.name` is `"Renamed"`. Stop the dev server after checking.

- [ ] **Step 8: Commit**

```bash
git add api/utils/playerAdmin.js api/tests/helpers/applySchema.js api/tests/playerAdmin.test.js api/routes/players.js
git commit -m "feat: gate player rename behind admin PIN, extract renamePlayer helper"
```

---

### Task 4: Rivalry cascade-delete helper + route

**Files:**
- Create: `api/utils/rivalryAdmin.js`
- Test: `api/tests/rivalryAdmin.test.js`
- Modify: `api/routes/rivalries.js:1-7,345-348`

**Interfaces:**
- Consumes: `applySchema` from `api/tests/helpers/applySchema.js` (Task 3). `NotFoundError` from `api/middleware/errorHandler.js`. `requireAdminPin`, `adminActionLimiter` from Task 1.
- Produces: `deleteRivalryCascade(db, { sqidId, rivalryId })` — deletes the rivalry, its games, those games' stats, and (via cascade) `rivalry_players`/`rivalry_game_types`/`rivalry_stats`/`rivalry_player_stats`; throws `NotFoundError` if the rivalry doesn't exist in that sqid; resolves with no value on success.

- [ ] **Step 1: Write the failing tests**

```js
// api/tests/rivalryAdmin.test.js
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

process.env.DATABASE_URL = 'sqlite:///tmp-test/rivalry-admin-test.db'
const { default: db } = await import('../db/database.js')
const { applySchema } = await import('./helpers/applySchema.js')
const { deleteRivalryCascade } = await import('../utils/rivalryAdmin.js')

async function seedRivalry(db, { sqidId, rivalryId, playerIds, gameTypeId, gameId, statIds }) {
  await db.run('INSERT INTO rivalries (id, sqid_id) VALUES (?, ?)', [rivalryId, sqidId])
  for (const playerId of playerIds) {
    await db.run('INSERT INTO rivalry_players (rivalry_id, player_id) VALUES (?, ?)', [rivalryId, playerId])
  }
  await db.run('INSERT INTO rivalry_game_types (rivalry_id, game_type_id) VALUES (?, ?)', [rivalryId, gameTypeId])
  await db.run(
    'INSERT INTO rivalry_stats (id, rivalry_id, game_type_id, total_games) VALUES (?, ?, ?, 1)',
    [`${rivalryId}-stats`, rivalryId, gameTypeId]
  )
  for (const playerId of playerIds) {
    await db.run(
      'INSERT INTO rivalry_player_stats (id, rivalry_id, player_id, game_type_id, total_games) VALUES (?, ?, ?, ?, 1)',
      [`${rivalryId}-${playerId}-stats`, rivalryId, playerId, gameTypeId]
    )
  }
  await db.run(
    'INSERT INTO games (id, sqid_id, game_type_id, rivalry_id, finalized) VALUES (?, ?, ?, ?, 1)',
    [gameId, sqidId, gameTypeId, rivalryId]
  )
  for (let i = 0; i < playerIds.length; i++) {
    await db.run(
      'INSERT INTO stats (id, game_id, player_id, score) VALUES (?, ?, ?, ?)',
      [statIds[i], gameId, playerIds[i], 10 + i]
    )
  }
}

before(async () => {
  await applySchema(db)
  await db.run("INSERT INTO sqids (id, name) VALUES ('sqidB', 'Sqid B')")
  await db.run("INSERT INTO players (id, sqid_id, name, color) VALUES ('pA', 'sqidB', 'Ann', 'primary')")
  await db.run("INSERT INTO players (id, sqid_id, name, color) VALUES ('pB', 'sqidB', 'Ben', 'secondary')")

  await seedRivalry(db, {
    sqidId: 'sqidB', rivalryId: 'riv-target', playerIds: ['pA', 'pB'],
    gameTypeId: 'cribbage', gameId: 'game-target', statIds: ['stat-target-a', 'stat-target-b']
  })
  await seedRivalry(db, {
    sqidId: 'sqidB', rivalryId: 'riv-keep', playerIds: ['pA', 'pB'],
    gameTypeId: 'golf', gameId: 'game-keep', statIds: ['stat-keep-a', 'stat-keep-b']
  })
})

after(async () => {
  await db.close()
  fs.rmSync(new URL('../tmp-test', import.meta.url), { recursive: true, force: true })
})

test('throws NotFoundError for a rivalry that does not belong to the sqid', async () => {
  await assert.rejects(
    deleteRivalryCascade(db, { sqidId: 'wrong-sqid', rivalryId: 'riv-target' }),
    (err) => err.name === 'NotFoundError'
  )
})

test('deletes the rivalry, its games/stats, and its cascaded rows, leaving other rivalries untouched', async () => {
  await deleteRivalryCascade(db, { sqidId: 'sqidB', rivalryId: 'riv-target' })

  assert.equal(await db.get('SELECT id FROM rivalries WHERE id = ?', ['riv-target']), undefined)
  assert.equal(await db.get('SELECT id FROM games WHERE id = ?', ['game-target']), undefined)
  assert.deepEqual(await db.query('SELECT id FROM stats WHERE game_id = ?', ['game-target']), [])
  assert.deepEqual(await db.query('SELECT * FROM rivalry_players WHERE rivalry_id = ?', ['riv-target']), [])
  assert.deepEqual(await db.query('SELECT * FROM rivalry_game_types WHERE rivalry_id = ?', ['riv-target']), [])
  assert.deepEqual(await db.query('SELECT * FROM rivalry_stats WHERE rivalry_id = ?', ['riv-target']), [])
  assert.deepEqual(await db.query('SELECT * FROM rivalry_player_stats WHERE rivalry_id = ?', ['riv-target']), [])

  assert.ok(await db.get('SELECT id FROM rivalries WHERE id = ?', ['riv-keep']))
  assert.ok(await db.get('SELECT id FROM games WHERE id = ?', ['game-keep']))
  const keptStats = await db.query('SELECT id FROM stats WHERE game_id = ?', ['game-keep'])
  assert.equal(keptStats.length, 2)

  const survivingPlayers = await db.query('SELECT id FROM players WHERE sqid_id = ?', ['sqidB'])
  assert.equal(survivingPlayers.length, 2)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/rivalryAdmin.test.js`
Expected: FAIL — `Cannot find module '../utils/rivalryAdmin.js'`

- [ ] **Step 3: Implement the helper**

```js
// api/utils/rivalryAdmin.js
import { NotFoundError } from '../middleware/errorHandler.js';

/**
 * Deletes a rivalry and everything played under it: its games, those
 * games' stats, and (via ON DELETE CASCADE) rivalry_players,
 * rivalry_game_types, rivalry_stats, and rivalry_player_stats.
 * games.rivalry_id has no cascade, so games/stats must be deleted
 * explicitly before the rivalry row itself.
 * @param {import('../db/database.js').default} db
 * @param {{ sqidId: string, rivalryId: string }} params
 * @returns {Promise<void>}
 */
export async function deleteRivalryCascade(db, { sqidId, rivalryId }) {
  const rivalry = await db.get(
    'SELECT id FROM rivalries WHERE id = ? AND sqid_id = ?',
    [rivalryId, sqidId]
  );
  if (!rivalry) {
    throw new NotFoundError('Rivalry not found');
  }

  await db.transaction(async (tx) => {
    await tx.run(
      'DELETE FROM stats WHERE game_id IN (SELECT id FROM games WHERE rivalry_id = ?)',
      [rivalryId]
    );
    await tx.run('DELETE FROM games WHERE rivalry_id = ?', [rivalryId]);
    await tx.run('DELETE FROM rivalries WHERE id = ?', [rivalryId]);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/rivalryAdmin.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the gated route**

In `api/routes/rivalries.js`, add imports after the existing `crypto` import (line 5):

```js
import crypto from 'crypto';
import { requireAdminPin, adminActionLimiter } from '../middleware/adminAuth.js';
import { deleteRivalryCascade } from '../utils/rivalryAdmin.js';
```

Add the new route before `export default router;` (currently line 347):

```js
/**
 * DELETE /api/:sqid/rivalries/:rivalryId - Delete a rivalry and all its
 * games/stats (admin only)
 */
router.delete('/:rivalryId', adminActionLimiter, requireAdminPin, async (req, res, next) => {
  try {
    const { sqid, rivalryId } = req.params;
    await deleteRivalryCascade(db, { sqidId: sqid, rivalryId });

    req.io?.to(`/sqid/${sqid}`).emit('rivalry_deleted', {
      type: 'rivalry_deleted',
      rivalryId,
      sqidId: sqid,
      timestamp: new Date().toISOString()
    });

    res.json(createResponse(true, { message: 'Rivalry deleted successfully' }));
  } catch (error) {
    next(error);
  }
});

export default router;
```

- [ ] **Step 6: Manually verify the route is gated and works**

With the dev server running (`ADMIN_PIN=devpin1234` set in `api/.env`) and at least one rivalry existing in the `demo` sqid (play a game between two players to create one, or check `GET /api/demo/rivalries`):

```bash
curl -s http://localhost:2525/api/demo/rivalries

# Missing PIN -> 403
curl -s -i -X DELETE http://localhost:2525/api/demo/rivalries/<rivalryId>

# Correct PIN -> 200, and the rivalry is gone from a follow-up GET
curl -s -i -X DELETE http://localhost:2525/api/demo/rivalries/<rivalryId> -H "X-Admin-Pin: devpin1234"
curl -s http://localhost:2525/api/demo/rivalries
```

Expected: first `DELETE` is `403`; second is `200`; the final `GET` no longer lists that rivalry. Stop the dev server after checking.

- [ ] **Step 7: Commit**

```bash
git add api/utils/rivalryAdmin.js api/tests/rivalryAdmin.test.js api/routes/rivalries.js
git commit -m "feat: add PIN-gated rivalry cascade-delete endpoint"
```

---

### Task 5: Frontend admin-PIN storage helper

**Files:**
- Create: `app/src/utils/adminPin.js`
- Test: `app/src/utils/adminPin.test.js`

**Interfaces:**
- Produces: `getStoredAdminPin(sqid)` (returns `string | null`), `setStoredAdminPin(sqid, pin)`, `clearStoredAdminPin(sqid)`.

- [ ] **Step 1: Write the failing tests**

```js
// app/src/utils/adminPin.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { getStoredAdminPin, setStoredAdminPin, clearStoredAdminPin } from './adminPin.js'

describe('adminPin storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('returns null when no pin is stored for a sqid', () => {
    expect(getStoredAdminPin('abcd')).toBeNull()
  })

  it('stores and retrieves a pin scoped to a sqid', () => {
    setStoredAdminPin('abcd', '1234')
    expect(getStoredAdminPin('abcd')).toBe('1234')
    expect(getStoredAdminPin('other')).toBeNull()
  })

  it('clears a stored pin', () => {
    setStoredAdminPin('abcd', '1234')
    clearStoredAdminPin('abcd')
    expect(getStoredAdminPin('abcd')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `app/`): `npx vitest run src/utils/adminPin.test.js`
Expected: FAIL — `Failed to resolve import "./adminPin.js"`

- [ ] **Step 3: Implement the helper**

```js
// app/src/utils/adminPin.js
const KEY_PREFIX = 'skorbord_admin_pin_'

export function getStoredAdminPin(sqid) {
  return sessionStorage.getItem(KEY_PREFIX + sqid)
}

export function setStoredAdminPin(sqid, pin) {
  sessionStorage.setItem(KEY_PREFIX + sqid, pin)
}

export function clearStoredAdminPin(sqid) {
  sessionStorage.removeItem(KEY_PREFIX + sqid)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/adminPin.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/utils/adminPin.js app/src/utils/adminPin.test.js
git commit -m "feat: add sessionStorage helper for the admin PIN"
```

---

### Task 6: RivalryAdmin component — PIN gate

**Files:**
- Create: `app/src/components/RivalryAdmin.jsx`
- Test: `app/src/components/RivalryAdmin.test.jsx`

**Interfaces:**
- Consumes: `getStoredAdminPin`, `setStoredAdminPin`, `clearStoredAdminPin` from `app/src/utils/adminPin.js` (Task 5).
- Produces: default export `RivalryAdmin({ sqid, rivalries, setRivalries, backToStats })`. Renders a PIN-entry gate until `POST /api/:sqid/admin/verify-pin` succeeds with the entered `X-Admin-Pin` header, then renders the rivalry list (`"{names.join(' vs ')}"` per rivalry, from `rivalry.player_names`).

- [ ] **Step 1: Write the failing tests**

```jsx
// app/src/components/RivalryAdmin.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RivalryAdmin from './RivalryAdmin.jsx'

const rivalries = [
  { id: 'riv1', player_names: ['Alice', 'Bob'], players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }] }
]

describe('RivalryAdmin PIN gate', () => {
  beforeEach(() => {
    sessionStorage.clear()
    global.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides the rivalry list until a correct PIN is entered', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    render(<RivalryAdmin sqid="abcd" rivalries={rivalries} setRivalries={() => {}} backToStats={() => {}} />)

    expect(screen.queryByText('Alice vs Bob')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Admin PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Alice vs Bob')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/abcd/admin/verify-pin', expect.objectContaining({
      method: 'POST',
      headers: { 'X-Admin-Pin': '1234' }
    }))
  })

  it('shows an error and keeps the list hidden for a wrong PIN', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 })
    render(<RivalryAdmin sqid="abcd" rivalries={rivalries} setRivalries={() => {}} backToStats={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Admin PIN'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Incorrect PIN')).toBeInTheDocument())
    expect(screen.queryByText('Alice vs Bob')).not.toBeInTheDocument()
  })

  it('skips the gate when a pin is already cached in sessionStorage', () => {
    sessionStorage.setItem('skorbord_admin_pin_abcd', '1234')
    render(<RivalryAdmin sqid="abcd" rivalries={rivalries} setRivalries={() => {}} backToStats={() => {}} />)
    expect(screen.getByText('Alice vs Bob')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `app/`): `npx vitest run src/components/RivalryAdmin.test.jsx`
Expected: FAIL — `Failed to resolve import "./RivalryAdmin.jsx"`

- [ ] **Step 3: Implement the component**

```jsx
// app/src/components/RivalryAdmin.jsx
import { useState } from 'react'
import { getStoredAdminPin, setStoredAdminPin, clearStoredAdminPin } from '../utils/adminPin.js'

const RivalryAdmin = ({ sqid, rivalries, setRivalries, backToStats }) => {
  const [pinInput, setPinInput] = useState('')
  const [verifiedPin, setVerifiedPin] = useState(() => getStoredAdminPin(sqid))
  const [pinError, setPinError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const submitPin = async () => {
    setVerifying(true)
    setPinError('')
    try {
      const response = await fetch(`/api/${sqid}/admin/verify-pin`, {
        method: 'POST',
        headers: { 'X-Admin-Pin': pinInput }
      })
      if (!response.ok) {
        throw new Error('Incorrect PIN')
      }
      setStoredAdminPin(sqid, pinInput)
      setVerifiedPin(pinInput)
    } catch (err) {
      setPinError(err.message || 'Incorrect PIN')
    } finally {
      setVerifying(false)
    }
  }

  if (!verifiedPin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <button className="btn btn-ghost btn-sm" onClick={backToStats}>← Back</button>
          <h2 className="text-xl font-bold">Manage Rivalries</h2>
        </div>
        <div className="card bg-base-200 p-4 space-y-4">
          <p className="text-sm opacity-75">Enter the admin PIN to manage rivalries.</p>
          <input
            type="password"
            className="input input-bordered w-full"
            placeholder="Admin PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPin() }}
          />
          {pinError && (
            <div className="error-state"><p>{pinError}</p></div>
          )}
          <button
            className="btn btn-primary w-full"
            onClick={submitPin}
            disabled={verifying || !pinInput.trim()}
          >
            {verifying ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Verifying...
              </>
            ) : 'Unlock'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button className="btn btn-ghost btn-sm" onClick={backToStats}>← Back</button>
        <h2 className="text-xl font-bold">Manage Rivalries</h2>
      </div>
      {rivalries.length === 0 ? (
        <p className="text-center opacity-75 py-4">No rivalries yet</p>
      ) : (
        <div className="space-y-3">
          {rivalries.map(rivalry => (
            <div key={rivalry.id} className="card bg-base-200 p-4">
              <p className="font-semibold">
                {(rivalry.player_names || []).join(' vs ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RivalryAdmin
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/RivalryAdmin.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/RivalryAdmin.jsx app/src/components/RivalryAdmin.test.jsx
git commit -m "feat: add RivalryAdmin component with PIN-entry gate"
```

---

### Task 7: RivalryAdmin — rename and delete

**Files:**
- Modify: `app/src/components/RivalryAdmin.jsx` (full rewrite of the file from Task 6)
- Modify: `app/src/components/RivalryAdmin.test.jsx` (append new `describe` block)

**Interfaces:**
- Produces (added to `RivalryAdmin`): per-participant inline rename (`PUT /api/:sqid/players/:playerId` with `X-Admin-Pin` header) and per-rivalry delete-with-confirmation (`DELETE /api/:sqid/rivalries/:rivalryId` with `X-Admin-Pin` header). A `403` from either clears the cached PIN (via `clearStoredAdminPin`) and re-shows the gate from Task 6.

- [ ] **Step 1: Write the failing tests (append to the existing file)**

Add to `app/src/components/RivalryAdmin.test.jsx`, after the existing `describe` block:

```jsx
describe('RivalryAdmin rename and delete', () => {
  const baseRivalries = [
    { id: 'riv1', player_names: ['Alice', 'Bob'], players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }] }
  ]

  beforeEach(() => {
    sessionStorage.setItem('skorbord_admin_pin_abcd', '1234')
    global.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renames a player and reflects the new name in rivalry state', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 'p1', name: 'Alicia' } })
    })
    let latestRivalries = baseRivalries
    const setRivalries = (updater) => { latestRivalries = updater(latestRivalries) }

    render(<RivalryAdmin sqid="abcd" rivalries={baseRivalries} setRivalries={setRivalries} backToStats={() => {}} />)

    fireEvent.click(screen.getAllByText('Rename')[0])
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Alicia' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/abcd/players/p1', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'X-Admin-Pin': '1234' })
    })))
    expect(latestRivalries[0].players[0].name).toBe('Alicia')
  })

  it('surfaces a duplicate-name conflict from the server', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: 'Player name already exists in this Sqid' })
    })

    render(<RivalryAdmin sqid="abcd" rivalries={baseRivalries} setRivalries={() => {}} backToStats={() => {}} />)

    fireEvent.click(screen.getAllByText('Rename')[0])
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByText('Player name already exists in this Sqid')).toBeInTheDocument())
  })

  it('keeps delete disabled until the confirm text matches exactly, then deletes on click', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) })
    let latestRivalries = baseRivalries
    const setRivalries = (updater) => { latestRivalries = updater(latestRivalries) }

    render(<RivalryAdmin sqid="abcd" rivalries={baseRivalries} setRivalries={setRivalries} backToStats={() => {}} />)

    fireEvent.click(screen.getByText('Delete Rivalry'))
    const confirmInput = screen.getByRole('textbox')
    const confirmButton = screen.getByText('Confirm Delete')
    expect(confirmButton).toBeDisabled()

    fireEvent.change(confirmInput, { target: { value: 'Alice vs Bob' } })
    expect(confirmButton).not.toBeDisabled()

    fireEvent.click(confirmButton)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/abcd/rivalries/riv1', expect.objectContaining({
      method: 'DELETE',
      headers: { 'X-Admin-Pin': '1234' }
    })))
    expect(latestRivalries.find(r => r.id === 'riv1')).toBeUndefined()
  })

  it('clears the cached pin and re-shows the gate on a 403 from a mutating call', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 })

    render(<RivalryAdmin sqid="abcd" rivalries={baseRivalries} setRivalries={() => {}} backToStats={() => {}} />)

    fireEvent.click(screen.getAllByText('Rename')[0])
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Alicia' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByPlaceholderText('Admin PIN')).toBeInTheDocument())
    expect(sessionStorage.getItem('skorbord_admin_pin_abcd')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/RivalryAdmin.test.jsx`
Expected: FAIL — the new `describe` block's tests fail (no "Rename"/"Delete Rivalry" text rendered yet).

- [ ] **Step 3: Implement rename + delete in the component**

Replace the full contents of `app/src/components/RivalryAdmin.jsx`:

```jsx
// app/src/components/RivalryAdmin.jsx
import { useState } from 'react'
import { getStoredAdminPin, setStoredAdminPin, clearStoredAdminPin } from '../utils/adminPin.js'

const RivalryAdmin = ({ sqid, rivalries, setRivalries, backToStats }) => {
  const [pinInput, setPinInput] = useState('')
  const [verifiedPin, setVerifiedPin] = useState(() => getStoredAdminPin(sqid))
  const [pinError, setPinError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renameLoadingId, setRenameLoadingId] = useState(null)

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoadingId, setDeleteLoadingId] = useState(null)

  const handleAuthFailure = () => {
    clearStoredAdminPin(sqid)
    setVerifiedPin(null)
    setPinInput('')
  }

  const submitPin = async () => {
    setVerifying(true)
    setPinError('')
    try {
      const response = await fetch(`/api/${sqid}/admin/verify-pin`, {
        method: 'POST',
        headers: { 'X-Admin-Pin': pinInput }
      })
      if (!response.ok) {
        throw new Error('Incorrect PIN')
      }
      setStoredAdminPin(sqid, pinInput)
      setVerifiedPin(pinInput)
    } catch (err) {
      setPinError(err.message || 'Incorrect PIN')
    } finally {
      setVerifying(false)
    }
  }

  const startEditing = (player) => {
    setEditingPlayerId(player.id)
    setDraftName(player.name)
    setRenameError('')
  }

  const saveRename = async (playerId) => {
    setRenameLoadingId(playerId)
    setRenameError('')
    try {
      const response = await fetch(`/api/${sqid}/players/${playerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Pin': verifiedPin
        },
        body: JSON.stringify({ name: draftName })
      })
      if (response.status === 403) {
        handleAuthFailure()
        return
      }
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to rename player')
      }
      const updatedName = data.data.name
      setRivalries(prev => prev.map(riv => ({
        ...riv,
        players: (riv.players || []).map(p => p.id === playerId ? { ...p, name: updatedName } : p),
        player_names: (riv.players || []).map(p => p.id === playerId ? updatedName : p.name)
      })))
      setEditingPlayerId(null)
    } catch (err) {
      setRenameError(err.message || 'Failed to rename player')
    } finally {
      setRenameLoadingId(null)
    }
  }

  const startDeleteConfirm = (rivalry) => {
    setConfirmingDeleteId(rivalry.id)
    setConfirmText('')
    setDeleteError('')
  }

  const deleteRivalry = async (rivalry) => {
    setDeleteLoadingId(rivalry.id)
    setDeleteError('')
    try {
      const response = await fetch(`/api/${sqid}/rivalries/${rivalry.id}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Pin': verifiedPin }
      })
      if (response.status === 403) {
        handleAuthFailure()
        return
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete rivalry')
      }
      setRivalries(prev => prev.filter(r => r.id !== rivalry.id))
      setConfirmingDeleteId(null)
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete rivalry')
    } finally {
      setDeleteLoadingId(null)
    }
  }

  if (!verifiedPin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <button className="btn btn-ghost btn-sm" onClick={backToStats}>← Back</button>
          <h2 className="text-xl font-bold">Manage Rivalries</h2>
        </div>
        <div className="card bg-base-200 p-4 space-y-4">
          <p className="text-sm opacity-75">Enter the admin PIN to manage rivalries.</p>
          <input
            type="password"
            className="input input-bordered w-full"
            placeholder="Admin PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPin() }}
          />
          {pinError && (
            <div className="error-state"><p>{pinError}</p></div>
          )}
          <button
            className="btn btn-primary w-full"
            onClick={submitPin}
            disabled={verifying || !pinInput.trim()}
          >
            {verifying ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Verifying...
              </>
            ) : 'Unlock'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button className="btn btn-ghost btn-sm" onClick={backToStats}>← Back</button>
        <h2 className="text-xl font-bold">Manage Rivalries</h2>
      </div>

      {rivalries.length === 0 ? (
        <p className="text-center opacity-75 py-4">No rivalries yet</p>
      ) : (
        <div className="space-y-3">
          {rivalries.map(rivalry => (
            <div key={rivalry.id} className="card bg-base-200 p-4 space-y-3">
              <div className="space-y-2">
                {(rivalry.players || []).map(player => (
                  <div key={player.id} className="flex items-center gap-2">
                    {editingPlayerId === player.id ? (
                      <>
                        <input
                          type="text"
                          className="input input-bordered input-sm flex-1"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => saveRename(player.id)}
                          disabled={renameLoadingId === player.id || !draftName.trim()}
                        >
                          Save
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditingPlayerId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1">{player.name}</span>
                        <button className="btn btn-sm btn-outline" onClick={() => startEditing(player)}>
                          Rename
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {renameError && (
                  <div className="error-state"><p>{renameError}</p></div>
                )}
              </div>

              <div className="pt-2 border-t border-base-300">
                {confirmingDeleteId === rivalry.id ? (
                  <div className="space-y-2">
                    <p className="text-sm opacity-75">
                      Type "{(rivalry.player_names || []).join(' vs ')}" to confirm deletion.
                    </p>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                    />
                    {deleteError && (
                      <div className="error-state"><p>{deleteError}</p></div>
                    )}
                    <div className="flex gap-2">
                      <button
                        className="btn btn-sm btn-error"
                        disabled={
                          deleteLoadingId === rivalry.id ||
                          confirmText !== (rivalry.player_names || []).join(' vs ')
                        }
                        onClick={() => deleteRivalry(rivalry)}
                      >
                        Confirm Delete
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setConfirmingDeleteId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-error btn-outline" onClick={() => startDeleteConfirm(rivalry)}>
                    Delete Rivalry
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RivalryAdmin
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/RivalryAdmin.test.jsx`
Expected: PASS (all 7 tests across both `describe` blocks)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/RivalryAdmin.jsx app/src/components/RivalryAdmin.test.jsx
git commit -m "feat: add rename and type-to-confirm delete to RivalryAdmin"
```

---

### Task 8: Wire RivalryAdmin into the app

**Files:**
- Modify: `app/src/components/LazyComponents.jsx`
- Modify: `app/src/components/ModernCardApp.jsx:15,43,172-188`
- Modify: `app/src/components/RivalryStats.jsx:302-310`

**Interfaces:**
- Consumes: `RivalryAdmin` default export (Task 7).
- Produces: a `'rivalry-admin'` entry in `ModernCardApp`'s `currentView`, reachable via a "Manage" button on the rivalry list in `RivalryStats`.

- [ ] **Step 1: Export a lazy-loaded RivalryAdmin**

Edit `app/src/components/LazyComponents.jsx`:

```jsx
import { lazy, Suspense } from 'react'

// Lazy load admin components for better bundle splitting
const AdminPanel = lazy(() => import('./AdminPanel.jsx'))
const RivalryStats = lazy(() => import('./RivalryStats.jsx'))
const RivalryAdmin = lazy(() => import('./RivalryAdmin.jsx'))

/**
 * Code-split admin/stats views to reduce main bundle size
 * These components are only loaded when actually needed
 */
export const LazyAdminPanel = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center min-h-96">
      <div className="loading loading-spinner loading-lg text-primary"></div>
      <span className="ml-2 text-base-content">Loading admin panel...</span>
    </div>
  }>
    <AdminPanel {...props} />
  </Suspense>
)

export const LazyRivalryStats = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center min-h-96">
      <div className="loading loading-spinner loading-lg text-primary"></div>
      <span className="ml-2 text-base-content">Loading stats...</span>
    </div>
  }>
    <RivalryStats {...props} />
  </Suspense>
)

export const LazyRivalryAdmin = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center min-h-96">
      <div className="loading loading-spinner loading-lg text-primary"></div>
      <span className="ml-2 text-base-content">Loading rivalry admin...</span>
    </div>
  }>
    <RivalryAdmin {...props} />
  </Suspense>
)

// Export for use in routing
export { AdminPanel, RivalryStats, RivalryAdmin }
```

- [ ] **Step 2: Add the "Manage" button to the rivalry list**

Edit `app/src/components/RivalryStats.jsx`. `RivalryStats` currently has no `onManage` prop — add it to the destructured props (line 4):

```jsx
const RivalryStats = ({ sqid, rivalries, players: globalPlayers, backToSetup, onManage }) => {
```

Then in the list-view header (currently lines 300-310):

```jsx
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button 
          className="btn btn-ghost btn-sm"
          onClick={backToSetup}
        >
          ← Back
        </button>
        <h2 className="text-xl font-bold">Rivalry Stats</h2>
        <button
          className="btn btn-outline btn-sm ml-auto"
          onClick={onManage}
        >
          Manage
        </button>
      </div>
```

- [ ] **Step 3: Add the view in ModernCardApp**

Edit `app/src/components/ModernCardApp.jsx`. Update the import (line 15):

```jsx
import { LazyAdminPanel, LazyRivalryStats, LazyRivalryAdmin } from './LazyComponents.jsx'
```

Update the view comment (line 43) for documentation accuracy:

```jsx
  const [currentView, setCurrentView] = useState('setup') // setup, playing, rivalry-stats, rivalry-admin, admin
```

Update the `rivalry-stats` block to pass `onManage`, and add a new `rivalry-admin` block right after it (currently lines 172-179):

```jsx
              {currentView === 'rivalry-stats' && (
                <LazyRivalryStats 
                  sqid={sqid} 
                  rivalries={rivalries}
                  players={players}
                  backToSetup={() => setCurrentView('setup')}
                  onManage={() => setCurrentView('rivalry-admin')}
                />
              )}

              {currentView === 'rivalry-admin' && (
                <LazyRivalryAdmin
                  sqid={sqid}
                  rivalries={rivalries}
                  setRivalries={setRivalries}
                  backToStats={() => setCurrentView('rivalry-stats')}
                />
              )}
```

- [ ] **Step 4: Manually verify in the browser**

From the repo root:

```bash
npm run dev
```

In a browser, open the app, create at least two players and play a game to completion so a rivalry exists, then:

1. Go to the "Stats" view, click "Manage".
2. Confirm the PIN gate appears (no rivalry data visible yet).
3. Enter the wrong `ADMIN_PIN` value — confirm an inline error shows and the list stays hidden.
4. Enter the correct value (whatever `ADMIN_PIN` is set to in `api/.env`) — confirm the rivalry list appears with each participant's name and a "Rename"/"Delete Rivalry" control.
5. Click "Rename" on a participant, change the name, save — confirm it updates in place, and that the same new name now shows on the "Stats" view for that rivalry too.
6. Click "Delete Rivalry", confirm the delete button stays disabled until you type the exact matchup text, then confirm — confirm the rivalry disappears from both this view and the "Stats" list.
7. Reload the page and revisit "Manage" — confirm the PIN gate does NOT reappear (PIN persisted in `sessionStorage` for the tab).

Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/LazyComponents.jsx app/src/components/ModernCardApp.jsx app/src/components/RivalryStats.jsx
git commit -m "feat: wire RivalryAdmin into the app via a Manage entry point"
```

---

## Self-Review Notes

- **Spec coverage:** PIN middleware/fail-closed/timing-safe (Task 1), rate limiting (Task 1, applied in Tasks 2-4), verify-pin endpoint (Task 2), gated rename with duplicate-name check (Task 3), gated cascade delete with socket broadcast (Task 4), sessionStorage caching + gate UI (Tasks 5-6), inline rename + type-to-confirm delete + 403 handling (Task 7), Manage entry point wiring (Task 8), `.env.example` documentation (Task 1) — all spec sections have a task.
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code or an exact command.
- **Type consistency:** `deleteRivalryCascade(db, { sqidId, rivalryId })` and `renamePlayer(db, { sqidId, playerId, name })` signatures are identical everywhere they're defined (Tasks 3-4) and called (route handlers in the same tasks). `getStoredAdminPin`/`setStoredAdminPin`/`clearStoredAdminPin(sqid[, pin])` signatures match between Task 5's implementation and Task 6/7's usage.
