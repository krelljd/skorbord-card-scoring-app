-- +migrate Up
-- Round history: one row per round, one row per player per round.
-- Totals are derived from these rows; stats.score stays as a cached total
-- (committed rounds plus the open draft) until the app moves over.
-- Adds tables only. No existing table or column changes.

CREATE TABLE rounds (
    id            TEXT PRIMARY KEY,
    game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round_number  INTEGER NOT NULL CHECK (round_number >= 1),
    dealer_id     TEXT REFERENCES players(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'committed')),
    -- 1 for the single round that holds a legacy game's totals (no per-round detail);
    -- backfill rounds are excluded from per-round averages.
    is_backfill   INTEGER NOT NULL DEFAULT 0 CHECK (is_backfill IN (0, 1)),
    -- bumped on every edit so concurrent writers can detect a stale round
    revision      INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    committed_at  TIMESTAMP,
    UNIQUE (game_id, round_number)
);

-- at most one open (draft) round per game
CREATE UNIQUE INDEX idx_rounds_one_open ON rounds (game_id) WHERE status = 'open';

CREATE TABLE round_scores (
    round_id    TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    -- denormalized from rounds for fast per-game and per-player stats
    game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    points      INTEGER NOT NULL DEFAULT 0,
    edited      INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (round_id, player_id)
);

CREATE INDEX idx_round_scores_player ON round_scores (player_id, game_id);
CREATE INDEX idx_round_scores_game ON round_scores (game_id);

-- Append-only record of every change, so a correction can be traced.
CREATE TABLE score_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     TEXT NOT NULL,
    round_id    TEXT,
    player_id   TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('tap', 'set', 'clear', 'undo', 'edit', 'commit')),
    old_points  INTEGER,
    new_points  INTEGER,
    origin      TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_score_audit_game ON score_audit (game_id, id);

-- Backfill 1: every existing game gets one committed legacy round holding its
-- current totals, so per-game totals equal the sum of round points.
INSERT INTO rounds (id, game_id, round_number, dealer_id, status, is_backfill, created_at, committed_at)
SELECT
    lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
          substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
    g.id,
    1,
    g.dealer_id,
    'committed',
    1,
    COALESCE(g.started_at, CURRENT_TIMESTAMP),
    COALESCE(g.ended_at, g.started_at, CURRENT_TIMESTAMP)
FROM games g;

INSERT INTO round_scores (round_id, game_id, player_id, points, updated_at)
SELECT r.id, s.game_id, s.player_id, s.score, COALESCE(s.updated_at, CURRENT_TIMESTAMP)
FROM stats s
JOIN rounds r ON r.game_id = s.game_id AND r.round_number = 1;

-- Backfill 2: an unfinished game continues in a fresh open round 2, with a zero
-- draft row per player.
INSERT INTO rounds (id, game_id, round_number, dealer_id, status, is_backfill, created_at)
SELECT
    lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
          substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
    g.id,
    2,
    g.dealer_id,
    'open',
    0,
    CURRENT_TIMESTAMP
FROM games g
WHERE COALESCE(g.finalized, 0) = 0;

INSERT INTO round_scores (round_id, game_id, player_id, points)
SELECT r.id, s.game_id, s.player_id, 0
FROM stats s
JOIN rounds r ON r.game_id = s.game_id AND r.round_number = 2 AND r.status = 'open';
