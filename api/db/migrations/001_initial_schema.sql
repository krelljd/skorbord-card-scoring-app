-- +migrate Up
-- Create sqids table
CREATE TABLE sqids (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    owner TEXT
);

-- Create game_types table
CREATE TABLE game_types (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    win_condition INTEGER,
    loss_condition INTEGER,
    is_win_condition BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create players table
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    sqid_id TEXT NOT NULL REFERENCES sqids(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT, -- Added color column for DaisyUI color assignment
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sqid_id, name)
);

-- Create games table
CREATE TABLE games (
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

-- Create stats table (stores individual scores)
CREATE TABLE stats (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= -999 AND score <= 999),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create rivalries table (unique group of players within a sqid)
CREATE TABLE rivalries (
    id TEXT PRIMARY KEY,
    sqid_id TEXT NOT NULL REFERENCES sqids(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    -- No game_type_id here!
);

-- Create rivalry_players table (many-to-many between rivalries and players)
CREATE TABLE rivalry_players (
    rivalry_id TEXT NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (rivalry_id, player_id)
);

-- Create rivalry_game_types table (many-to-many between rivalries and game types)
CREATE TABLE rivalry_game_types (
    rivalry_id TEXT NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
    game_type_id TEXT NOT NULL REFERENCES game_types(id),
    PRIMARY KEY (rivalry_id, game_type_id)
);

-- Create rivalry_stats table (aggregated statistics for rivalries per game type)
CREATE TABLE rivalry_stats (
    id TEXT PRIMARY KEY,
    rivalry_id TEXT NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
    game_type_id TEXT NOT NULL REFERENCES game_types(id),
    -- avg_margin column removed
    last_10_results TEXT, -- Store as string like "WWLWLLWWLW"
    min_win_margin INTEGER,
    max_win_margin INTEGER,
    min_loss_margin INTEGER,
    max_loss_margin INTEGER,
    total_games INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rivalry_id, game_type_id)
);

-- Create favorites table (favorited game types per sqid)
CREATE TABLE favorites (
    sqid_id TEXT NOT NULL REFERENCES sqids(id) ON DELETE CASCADE,
    game_type_id TEXT NOT NULL REFERENCES game_types(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sqid_id, game_type_id)
);


-- Create indexes for performance
CREATE INDEX idx_players_sqid ON players (sqid_id);
CREATE INDEX idx_games_sqid ON games (sqid_id);
CREATE INDEX idx_games_game_type ON games (game_type_id);
CREATE INDEX idx_stats_game ON stats (game_id);
CREATE INDEX idx_stats_player ON stats (player_id);
CREATE INDEX idx_favorites_sqid_type ON favorites (sqid_id, game_type_id);
CREATE INDEX idx_stats_timestamp ON stats (created_at);

-- Enforce case-insensitive uniqueness for player names within a sqid
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_sqid_name_nocase ON players (sqid_id, TRIM(name) COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_rivalry_game_types_rivalry ON rivalry_game_types (rivalry_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_game_types_game_type ON rivalry_game_types (game_type_id);

INSERT INTO game_types (id, name, description, win_condition, loss_condition, is_win_condition) VALUES
    ('golf', 'Golf', 'Golf', null, 100, false),
    ('oklahomagin', 'Oklahoma Gin', 'Gin Rummy with special rules', 500, null, true),
    ('cribbage', 'Cribbage', 'Traditional Cribbage card game', 121, null, true),
    ('lowwin', 'Low Win', 'Low Score Win game', 5, null, true),
    ('lowloss', 'Low Loss', 'Low Score Loss game', null, 5, false),
    ('pitch', 'Pitch', 'Pitch', 100, null, true),
    ('blitz', 'Blitz', 'Blitz', 100, null, true);

-- Track rivalry stats per player and game type
CREATE TABLE IF NOT EXISTS rivalry_player_stats (
    id TEXT PRIMARY KEY,
    rivalry_id TEXT NOT NULL REFERENCES rivalries(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    game_type_id TEXT NOT NULL REFERENCES game_types(id),
    total_games INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    -- avg_margin column removed
    min_win_margin INTEGER,
    max_win_margin INTEGER,
    min_loss_margin INTEGER,
    max_loss_margin INTEGER,
    last_10_results TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rivalry_id, player_id, game_type_id)
);

CREATE INDEX IF NOT EXISTS idx_rivalry_player_stats_rivalry ON rivalry_player_stats (rivalry_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_player_stats_player ON rivalry_player_stats (player_id);
CREATE INDEX IF NOT EXISTS idx_rivalry_player_stats_game_type ON rivalry_player_stats (game_type_id);

INSERT INTO "main"."sqids" ("id", "name", "owner") VALUES ('demo', 'demo', 'owner@example.com');
