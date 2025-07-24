# Implementation Plan: Skorbord Card Scoring App

This plan is designed for an LLM or developer to follow step-by-step, ensuring a working, standards-compliant application for both local development and deployment. All code and files must follow the project structure, naming conventions, and best practices outlined in the project documentation and `.github/copilot-instructions.md`.

---

## 1. Project Structure & Tooling

- Use `api/` for backend (Node.js, Express, Socket.IO, SQLite, ES6+ JavaScript)
- Use `app/` for frontend (Vite, React, TailwindCSS, DaisyUI, ES6+ JavaScript)
- Ensure all code and markdown content is standards-compliant
- Follow naming conventions and folder structure as per documentation
- Use relative font sizes (vwh) for all text and controls for mobile/touch optimization
- Add `.env` files for configuration (local and production)
- Add scripts for local start, build, and deployment
- Integrate with Context7 for code search, documentation, and developer experience

---

## 2. Database & Data Model

- Implement SQLite to store data across sessions
- Ensure all database scripts are idempotent and can be run multiple times without causing issues
- Use SQLite for all persistent storage
- Add migration scripts for schema updates and document all migrations
- Seed with sample data for local development
- Document schema and migrations
- Leverage Context7 for schema documentation and code mapping

---

## 3. Backend API (`api/`)

- Set up Express server with REST endpoints needed for the UI to efficiently store and retrieve the data needed for app functionality. ensure required fields are appropriately handled in the request and response models.
- Implement real-time updates using Socket.IO (WebSocket) APIs
- Implement middleware for Sqid-based access control
- Add error handling for database failures and emit status to clients
- Add CORS and security best practices
- Use only modern JavaScript (ES6+), avoid TypeScript
- Ensure all code is readable, maintainable, and well-documented (comments should explain why decisions were made)

- Use Context7 for API documentation, endpoint discovery, and code navigation

---

## 4. Frontend App (`app/`)

- Scaffold React app with Vite, TailwindCSS, DaisyUI (dark theme)
- Set up routing for `/cards/:sqid`
- Implement authentication/access via Sqid in the URL
- Add environment-based API URL configuration
- Use only modern JavaScript (ES6+), avoid TypeScript
- Ensure all code is readable, maintainable, and well-documented (comments should explain why decisions were made)
- Serve files from `/dist` folder
- Integrate Context7 for component documentation, code search, and UI mapping

---

## 5. UI Components & Views

- Build reusable, maintainable components: PlayerList, ScoreControls, GameTypeSelector, RivalrySelector, etc.
- Ensure all controls are touch-friendly and use relative font sizes (vwh)
- Use TailwindCSS and DaisyUI for all styling, adhering to the dark theme
- Ensure all UI is optimized for mobile and touch use
- Implement modal windows for admin tasks and rivalry stats
- Document all components and their props
- Use Context7 for component search, prop documentation, and UI structure mapping

---

## 6. Game Logic & State

- Implement logic for starting games, adding/removing players, selecting/creating rivalries
- Implement score updating, win/loss detection, and game finalization
- Ensure all state changes are synced via REST and WebSocket (Socket.IO)
- Display clear UI warnings if persistence fails or real-time sync is lost
- First player to reach the win or loss condition should 
- Document game logic and state flows using Context7

---

## 7. Rivalry & Stats Tracking

- Implement rivalry creation, selection, and stats aggregation (margin, streaks, min/max)
- Update rivalry stats when games are finalized
- Ensure rivalry stats are displayed in modal windows after game finalization and accessible from the start screen
- Use Context7 for stats logic documentation and code navigation

---

## 8. Favorites & Randomizer

- Allow users to favorite game types
- Implement random game selection from favorites
- Document logic and UI using Context7

---

## 9. Real-Time & Offline Handling

- Ensure all score and state changes are broadcast in real time using REST and WebSocket (Socket.IO) APIs
- Display clear UI warnings if persistence fails or real-time sync is lost
- Use Context7 for troubleshooting and code search

---

## 10. Deployment & Documentation

- Configure build output to `dist/` for frontend
- Document deployment steps in `deployment_steps.md`
- Generate and maintain `code_map.json` for project structure and dependencies
- Add scripts for production deployment (e.g., Docker, cloud, or static hosting + Node.js server)
- Document all setup and configuration in `README.md`
- Leverage Context7 for deployment documentation and code mapping

---

## 11. Local Development

- Provide scripts for local development: `npm run dev` for frontend, `npm run dev` for backend
- Use `.env.local` for local configuration
- Document local setup in `README.md`
- Use Context7 for onboarding and local setup documentation

---

## 12. Production Deployment

- Use `.env.production` for production configuration
- Build frontend with `npm run build` and serve from backend
- Run database migrations and seed if needed
- Deploy using documented steps (see `deployment_steps.md`)
- Use Context7 for production deployment mapping and troubleshooting

---

## 13. Final Review

- Review for accessibility, performance, and usability
- Finalize documentation and prepare for production deployment
- Ensure all code and files follow the standards and best practices outlined in `.github/copilot-instructions.md`
- Use Context7 for final code review, standards compliance, and documentation completeness

---

This plan ensures a maintainable, accessible, and real-time scoring app for both local and deployed scenarios, following the PRD, project documentation, and copilot-instructions.md requirements.
