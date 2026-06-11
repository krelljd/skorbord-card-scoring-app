### Player Card UI/UX Requirements

The player card component must deliver a professional, visually striking, and highly usable experience, closely inspired by the provided image. The following requirements must be met:

- **Layout & Sizing:**
  - Center the player’s score as a large, bold number (minimum `text-[12vwh]` on mobile, scaling up for larger screens).
  - Player name and icon are positioned above the score, centered, with clear separation from the score.
  - Use a card layout with rounded corners and subtle drop shadow for depth.
  - Ensure all elements are vertically and horizontally centered within the card.

- **Typography:**
  - Use a modern, geometric sans-serif font (e.g., Inter, DM Sans, or system default) for all text.
  - Player name: `text-[3vwh]` or larger, bold, all-caps or title case.
  - Score: Extra bold, white, with a subtle drop shadow for legibility.

- **Icons, Controls & Interactions:**
  - The right half of the player card acts as a large increment button: tapping anywhere on the right half increments the score by 1; long-pressing increments by 10.
  - The left half of the player card acts as a large decrement button: tapping anywhere on the left half decrements the score by 1; long-pressing decrements by 10.
  - These regions must be visually indicated (e.g., subtle highlight or ripple on tap/press) and accessible via keyboard and screen reader.
  - Use clear, touch-friendly icons for increment/decrement (e.g., plus/minus, with optional +5/-5 quick actions) as overlays or in corners if desired.
  - Show a player icon and a settings/gear icon above the name, as in the reference image.

- **Touch & Accessibility:**
  - All interactive elements must have a minimum 48x48px touch target.
  - Provide visible focus states and ARIA labels for all controls.
  - Ensure color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text/icons).

- **Feedback, Animation & Tally:**
  - When a score is changed, show a 3-second animated tally (e.g., animated count-up/down, progress bar, or visual effect) before the score is finalized and sent to the server, as specified in the Score Update Timing and UX section.
  - Use smooth, subtle animations for score changes (e.g., scale up/down, fade, or slide transitions).
  - Provide visual feedback (ripple, highlight) on all taps/presses.
  - Optionally, use haptic feedback on supported devices for score changes.

- **Responsiveness:**
  - The card must scale gracefully from mobile to desktop, always keeping the score and controls prominent and accessible.
  - Use TailwindCSS breakpoints and relative units (`vwh`, `vw`, `vh`) for sizing.

- **Theme & Color Usage:**
  - Each player card must use a unique theme color for the player name and accent elements (e.g., icons, highlights, controls). Assign colors programmatically or from a predefined palette to ensure visual distinction between players.
  - The score and tally score must always be white (`#FFFFFF`), regardless of the player’s theme color, for maximum contrast and consistency.
  - Use DaisyUI dark theme as the base. Custom accent color `#00FFC2` is used for primary actions and as a fallback if not enough unique colors are available.
  - All UI elements must blend with the overall app style and not clash with other components.

Include a Figma or image reference in the repo for designers/developers. All code must be well-documented and reviewed for accessibility and polish before release.
# Sonnet Checklist: Missing Instructions and Clarifications Needed

This checklist identifies missing instructions, unclear requirements, and questions that need to be addressed to generate a working application.

## Missing Technical Specifications

- [x] **Complete database schema definition**
  - Table structures for `sqids`, `players`, `games`, `game_types`, `rivalries`, and `stats` are defined in `SQLite_db_models.md`. All tables use explicit primary keys and appropriate foreign keys for referential integrity. Example:
    - `sqids`: id (PK, TEXT), name (TEXT, unique), created_at (TIMESTAMP)
    - `players`: id (PK, TEXT), sqid_id (FK, TEXT), name (TEXT), joined_at (TIMESTAMP)
    - `games`: id (PK, TEXT), sqid_id (FK, TEXT), game_type_id (FK, TEXT), started_at (TIMESTAMP), ended_at (TIMESTAMP)
    - `game_types`: id (PK, TEXT), name (TEXT, unique), description (TEXT)
    - `rivalries`: id (PK, TEXT), sqid_id (FK, TEXT), player1_id (FK, TEXT), player2_id (FK, TEXT), game_type_id (FK, TEXT), UNIQUE(player1_id, player2_id, game_type_id)
    - `stats`: id (PK, TEXT), game_id (FK, TEXT), player_id (FK, TEXT), score (INTEGER), created_at (TIMESTAMP)
  - Relationships: Foreign keys enforce that players/games/rivalries/stats reference valid sqids, game_types, and players. Each rivalry is unique per player pair and game type. Stats reference games and players.
  - Indexes: Primary keys on all tables. Indexes on foreign keys and on `stats(game_id)`, `stats(player_id)`, and `rivalries(game_type_id)` for fast lookups. Unique constraints as noted above.
  - Data types: Use SQLite types (TEXT for ids, INTEGER for scores, TIMESTAMP for dates). Field lengths are not strictly limited except for ids (UUIDv4 or short string, <= 36 chars).

