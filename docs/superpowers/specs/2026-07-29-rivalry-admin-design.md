# Rivalry Admin — Design Spec

Date: 2026-07-29

## Problem

There's currently no way to rename a participant or delete a rivalry (and
its stats) from the app. The two write endpoints that exist today for
players (`PUT`/`DELETE /api/:sqid/players/:playerId`) are unused by any
frontend code, and there is no rivalry-delete endpoint at all.

Everything inside a Sqid (game room) today is reachable by anyone who knows
the sqid — there is no authentication. Full user auth is out of scope for
this work; the ask is for these two admin actions specifically to be
"somewhat secured" — a real gate beyond "knows the URL," short of a login
system.

## Non-goals

- No user accounts, sessions, or per-user audit trail.
- No change to how sqids themselves are created or shared.
- No change to player *deletion* (`DELETE /api/:sqid/players/:playerId`) —
  out of scope; renaming and rivalry deletion only.
- Renamed participants are NOT per-rivalry aliases. The schema has one
  shared `players` row per person per sqid; renaming edits that row, so the
  new name appears in every rivalry and game history that player is part
  of within the sqid.

## Security model

A single shared admin PIN, set via a new `ADMIN_PIN` environment variable
(same pattern as the existing `SOCKET_IO_SECRET`), gates the admin
mutation endpoints.

- **Middleware** — `api/middleware/adminAuth.js` exports `requireAdminPin`,
  which reads the `X-Admin-Pin` request header and compares it to
  `process.env.ADMIN_PIN` using `crypto.timingSafeEqual` (constant-time, to
  avoid leaking PIN length/prefix via timing). On mismatch or missing
  header, it throws the existing `ForbiddenError` (403).
- **Fail closed** — if `ADMIN_PIN` is not configured on the server at all,
  every request through `requireAdminPin` is rejected (503, "Admin
  features not configured"), never treated as open access.
- **Verify endpoint** — `POST /api/:sqid/admin/verify-pin` runs
  `requireAdminPin` and returns `{ success: true }` on match. This lets the
  frontend validate a PIN the user just typed before caching it, without
  a separate token/session mechanism.
- **Brute-force resistance** — the app's global rate limiter (5000
  req/min) is too loose to protect a short PIN. A dedicated
  `express-rate-limit` limiter (10 requests / 15 min / IP) is applied to
  `verify-pin` and the two gated mutation routes below.
- **Transport** — the PIN travels in a request header on every gated call
  (no session token). This relies on the deployment already terminating
  HTTPS (per existing `deployment/` scripts); this is noted as a
  requirement, not re-verified by this change.

This is intentionally not full authN/authZ: one shared secret, no
per-admin identity, no audit log. It raises the bar from "anyone with the
sqid URL" to "anyone with the sqid URL *and* the admin PIN."

## API changes

### `POST /api/:sqid/admin/verify-pin`

New. Body: none required (PIN comes via `X-Admin-Pin` header, consistent
with how it's used everywhere else). Runs `requireAdminPin` +
the dedicated rate limiter. Returns `{ success: true }` on a correct PIN.

### `PUT /api/:sqid/players/:playerId` (existing, now gated)

Add `requireAdminPin` to the existing route in `api/routes/players.js`.
Also add a case-insensitive duplicate-name check against other players in
the same sqid (mirroring the check already present on player creation),
so an admin can't rename a player to collide with an existing name.

### `DELETE /api/:sqid/rivalries/:rivalryId`

New route in `api/routes/rivalries.js`, gated by `requireAdminPin` and the
dedicated rate limiter. Behavior (per "delete everything" — full erase of
the rivalry's play history, not just the aggregation):

1. Look up the rivalry by `id` + `sqid`; 404 (`NotFoundError`) if not
   found or not in this sqid.
2. Inside `db.transaction()`:
   - `DELETE FROM stats WHERE game_id IN (SELECT id FROM games WHERE rivalry_id = ?)`
   - `DELETE FROM games WHERE rivalry_id = ?`
   - `DELETE FROM rivalries WHERE id = ?` — cascades to `rivalry_players`,
     `rivalry_game_types`, `rivalry_stats`, and `rivalry_player_stats` via
     the `ON DELETE CASCADE` foreign keys already defined in
     `001_initial_schema.sql`. (`games.rivalry_id` has no cascade, which is
     why games/stats must be deleted explicitly first — deleting the
     rivalry row first would otherwise violate the FK constraint under
     `PRAGMA foreign_keys = ON`.)
3. On success, emit `req.io?.to(`/sqid/${sqid}`).emit('rivalry_deleted', { rivalryId, sqidId: sqid, timestamp })` so other connected clients drop it live, matching the existing `player_updated` broadcast pattern.
4. Respond `createResponse(true, { message: 'Rivalry deleted successfully' })`.

## Frontend changes

### New component: `app/src/components/RivalryAdmin.jsx`

Lazy-loaded via `LazyComponents.jsx` (same pattern as `AdminPanel` /
`RivalryStats`), wired to a new `'rivalry-admin'` entry in `currentView`
in `ModernCardApp.jsx`.

**Entry point** — a "Manage" button added to the rivalry list header in
`RivalryStats.jsx`, next to the existing "← Back" button, switching
`currentView` to `'rivalry-admin'`.

**PIN gate** — on mount, check `sessionStorage.getItem('admin_pin_' + sqid)`.
If absent, render a PIN-entry form (single password input + submit). On
submit, `POST /api/:sqid/admin/verify-pin` with the typed value as
`X-Admin-Pin`; on success, store it in `sessionStorage` under that key and
render the admin list; on 403, show an inline error and let the user
retry (subject to the endpoint's rate limit). Any subsequent admin fetch
that comes back 403 (e.g. PIN rotated server-side) clears the cached value
and re-shows the entry form.

**Rivalry list** — reuses `GET /api/:sqid/rivalries` (already fetched
elsewhere in the app). Each row shows:

- Each participant's name as an inline-editable text field with a Save
  button, calling `PUT /api/:sqid/players/:playerId` with the cached PIN
  header. Success updates the row in place and shows a brief success
  message (matching `AdminPanel`'s `success`/`error` state pattern);
  duplicate-name conflicts surface the server's error message.
- A "Delete Rivalry" control that expands a confirmation input requiring
  the user to type the rivalry's displayed matchup (e.g. "Alice vs Bob")
  before the delete button enables. This is a UX safety net against
  misclicks on an irreversible action — layered on top of, not instead of,
  the PIN gate. On confirm, calls the new `DELETE` endpoint with the
  cached PIN header and removes the row from local state on success.

## Testing

- **Backend**: `api/tests` — `requireAdminPin` unit tests (missing header,
  wrong PIN, correct PIN, `ADMIN_PIN` unset → fails closed); integration
  test for the cascade delete (asserts `games`/`stats`/`rivalry_players`/
  `rivalry_game_types`/`rivalry_stats`/`rivalry_player_stats` rows for the
  deleted rivalry are gone, and an unrelated rivalry's rows are
  untouched); integration test for gated rename including the new
  duplicate-name conflict case.
- **Frontend**: component test for `RivalryAdmin`'s PIN-gate flow (wrong
  PIN shows error and doesn't reveal the list; correct PIN reveals it and
  persists across a re-render) and the type-to-confirm delete flow (button
  stays disabled until the exact matchup text is entered).

## Config

Add `ADMIN_PIN` to `api/.env.example` (undocumented/empty value, with a
comment that admin routes are disabled until it's set) — mirrors how
`SOCKET_IO_SECRET` is already documented there.
