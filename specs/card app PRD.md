# Product Requirements Document (PRD)

**Product:** Skorbord

---

## 1. Purpose

Enable users to track, manage, and analyze scores for card games in real time, supporting multiple players and rivalries, with a focus on mobile usability, accessibility, and secure, shareable sessions.

---

## 2. Features

### 2.1 Session Management

- Each scoreboard session is accessed via a unique, encoded URL parameter (Sqid).
- All data is isolated per Sqid.
- All URLs should be isolated by Sqid (example: /:sqid/cards, /:sqid/admin)

### 2.2 Game Setup

- Users select a game type from a predefined, autocomplete-enabled list or add a new type.
- Game types have default win/loss conditions, which can be overridden per game.
- Players can be added/removed before the game starts.
- Games require at least two players.
- Users can select rivalries (player-based) to auto-populate players.

### 2.3 Scoring & Gameplay

- Once started, users can increment/decrement player scores by 1 or 10 via large, touch-friendly buttons.
- Scores are editable until the game is finalized.
- When a win/loss condition is met, the winner is displayed.
- Finalizing a game updates rivalry stats and history.

### 2.4 Rivalries

- Rivalries are tracked per game type and player combination.
Rivalry stats include last 10 results and min/max win/loss margins.
- Rivalries should be checked for existence at game creation, and autocreated if one doesn't exist.

### 2.5 Favorites & Randomizer

- Users can favorite game types.
- Users can request a randomly selected game type to play from their list of favorites. The user can then select to start a game of that type, or ask for another randomized selection.

### 2.6 Real-Time Collaboration

- All score and game state changes are broadcast in real time via REST and WebSocket (Socket.IO) APIs.
- If database persistence fails, users are notified that tracking is unreliable.

### 2.7 UI/UX & Accessibility

- UI is optimized for mobile/touch, using relative font sizes (vwh).
- Uses TailwindCSS and DaisyUI with the dark theme.
- All views are accessible via unique URL segments (e.g., /score/:sqid, /board/:sqid, /cards/:sqid).
- Modal windows are used for administrative tasks and rivalry stats.

### 2.8 Deployment & Structure

- Frontend build output is in the `dist/` directory.
- Backend code is in `api/`, frontend in `app/`.
- Project structure and dependencies are mapped in `code_map.json`.
- Deployment steps are documented in `deployment/deployment_steps.md`.

---

## 3. Non-Functional Requirements

- Minimal third-party frontend libraries (except TailwindCSS, DaisyUI).
- No TypeScript.
- Modern, maintainable, and accessible codebase.
- Latest stable versions of all dependencies.

---

## 4. Success Metrics

- Users can create and join sessions via unique URLs.
- Real-time updates work reliably across devices.
- All game and rivalry data is persisted and accurately tracked.
- The app is fully usable and accessible on iPhones and iPads.
- Favoriting and random game selection work as specified.

---

## 5. Out of Scope

- User authentication beyond Sqid-based access.
- Support for non-card games.
- Advanced analytics or reporting.

---

This PRD is designed to guide development and ensure alignment with your business and technical requirements.