- [x] **SQLite connection and configuration details**
  - Connection string format: `SQLite:///absolute/path/to/dbfile.db` for local persistent storage. Use a relative path in development, absolute in production.
  - Database file is always stored locally on disk for persistence. In-memory mode is not used in production.
  - Backup strategy: Nightly copy of the SQLite file to a separate backup directory. Use `SQLite .backup` command or OS-level file copy. Retain 7 days of rolling backups. For Pi, use a cron job and external USB or network storage if available.

- [x] **Migration strategy specifics**
  - Migration tool: migrationRunner.js (cross-platform, works with SQLite). All schema changes are versioned in `api/db/migrations/`.
  - On migration failure in production: Log error, halt startup, and alert admin. Migrations are idempotent and can be retried safely after fixing the issue.

### API Specifications

- [x] **Complete REST endpoint definitions**
  - Endpoints:
    **Sqid-specific endpoints (all under `/api/:sqid`):**
    - `POST /api/:sqid` — Create new sqid (API only; there is no UI for listing, editing, or deleting Sqids)
    - `GET /api/:sqid` — Get sqid details
    - `GET /api/:sqid/players` — List players in sqid
    - `POST /api/:sqid/players` — Add player to sqid
    - `GET /api/:sqid/games/:gameId` — Get game details
    - `POST /api/:sqid/games` — Create new game
    - `POST /api/:sqid/games` — Create new game
      - All players included in a game must already exist in the sqid. If a player does not exist, the client must add them via `POST /api/:sqid/players` before creating the game.
    - `PUT /api/:sqid/games/:gameId` — Update game (end, change type, etc)
    - `GET /api/:sqid/games/:gameId/stats` — Get stats for a game
    - `POST /api/:sqid/games/:gameId/stats` — Add/update player stats
    - `GET /api/:sqid/rivalries/:rivalryId` — Get rivalry details
      - Rivalries are auto-created by the backend when two players play the same game type together for the first time in a sqid. There is no manual creation endpoint; rivalries are managed automatically based on game participation.
    - `GET /api/:sqid/players/:playerId` — Get player details

    **Global endpoints (not sqid-specific):**
    - `GET /api/game_types` — List game types
    - `POST /api/game_types` — Add new game type (admin UI only)
    - `DELETE /api/game_types/:id` — Remove a game type (admin UI only)
  - Payloads: All requests/response bodies are JSON. Example for creating a player: `{ "name": "Alice" }`. All endpoints return `{ success: true, data: ... }` or `{ success: false, error: "..." }`.
  - Status codes: 200 for success, 201 for created, 400 for validation errors, 404 for not found, 403 for forbidden, 500 for server errors.
  - Validation: All IDs must be valid UUIDs or short strings. Names must be non-empty, max 64 chars. No duplicate names per sqid/game_type. Scores must be between -999 and 999 (inclusive); the API will reject values outside this range, and the client UI must prevent entry beyond these boundaries.

