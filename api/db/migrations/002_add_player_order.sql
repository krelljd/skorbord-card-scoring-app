-- +migrate Up
-- Add player_order field to games stats to track the order of players within a game
ALTER TABLE stats ADD COLUMN player_order INTEGER DEFAULT NULL;

-- Create an index for faster ordering queries
CREATE INDEX IF NOT EXISTS idx_stats_game_order ON stats (game_id, player_order);

-- Update existing stats to set initial player_order based on created_at
-- Use a simpler approach that works with SQLite
UPDATE stats 
SET player_order = (
  SELECT COUNT(*) + 1
  FROM stats s2 
  WHERE s2.game_id = stats.game_id 
  AND s2.created_at < stats.created_at
);

-- +migrate Down
-- Remove player_order field from stats
DROP INDEX IF EXISTS idx_stats_game_order;
ALTER TABLE stats DROP COLUMN player_order;
