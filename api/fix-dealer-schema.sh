#!/bin/bash
# Fix dealer_id column type from INTEGER to TEXT and set dealers for existing games
# Run this script from the api directory

echo "🔧 Fixing dealer_id column type in SQLite database..."

sqlite3 db/cards-sqlite.db << 'EOF'
BEGIN;

-- Create new games table with correct schema
CREATE TABLE games_new (
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

-- Copy data from old table
INSERT INTO games_new (id, sqid_id, game_type_id, rivalry_id, started_at, ended_at, winner_id, finalized, win_condition_type, win_condition_value, dealer_id)
SELECT id, sqid_id, game_type_id, rivalry_id, started_at, ended_at, winner_id, finalized, win_condition_type, win_condition_value, 
       CASE 
         WHEN dealer_id IS NOT NULL THEN CAST(dealer_id AS TEXT)
         ELSE NULL 
       END as dealer_id
FROM games;

-- Drop old table and rename new one
DROP TABLE games;
ALTER TABLE games_new RENAME TO games;

COMMIT;
EOF

echo "✅ Database schema fixed!"

# Now set dealers for any games that don't have one
node -e "
import db from './db/database.js';

async function fixDealers() {
  const gamesWithoutDealer = await db.query('SELECT id FROM games WHERE dealer_id IS NULL');
  
  for (const game of gamesWithoutDealer) {
    const players = await db.query('SELECT player_id FROM stats WHERE game_id = ?', [game.id]);
    if (players.length > 0) {
      const dealerId = players[Math.floor(Math.random() * players.length)].player_id;
      await db.run('UPDATE games SET dealer_id = ? WHERE id = ?', [dealerId, game.id]);
      console.log(\`✅ Set dealer for game \${game.id}\`);
    }
  }
  process.exit(0);
}

fixDealers();
"

echo "✅ All fixes applied successfully!"