- [x] **WebSocket event specifications**
  - Socket.IO events:
    - `connect`, `disconnect`, `reconnect` (standard)
    - `score_update` (broadcast to `/sqid/:id` room when any score changes)
    - `player_joined`, `player_left` (broadcast to `/sqid/:id` room)
    - `game_started`, `game_ended` (broadcast to `/sqid/:id` room)
  - Data structure: `{ type: "score_update", gameId, playerId, score, timestamp }` etc. All events are minimal and trigger the client to fetch updated data via REST.
  - **Persistence and retry:** WebSocket (Socket.IO) events are strictly stateless signals. Events are not persisted or stored on the server, and once a notification is successfully sent to connected clients, it is not retried or replayed. If a client is offline or misses a notification, it will fetch the latest data on reconnect or page load. No event history or delivery guarantees beyond best-effort notification. This ensures the system remains simple, scalable, and avoids unnecessary complexity in event management.
  - Connection failures: Client stores unsent actions locally and retries on reconnect. Reconnect attempts use exponential backoff. UI shows connection status. No battery-intensive polling.
  - Rooms/namespaces: Each sqid uses its own room `/sqid/:id` for isolation.

  - **Offline-first and connectivity:** The application must work fully offline using service workers and local storage/IndexedDB. The app should check for network connectivity at least once per minute; when connectivity is restored, it should automatically switch to online mode and sync any queued actions or data. UI must clearly indicate offline/online status.

  - **Service worker cache invalidation strategy:**
    - Use a network-first, fallback-to-cache approach for API/data requests to ensure users get fresh data when online, but can still use the app offline.
    - Invalidate cached static assets and data on each new deployment by versioning cache names (e.g., include a build hash or version in the cache key).
    - For dynamic data (e.g., scores, player lists), use a short cache TTL (1–5 minutes) and always revalidate with the server when online. If offline, serve the most recent cached data.
    - On service worker activation, delete old caches to ensure users receive the latest assets and code.
    - Document the cache strategy in the codebase and ensure it is tested across browsers and devices.
    - All cache logic must be robust against network flakiness and support seamless transition between offline and online modes.
  
  - WebSocket usage is minimal: events only notify clients to fetch new data, not to send full data payloads. **No event persistence or retry is performed after a notification succeeds; all events are ephemeral and stateless.**

- [x] **Authentication/Authorization details**
  - Sqid-based access: All API and WebSocket requests require a valid Sqid in the route or payload. Access is limited to data within the given Sqid. No user authentication is implemented; all actions are anonymous.
  - Middleware: All endpoints and socket connections use middleware to validate Sqid existence and membership. Invalid or missing Sqids return 403 Forbidden.
  - Invalid Sqid: Returns 403 with error message. No data is leaked.
  - Admin/owner: The creator of a Sqid (first client to create it) is the owner and can remove players, delete the Sqid, or transfer ownership. All other users are regular members. Ownership is tracked in the `sqids` table, but not tied to a user account.


### Frontend Component Specifications

- [x] **Detailed component requirements**
  - All components are functional, reusable, and styled with TailwindCSS + DaisyUI (dark theme, mobile-first).
  - Main components:
    - `SqidList`: Props: `sqids`, `onSelect`. State: none. Lists all sqids, touch-friendly.
    - `PlayerList`: Props: `players`, `onAdd`, `onRemove`. State: loading, error.
    - `GameBoard`: Props: `game`, `players`, `stats`, `onScoreChange`. State: local score buffer, loading, error.
    - `ScoreInput`: Props: `player`, `score`, `onChange`. State: local input value.
    - `RivalryList`: Props: `rivalries`, `onSelect`. State: loading.
    - `ConnectionStatus`: Props: `status`. State: none. Shows real-time connection state.
  - UI layouts: Mobile uses single-column, touch-optimized cards and buttons (min 48px targets). Desktop uses responsive grid/flex layouts. Font sizes use `vwh` units for scaling.
  - Communication: Parent-to-child via props, child-to-parent via callbacks. Global state (e.g. current sqid, user) via React Context. No prop drilling.
  - Loading/error: All async components show skeletons or spinners and error banners/messages. Errors are actionable (e.g. retry, contact support).

