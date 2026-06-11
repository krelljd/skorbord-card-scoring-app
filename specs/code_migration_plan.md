# Code Migration Plan: Player-Group Rivalries with Per-Game-Type Stats

---

## 1. Database Migration

-- **a. Update `rivalries` Table**
  - Redefine rivalry to represent a unique set of player IDs (e.g., sorted array or hash).
  - Add a column for a canonical player group key (e.g., `player_group_key`).
  - Remove direct dependency on game type.

-- **b. Add `rivalry_stats` Table**
  - Fields: `id`, `rivalry_id`, `game_type_id`, `total_games`, `margin`, `streaks`, etc.
  - Foreign keys: `rivalry_id` → `rivalries.id`, `game_type_id` → `game_types.id`.
  - Ensure all migration scripts are idempotent.

-- **c. Update/Seed Data**
  - Migrate existing rivalry records to new structure.
  - Aggregate stats per player group and game type.

---

## 2. Backend API Migration

- **a. Refactor Rivalry Endpoints**
  - Return rivalries as unique player groups.
  - Provide stats for each rivalry per game type.
  - Update creation logic to find or create rivalry by player group.

- **b. Update Stats Aggregation**
  - When games are finalized, update `rivalry_stats` for the relevant player group and game type.

- **c. Documentation**
  - Update OpenAPI spec and code comments to reflect new rivalry model.

---

## 3. Frontend App Migration

- **a. Update Rivalry Selection UI**
  - Show a list of unique player groups for rivalry selection.
  - When selected, display stats broken down by game type.

- **b. Refactor Data Handling**
  - Update logic for creating/selecting rivalries to use player groups.
  - Fetch and display per-game-type stats for selected rivalry.

- **c. Documentation**
  - Add comments explaining the new rivalry grouping logic.

---
