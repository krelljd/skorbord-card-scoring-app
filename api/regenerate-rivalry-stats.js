// regenerate-rivalry-stats.js
// Utility script to regenerate all rivalry_player_stats by re-processing all finalized games.
// This fixes the issue where stats included matches from other rivalries.
// Usage: `node regenerate-rivalry-stats.js`
//
// Context7: For code search, documentation, and developer experience, see https://context7.com/.

import db from './db/database.js';
import { generateUUID } from './utils/helpers.js';

async function regenerateRivalryStats() {
  try {
    await db.initialize();
    console.log('🔄 Starting rivalry stats regeneration...');

    // Clear all existing rivalry_player_stats
    const deleteResult = await db.run('DELETE FROM rivalry_player_stats');
    console.log(`✅ Cleared ${deleteResult.changes} existing rivalry player stats`);

    // Get all finalized games with their rivalries
    const games = await db.query(`
      SELECT DISTINCT g.id, g.sqid_id, g.game_type_id, g.rivalry_id
      FROM games g
      WHERE g.finalized = true AND g.rivalry_id IS NOT NULL
      ORDER BY g.started_at ASC
    `);

    console.log(`📊 Found ${games.length} finalized games with rivalries to process`);

    // Process each game to regenerate its rivalry stats
    let processed = 0;
    for (const game of games) {
      await updateRivalryStats(game.sqid_id, game.game_type_id, game.id);
      processed++;
      if (processed % 10 === 0) {
        console.log(`⏳ Processed ${processed}/${games.length} games...`);
      }
    }

    console.log(`✅ Successfully regenerated rivalry stats for ${processed} games`);
    
    // Verify results
    const statsCount = await db.get('SELECT COUNT(*) as count FROM rivalry_player_stats');
    console.log(`📈 Total rivalry player stats records: ${statsCount.count}`);

    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to regenerate rivalry stats:', error);
    process.exit(1);
  }
}

/**
 * Helper function to update rivalry statistics - copied from games.js
 */
async function updateRivalryStats(sqidId, gameTypeId, gameId) {
  // Get player IDs for this game
  const playerIds = await db.query(`
    SELECT player_id FROM stats WHERE game_id = ? ORDER BY player_id ASC
  `, [gameId]);
  const playerIdList = playerIds.map(row => row.player_id);
  
  // Find rivalry by sqid and exact set of players
  const placeholders = playerIdList.map(() => '?').join(',');
  const rivalry = await db.get(`
    SELECT r.id
    FROM rivalries r
    JOIN rivalry_players rp ON r.id = rp.rivalry_id
    WHERE r.sqid_id = ?
    AND rp.player_id IN (${placeholders})
    GROUP BY r.id
    HAVING COUNT(rp.player_id) = ?
    AND (
      SELECT COUNT(*) FROM rivalry_players WHERE rivalry_id = r.id
    ) = ?
  `, [sqidId, ...playerIdList, playerIdList.length, playerIdList.length]);
  
  if (!rivalry) return;
  
  // Ensure rivalry_game_types entry exists
  const exists = await db.get(
    'SELECT 1 FROM rivalry_game_types WHERE rivalry_id = ? AND game_type_id = ?',
    [rivalry.id, gameTypeId]
  );
  if (!exists) return;

  // Calculate and upsert rivalry_player_stats for each player
  for (const playerId of playerIdList) {
    // Get all finalized games for this rivalry, game type, and player
    // Fixed: Use g.rivalry_id to ensure we only include games from this specific rivalry
    const playerGames = await db.query(`
      SELECT g.id, g.winner_id, s.player_id, s.score
      FROM games g
      JOIN stats s ON g.id = s.game_id
      WHERE g.rivalry_id = ? AND g.game_type_id = ? AND g.finalized = true AND s.player_id = ?
      ORDER BY g.started_at ASC
    `, [rivalry.id, gameTypeId, playerId]);

    let wins = 0, losses = 0, totalGames = playerGames.length;
    let winMargins = [], lossMargins = [], last10Results = '';
    
    for (const game of playerGames) {
      // Get all scores for this game
      const scores = await db.query(`SELECT player_id, score FROM stats WHERE game_id = ?`, [game.id]);
      const playerScore = scores.find(s => s.player_id === playerId)?.score ?? 0;
      
      // Get winner's score for loss margin calculation
      const winnerScore = scores.find(s => s.player_id === game.winner_id)?.score ?? 0;
      
      // For win: margin = playerScore - next highest score
      // For loss: margin = winnerScore - playerScore (how much the winner beat this player by)
      const otherScores = scores.filter(s => s.player_id !== playerId).map(s => s.score);
      let margin = 0;
      
      if (game.winner_id === playerId) {
        wins++;
        const nextBest = otherScores.length > 0 ? Math.max(...otherScores) : 0;
        margin = playerScore - nextBest;
        winMargins.push(margin);
        last10Results += 'W';
      } else {
        losses++;
        // Fixed: loss margin should be how much the winner beat this player by
        margin = winnerScore - playerScore;
        lossMargins.push(margin);
        last10Results += 'L';
      }
    }
    
    const minWinMargin = winMargins.length > 0 ? Math.min(...winMargins) : (totalGames > 0 ? 0 : null);
    const maxWinMargin = winMargins.length > 0 ? Math.max(...winMargins) : (totalGames > 0 ? 0 : null);
    const minLossMargin = lossMargins.length > 0 ? Math.min(...lossMargins) : (totalGames > 0 ? 0 : null);
    const maxLossMargin = lossMargins.length > 0 ? Math.max(...lossMargins) : (totalGames > 0 ? 0 : null);
    const last10 = last10Results.slice(-10);

    // Upsert into rivalry_player_stats
    const existing = await db.get(
      'SELECT id FROM rivalry_player_stats WHERE rivalry_id = ? AND player_id = ? AND game_type_id = ?',
      [rivalry.id, playerId, gameTypeId]
    );
    const statId = existing ? existing.id : generateUUID();
    
    if (existing) {
      await db.run(
        `UPDATE rivalry_player_stats SET total_games = ?, wins = ?, losses = ?, min_win_margin = ?, max_win_margin = ?, min_loss_margin = ?, max_loss_margin = ?, last_10_results = ?, updated_at = ? WHERE id = ?`,
        [totalGames, wins, losses, minWinMargin, maxWinMargin, minLossMargin, maxLossMargin, last10, new Date().toISOString(), existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO rivalry_player_stats (id, rivalry_id, player_id, game_type_id, total_games, wins, losses, min_win_margin, max_win_margin, min_loss_margin, max_loss_margin, last_10_results, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [statId, rivalry.id, playerId, gameTypeId, totalGames, wins, losses, minWinMargin, maxWinMargin, minLossMargin, maxLossMargin, last10, new Date().toISOString()]
      );
    }
  }
}

regenerateRivalryStats();
