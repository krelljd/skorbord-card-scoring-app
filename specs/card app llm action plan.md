# Skorbord Card Scoring App – LLM Action Plan

This action plan outlines all steps required to build, document, and deploy the Skorbord Card Scoring App, ensuring a robust, maintainable, and developer-friendly application.

---

## Action Plan

```markdown
- [ ] Step 1: Create and maintain `.env`, `.env.example`, and `.gitignore` files in both `api/` and `app/` directories.
- [ ] Step 2: Add a `README.md` and `code_map.json` to the project root for onboarding and structure mapping.
- [ ] Step 3: Set up ESLint and Prettier for both backend and frontend; add `lint` and `format` scripts to both `package.json` files.
- [ ] Step 4: Scaffold the backend (`api/`) with Node.js, Express, Socket.IO, and SQLite; add migration and seed scripts, and ensure a migration runner is available (e.g., `npm run migrate`, `npm run seed`).
- [ ] Step 5: Add `dev`, `lint`, and `format` scripts to both `api/package.json` and `app/package.json`.
- [ ] Step 6: Implement the full SQLite schema for all required entities (sqids, players, games, game_types, rivalries, stats, etc.), ensuring idempotent migrations and seed data for development.
- [ ] Step 7: Develop REST and WebSocket (Socket.IO) APIs for all CRUD operations and real-time updates, including middleware for Sqid-based access control and robust error handling.
- [ ] Step 8: Add OpenAPI spec and `.http` files for API documentation and manual testing.
- [ ] Step 9: Implement backend logic for all features: game management, scoring, rivalry tracking, stats aggregation, favoriting, randomizer, and real-time sync.
- [ ] Step 10: Scaffold the frontend (`app/`) using Vite, React, TailwindCSS, and DaisyUI (dark theme); configure TailwindCSS, DaisyUI, and Vite proxy in the frontend; ensure `vite.config.js` proxies `/api` to backend.
- [ ] Step 11: Build reusable, maintainable frontend components (PlayerList, ScoreControls, GameTypeSelector, RivalrySelector, etc.) with mobile-first, touch-friendly UI and relative font sizes (vwh).
- [ ] Step 12: Implement frontend routing for `/cards/:sqid` and related views, including authentication/access via Sqid in the URL.
- [ ] Step 13: Integrate frontend with backend APIs for real-time updates, error handling, and state synchronization.
- [ ] Step 14: Add frontend features for favoriting game types, random game selection, and modal windows for admin tasks and rivalry stats.
- [ ] Step 15: Add VS Code run tasks for starting backend/frontend in dev mode, linting, formatting, and deployment scripts.
- [ ] Step 16: Add `.vscode/extensions.json` for recommended extensions (ESLint, Prettier, TailwindCSS IntelliSense, etc.).
- [ ] Step 17: Add `.vscode/settings.json` for workspace-specific settings (e.g., format on save, default shell).
- [ ] Step 18: Ensure all scripts are cross-platform or provide alternatives for Windows/macOS/Linux.
- [ ] Step 19: Set up scripts for local development, build, and deployment, and ensure deployment steps are automated and documented.
- [ ] Step 20: Prepare for production deployment on Raspberry Pi, including systemd service setup, Cloudflared tunneling, and final verification of production URLs.
```

---

This plan ensures all foundational, development, documentation, and deployment requirements are addressed for a robust, maintainable, and developer-friendly application.
