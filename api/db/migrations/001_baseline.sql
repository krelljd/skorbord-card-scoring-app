-- +migrate Up
-- Baseline schema: matches the production database (cards-sqlite.db) as verified on
-- 2026-10-01 from a VACUUM INTO copy taken on the Raspberry Pi. It replaces the old
-- 001_initial_schema.sql and 002_add_player_order.sql, which no longer built the same schema.
-- Databases that already applied those two files are marked as baselined by the runner
-- without running this file. Only empty databases execute it.
-- The migrations table is created by the runner, not here.
-- Contains the game_types seed rows and no user data.

CREATE TABLE sqids (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    owner TEXT
);

CREATE TABLE game_types (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    win_condition INTEGER,
    loss_condition INTEGER,
    is_win_condition BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE players (
    id TEXT PRIMARY KEY,
    sqid_id TEXT NOT NULL REFERENCES sqids(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, color TEXT,
    UNIQUE(sqid_id, name)
);

CREATE TABLE stats (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= -999 AND score <= 999),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
, player_order INTEGER DEFAULT NULL);

CREATE TABLE rivalries (
    id TEXT PRIMARY KEY,
    sqid_id TEXT NOT NULL REFERENCES sqids(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    -- No game_type_id here!
);

CREATE TABLE rivalry_players (
    rivalry_id TEXT NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (rivalry_id, player_id)
);

CREATE TABLE rivalry_game_types (
    rivalry_id TEXT NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
    game_type_id TEXT NOT NULL REFERENCES game_types(id),
    PRIMARY KEY (rivalry_id, game_type_id)
);

CREATE TABLE favorites (
    sqid_id TEXT NOT NULL REFERENCES sqids(id) ON DELETE CASCADE,
    game_type_id TEXT NOT NULL REFERENCES game_types(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sqid_id, game_type_id)
);

CREATE TABLE rivalry_player_stats (
    id TEXT PRIMARY KEY,
    rivalry_id TEXT NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    game_type_id TEXT NOT NULL REFERENCES game_types(id),
    total_games INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    avg_margin REAL,
    min_win_margin INTEGER,
    max_win_margin INTEGER,
    min_loss_margin INTEGER,
    max_loss_margin INTEGER,
    last_10_results TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rivalry_id, player_id, game_type_id)
);

CREATE TABLE "games" (
    id TEXT PRIMARY KEY,
    sqid_id TEXT NOT NULL REFERENCES sqids(id) ON DELETE CASCADE,
    game_type_id TEXT NOT NULL REFERENCES game_types(id),
    rivalry_id TEXT REFERENCES rivalries(id),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    winner_id TEXT REFERENCES players(id),
    finalized BOOLEAN DEFAULT false,
    win_condition_type TEXT,
    win_condition_value INTEGER,
    dealer_id TEXT REFERENCES players(id)
);

CREATE INDEX idx_players_sqid ON players (sqid_id);

CREATE INDEX idx_stats_game ON stats (game_id);

CREATE INDEX idx_stats_player ON stats (player_id);

CREATE INDEX idx_favorites_sqid_type ON favorites (sqid_id, game_type_id);

CREATE INDEX idx_stats_timestamp ON stats (created_at);

CREATE UNIQUE INDEX idx_players_sqid_name_nocase ON players (sqid_id, TRIM(name) COLLATE NOCASE);

CREATE INDEX idx_rivalry_game_types_rivalry ON rivalry_game_types (rivalry_id);

CREATE INDEX idx_rivalry_game_types_game_type ON rivalry_game_types (game_type_id);

CREATE INDEX idx_rivalry_player_stats_rivalry ON rivalry_player_stats (rivalry_id);

CREATE INDEX idx_rivalry_player_stats_player ON rivalry_player_stats (player_id);

CREATE INDEX idx_rivalry_player_stats_game_type ON rivalry_player_stats (game_type_id);

CREATE INDEX idx_stats_game_order ON stats (game_id, player_order);

-- game_types seed rows
INSERT INTO game_types (id, name, description, win_condition, loss_condition, is_win_condition, created_at) VALUES ('golf', 'Golf', 'Golf', NULL, 100, 0, '2025-07-12 03:42:30');
INSERT INTO game_types (id, name, description, win_condition, loss_condition, is_win_condition, created_at) VALUES ('oklahomagin', 'Oklahoma Gin', 'Gin Rummy with special rules', 100, NULL, 1, '2025-07-12 03:42:30');
INSERT INTO game_types (id, name, description, win_condition, loss_condition, is_win_condition, created_at) VALUES ('cribbage', 'Cribbage', 'Traditional Cribbage card game', 121, NULL, 1, '2025-07-12 03:42:30');
INSERT INTO game_types (id, name, description, win_condition, loss_condition, is_win_condition, created_at) VALUES ('pitch', 'Pitch', 'Pitch', 100, NULL, 1, '2025-07-12 03:42:30');
INSERT INTO game_types (id, name, description, win_condition, loss_condition, is_win_condition, created_at) VALUES ('blitz', 'Blitz', 'Blitz', 100, NULL, 1, '2025-07-12 03:42:30');