- [x] **Routing specifications**
  - Routes:
    - `/` — Home/landing page
    - `/sqids` — List all sqids
    - `/sqids/:sqidId` — Sqid dashboard
    - `/sqids/:sqidId/players` — Player management
    - `/games/:gameId` — Game board
    - `/rivalries/:rivalryId` — Rivalry details
    - `/settings` — App/user settings
    - `*` — 404 Not Found (shows friendly error, link to home)
  - Invalid routes: Show 404 page with navigation to home or last valid page.
  - Route parameters: All IDs validated as UUID or short string (alphanumeric, 4-36 chars). Invalid params redirect to 404.
  - Navigation: Mobile uses bottom nav bar; desktop uses sidebar. Contextual navigation (e.g. back to sqid, back to game) is always available.


### Game Logic Clarifications Needed

- [x] **Win/Loss condition logic**
  - Win/loss conditions are stored in the `game_types` table as simple numeric thresholds (e.g. `win_score`, `loss_score`). Only one condition per game type.
  - No complex conditions (e.g. OR/AND logic) are supported.
  - If multiple players reach the condition simultaneously: for loss, lowest score wins; for win, highest score wins. Ties are broken by earliest achievement (timestamp in `stats`).

- [x] **Rivalry creation and management**
  - Rivalries are always auto-created when two players play the same game type in a sqid for the first time. No manual creation.
  - Only one rivalry per player pair per game type per sqid.

- [x] **Score update timing and UX**
  - When a score is entered, a 3-second animated tally is shown in the UI before the score is finalized and sent to the server. No debounce; each update is sent immediately after tally.
  - If network is slow/offline, score updates are stored locally (IndexedDB/localStorage) and retried in the background until confirmed by the server. UI shows sync status.

- [x] **Responsive design breakpoints**
  - Breakpoints: Tailwind defaults (sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px). Mobile: <640px, Tablet: 640-1023px, Desktop: ≥1024px.
  - Layouts: Mobile = single column, large touch targets, bottom nav. Tablet = two columns, larger cards. Desktop = grid/flex, sidebar nav, more info visible.
  - Font sizes: Use `vwh` units for scaling, e.g. `text-[4vwh]` for headings, `text-[3vwh]` for body. Minimum font size 16px for accessibility.

- [x] **Dark theme color palette**
  - Use DaisyUI `dark` theme as base. Custom accent color: `#00FFC2` for primary actions. No other custom colors unless required for accessibility.
  - All UI elements must meet WCAG AA contrast (4.5:1 for text, 3:1 for large text/icons).

- [x] **Touch interaction specifications**
  - Minimum touch target: 48x48px for all interactive elements.
  - Gestures: Only tap and long-press are supported. No swipe/pinch required.
  - Feedback: All taps/presses show visual feedback (ripple, highlight) and haptic feedback if supported by device.

- [x] **Offline/reconnection strategy**
  - On WebSocket loss: UI shows offline indicator (red dot, banner). All user actions are queued locally (IndexedDB/localStorage).
  - On reconnect: Queued actions are sent in order. If any fail, user is notified and can retry or discard.
  - UI indicators: ConnectionStatus component shows real-time status (connected, reconnecting, offline) with color and icon.

- [x] **Error handling specifications**
  - User-facing errors: Clear, actionable messages (e.g. "Could not save score. Please try again.").
  - Database/server errors: Sent as `{ success: false, error: "..." }` in API responses. UI shows error banner and logs details to console.
  - Retry: All failed network/database actions are retried up to 3 times with exponential backoff. After 3 failures, user is prompted to retry manually.

- [x] **Development tooling specifications**
  - Node.js: v20.x LTS. npm: v10.x or higher.
  - Required VS Code extensions: Prettier, ESLint, Tailwind CSS IntelliSense, Docker, SQLite, REST Client, GitLens.
  - Debugging: Use VS Code launch configs for Node.js and Chrome. API: attach to process. App: Chrome DevTools or VS Code debugger.

- [x] **Raspberry Pi deployment specifics**
  - OS: Raspberry Pi OS Lite (Debian 12/bookworm recommended).
  - Performance: Use Node.js ARM builds, enable swap, limit background processes, optimize DB queries, and use lightweight image assets.
  - Auto-start: Use systemd service to start API and app on boot. Example unit files provided in deployment/.
  - Monitoring/logging: Use PM2 or systemd logs. Log errors to file and optionally send to remote syslog or cloud.

- [x] **Production configuration**
  - Env vars: `NODE_ENV`, `PORT`, `SQLite_PATH`, `SOCKET_IO_SECRET`, `ADMIN_EMAIL`, `LOG_LEVEL`.
  - Secrets: Store in `.env` (not committed), use Pi OS secrets or Docker secrets for deployment.
  - SSL/HTTPS: All traffic is HTTPS in production. Cloudflared runs as a service using the `skorbord` tunnel for secure public access. Caddy or Nginx may be used locally, but Cloudflared is the public ingress point.
  - Backups: Nightly DB file backup to external storage or cloud. Retain 7 days minimum.

## Security Considerations

- [ ] **Missing: Security specifications**
  - What rate limiting should be implemented?
    - Rate limiting: Enforced per IP and per Sqid. Configurable maximum, but must not exceed 10 requests per second.
  - How should CORS be configured? 
  - What input validation/sanitization is required?
  - Are there any data retention/privacy requirements?

## Performance Requirements

- [ ] **Missing: Performance benchmarks**
  - What response time requirements exist for API calls?
  - How many concurrent users should be supported per Sqid?
  - What are the maximum database size expectations?
  - What caching strategies should be used?
  - API response time: ≤ 200ms p95 for all endpoints under normal load.
  - Concurrent users: Support up to 8 concurrent users per Sqid (hard limit).
  - Maximum database size: 1 million rows in stats table, 100,000 games per Sqid.
  - Caching: In-memory caching for hot data (e.g., current game state, player list) in the API. Game types and other lookup/reference data must be cached both in the API (in-memory) and in the browser (local cache, e.g., IndexedDB or localStorage) to allow offline usage and fast lookups. Use HTTP cache headers for static assets. Ensure cache is invalidated and refreshed on data changes or new deployments.


## Questions for Clarification — Answers

### Business Logic Answers

1. **Game Types**: Start with a predefined list of common card games (e.g. Hearts, Spades, Euchre, Poker, Custom). Admins can add or remove game types via an admin UI, which is only accessible to trusted operators (not public users).
2. **Player Limits**: 2–8 players per game.
3. **Score Limits**: Score per player per game must be between -999 and 999 (inclusive). This is enforced on both client and server: the API will reject values outside this range, and the client UI will prevent entry beyond the boundaries.
4. **Data Retention**: Game history is kept indefinitely unless deleted by the Sqid owner.
5. **Sqid Management**: Any user (no authentication required) can create a new Sqid. Sqids are generated as short, unique, human-friendly strings (e.g. 6–8 chars, base32).

### Technical Architecture Answers

1. **State Management**: Use React Context for global state. Use Zustand for complex state if needed (no Redux).
2. **Data Validation**: Both client-side (for UX) and server-side (for security/integrity).
3. **File Structure**: 
    - `api/` — Express app, routes, controllers, db, migrations, sockets
    - `app/` — React app, components, hooks, context, pages, styles
4. **Build Process**: Docker containers are provided for both dev and prod. See `deployment/` for Dockerfiles and compose files.

### User Experience Answers

1. **Navigation**: Global navigation bar (mobile: bottom, desktop: sidebar) with contextual links (e.g. back to sqid/game).
2. **Onboarding**: Yes, provide a short tutorial modal for new users and a help page.
3. **Mobile Optimization**: Yes, PWA features enabled (offline support, installable, service worker caching).
4. **Accessibility**: Target WCAG 2.1 AA compliance for all UI.


## Action Items for LLM Collaboration

- [x] Address each missing specification by providing detailed requirements (see above)
- [x] Answer all clarification questions with specific business/technical decisions (see above)
- [ ] Create detailed component wireframes or mockups (next step)
- [ ] Define complete API specifications (OpenAPI/Swagger format) (next step)
- [ ] Create database schema with example data (next step)
- [ ] Establish coding standards and style guides (next step)
- [ ] Define testing requirements and coverage expectations (next step)
- [ ] Create deployment runbooks and troubleshooting guides (next step)

---

**Note**: This checklist should be worked through systematically with an LLM to ensure all requirements are clear and complete before implementation begins.
