import express from 'express';
import { 
  validateCreateGame,
  validateUpdateGame,
  validateGameAccess 
} from '../middleware/validation.js';
import { createResponse, generateUUID, determineWinner, calculateRivalryStats } from '../utils/helpers.js';
import { NotFoundError, ConflictError, ValidationError } from '../middleware/errorHandler.js';
import db from '../db/database.js';



const router = express.Router({ mergeParams: true });

/**
 * GET /api/:sqid/games/active - Get active (non-finalized) game for Sqid
 */
router.get('/active', async (req, res, next) => {
  try {
    const { sqid } = req.params;
    // Join game_types and players for richer game info
    const game = await db.get(`
      SELECT 
        g.*, 
        gt.name as game_type_name,
        gt.description as game_type_description,
        gt.is_win_condition,
        gt.win_condition,
        gt.loss_condition,
        p.name as winner_name
      FROM games g
      LEFT JOIN game_types gt ON g.game_type_id = gt.id
      LEFT JOIN players p ON g.winner_id = p.id
      WHERE g.sqid_id = ? AND g.finalized = false
      ORDER BY g.started_at DESC LIMIT 1
    `, [sqid]);
    if (!game) {
      return res.status(404).json(createResponse(false, null, 'No active game found'));
    }
    // Use custom win condition if available, otherwise fallback to game type
    if (!game.win_condition_type || !game.win_condition_value) {
      game.win_condition_type = game.is_win_condition ? 'win' : 'lose';
      game.win_condition_value = game.is_win_condition ? game.win_condition : game.loss_condition;
    }
    res.json(createResponse(true, game));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/:sqid/games - Get all games in Sqid
 */
router.get('/', async (req, res, next) => {
  try {
    const { sqid } = req.params;
    const { limit = 50, offset = 0, finalized } = req.query;
    
    let query = `
      SELECT 
        g.*,
        gt.name as game_type_name,
        gt.description as game_type_description,
        gt.is_win_condition,
        gt.win_condition,
        gt.loss_condition,
        p.name as winner_name
      FROM games g
      LEFT JOIN game_types gt ON g.game_type_id = gt.id
      LEFT JOIN players p ON g.winner_id = p.id
      WHERE g.sqid_id = ?
    `;
    
    const params = [sqid];
    
    if (finalized !== undefined) {
      query += ' AND g.finalized = ?';
      params.push(finalized === 'true');
    }
    
    query += ' ORDER BY g.started_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const games = await db.query(query, params);
    
    // Get players for each game
    for (const game of games) {
      const players = await db.query(`
        SELECT 
          p.id,
          p.name,
          s.score,
          s.player_order,
          s.created_at as score_updated_at
        FROM stats s
        JOIN players p ON s.player_id = p.id
        WHERE s.game_id = ?
        ORDER BY COALESCE(s.player_order, 999), s.created_at ASC
      `, [game.id]);
      
      game.players = players;
    }
    
    res.json(createResponse(true, games));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/:sqid/games - Create new game
 */
router.post('/', validateCreateGame, async (req, res, next) => {
  try {
    const { sqid } = req.params;
    const { game_type_id, player_ids, player_names, win_condition_type, win_condition_value } = req.body;

    // Validate game type exists
    const gameType = await db.get(
      'SELECT * FROM game_types WHERE id = ?',
      [game_type_id]
    );
    if (!gameType) {
      throw new ValidationError('Game type not found');
    }

    let finalPlayerIds = [];
    if (Array.isArray(player_ids)) {
      finalPlayerIds = player_ids;
    } else if (Array.isArray(player_names)) {
      // For each name, look up or create player in this sqid
      for (const name of player_names) {
        const trimmed = typeof name === 'string' ? name.trim() : '';
        // Allow empty names (will create unnamed player)
        let player;
        if (trimmed) {
          player = await db.get('SELECT id FROM players WHERE sqid_id = ? AND name = ?', [sqid, trimmed]);
        }
        if (!player) {
          // Create new player (empty name allowed) with color assignment
          const playerId = generateUUID();
          
          // Get current player count for color assignment
          const playerCountResult = await db.get(
            'SELECT COUNT(*) as count FROM players WHERE sqid_id = ?',
            [sqid]
          );
          const playerCount = playerCountResult.count;
          
          // Assign color based on player position (same logic as players route)
          const PLAYER_COLORS = [
            'primary', 'secondary', 'accent', 'info', 'success', 'warning', 'error', 'neutral'
          ];
          const assignedColor = PLAYER_COLORS[playerCount % PLAYER_COLORS.length];
          
          await db.run('INSERT INTO players (id, sqid_id, name, created_at, color) VALUES (?, ?, ?, ?, ?)', [playerId, sqid, trimmed, new Date().toISOString(), assignedColor]);
          finalPlayerIds.push(playerId);
        } else {
          finalPlayerIds.push(player.id);
        }
      }
    } else {
      throw new ValidationError('player_ids or player_names required');
    }

    // Validate all players exist in this sqid (should always be true now)
    const playerPlaceholders = finalPlayerIds.map(() => '?').join(',');
    const players = await db.query(
      `SELECT id FROM players WHERE sqid_id = ? AND id IN (${playerPlaceholders})`,
      [sqid, ...finalPlayerIds]
    );
    if (players.length !== finalPlayerIds.length) {
      throw new ValidationError('One or more players not found in this Sqid');
    }

    // Create game within a transaction
    const result = await db.transaction(async (db) => {
      // Delete any existing non-finalized games for this sqid
      await db.run('DELETE FROM games WHERE sqid_id = ? AND finalized = false', [sqid]);

      const gameId = generateUUID();
      
      // Create or update rivalry and get rivalryId
      const rivalryId = await createOrUpdateRivalry(db, sqid, game_type_id, finalPlayerIds);
      
      // Determine win condition values
      let finalWinConditionType = win_condition_type;
      let finalWinConditionValue = win_condition_value;
      
      if (!finalWinConditionType || !finalWinConditionValue) {
        // Use default from game type
        finalWinConditionType = gameType.is_win_condition ? 'win' : 'lose';
        finalWinConditionValue = gameType.is_win_condition ? gameType.win_condition : gameType.loss_condition;
      }

      // Select a random dealer from the players
      const randomDealerIndex = Math.floor(Math.random() * finalPlayerIds.length);
      const initialDealerId = finalPlayerIds[randomDealerIndex];

      const gameData = {
        id: gameId,
        sqid_id: sqid,
        game_type_id: game_type_id,
        rivalry_id: rivalryId,
        started_at: new Date().toISOString(),
        finalized: false,
        win_condition_type: finalWinConditionType,
        win_condition_value: finalWinConditionValue,
        dealer_id: initialDealerId
      };

      // Insert game with rivalry_id and initial dealer
      await db.run(
        'INSERT INTO games (id, sqid_id, game_type_id, rivalry_id, started_at, finalized, win_condition_type, win_condition_value, dealer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [gameData.id, gameData.sqid_id, gameData.game_type_id, gameData.rivalry_id, gameData.started_at, gameData.finalized, gameData.win_condition_type, gameData.win_condition_value, gameData.dealer_id]
      );

      // Insert initial stats for each player (score 0) with player order
      for (let i = 0; i < finalPlayerIds.length; i++) {
        const playerId = finalPlayerIds[i];
        const statId = generateUUID();
        await db.run(
          'INSERT INTO stats (id, game_id, player_id, score, player_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [statId, gameId, playerId, 0, i + 1, gameData.started_at, gameData.started_at]
        );
      }

      // Create or update rivalry
      // Note: We don't call createOrUpdateRivalry here since it was already called above
      // The rivalry is already created with the correct relationships

      return gameData;
    });

    // Broadcast game created event
    req.io?.to(`/sqid/${sqid}`).emit('game_started', {
      type: 'game_started',
      gameId: result.id,
      sqidId: sqid,
      timestamp: result.started_at
    });

    res.status(201).json(createResponse(true, result));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/:sqid/games/:gameId - Get game details
 */
router.get('/:gameId', validateGameAccess, async (req, res, next) => {
  try {
    const { gameInfo } = req;

    // Get game with game type info
    const game = await db.get(`
      SELECT 
        g.*,
        gt.name as game_type_name,
        gt.description as game_type_description,
        gt.is_win_condition,
        gt.win_condition,
        gt.loss_condition,
        p.name as winner_name
      FROM games g
      LEFT JOIN game_types gt ON g.game_type_id = gt.id
      LEFT JOIN players p ON g.winner_id = p.id
      WHERE g.id = ?
    `, [gameInfo.id]);

    // Add computed win_condition_type and win_condition_value for frontend compatibility
    if (game) {
      if (!game.win_condition_type || !game.win_condition_value) {
        game.win_condition_type = game.is_win_condition ? 'win' : 'lose';
        game.win_condition_value = game.is_win_condition ? game.win_condition : game.loss_condition;
      }
    }

    // Get players and their scores
    const players = await db.query(`
      SELECT 
        p.id,
        p.name,
        s.score,
        s.player_order,
        s.created_at as score_created_at,
        s.updated_at as score_updated_at
      FROM stats s
      JOIN players p ON s.player_id = p.id
      WHERE s.game_id = ?
      ORDER BY COALESCE(s.player_order, 999), s.created_at ASC
    `, [gameInfo.id]);

    game.players = players;

    res.json(createResponse(true, game));
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/:sqid/games/:gameId - Update game (end, finalize, etc)
 */
router.put('/:gameId', validateGameAccess, validateUpdateGame, async (req, res, next) => {
  try {
    const { gameInfo } = req;
    const { ended_at, finalized, winner_id, dealer_id } = req.body;
    
    if (gameInfo.finalized && finalized === false) {
      throw new ConflictError('Cannot un-finalize a game');
    }
    
    const updates = {};
    const params = [];
    
    if (ended_at !== undefined) {
      updates.ended_at = '?';
      params.push(ended_at);
    }
    
    if (finalized !== undefined) {
      updates.finalized = '?';
      params.push(finalized);
    }
    
    if (winner_id !== undefined) {
      // Validate winner is in the game
      const playerInGame = await db.get(
        'SELECT id FROM stats WHERE game_id = ? AND player_id = ?',
        [gameInfo.id, winner_id]
      );
      
      if (!playerInGame) {
        throw new ValidationError('Winner must be a player in this game');
      }
      
      updates.winner_id = '?';
      params.push(winner_id);
    }
    
    if (dealer_id !== undefined) {
      // Validate dealer is in the game
      const playerInGame = await db.get(
        'SELECT id FROM stats WHERE game_id = ? AND player_id = ?',
        [gameInfo.id, dealer_id]
      );
      
      if (!playerInGame) {
        throw new ValidationError('Dealer must be a player in this game');
      }
      
      updates.dealer_id = '?';
      params.push(dealer_id);
    }
    
    if (Object.keys(updates).length === 0) {
      return res.json(createResponse(true, gameInfo));
    }
    
    // Update game
    const setClause = Object.keys(updates).map(key => `${key} = ${updates[key]}`).join(', ');
    params.push(gameInfo.id);
    
    await db.run(
      `UPDATE games SET ${setClause} WHERE id = ?`,
      params
    );
    
    // If finalizing, update rivalry stats
    if (finalized && !gameInfo.finalized) {
      await updateRivalryStats(gameInfo.sqid_id, gameInfo.game_type_id, gameInfo.id);
    }
    
    const updatedGame = await db.get(`
      SELECT 
        g.*, 
        gt.name as game_type_name,
        gt.description as game_type_description,
        gt.is_win_condition,
        gt.win_condition,
        gt.loss_condition,
        p.name as winner_name
      FROM games g
      LEFT JOIN game_types gt ON g.game_type_id = gt.id
      LEFT JOIN players p ON g.winner_id = p.id
      WHERE g.id = ?
    `, [gameInfo.id]);

    // Use custom win condition if available, otherwise fallback to game type
    if (!updatedGame.win_condition_type || !updatedGame.win_condition_value) {
      updatedGame.win_condition_type = updatedGame.is_win_condition ? 'win' : 'lose';
      updatedGame.win_condition_value = updatedGame.is_win_condition ? updatedGame.win_condition : updatedGame.loss_condition;
    }
    
    // Broadcast game updated event
    req.io?.to(`/sqid/${gameInfo.sqid_id}`).emit('game_updated', {
      type: 'game_updated',
      gameId: gameInfo.id,
      sqidId: gameInfo.sqid_id,
      finalized: updatedGame.finalized,
      timestamp: new Date().toISOString()
    });

    // If dealer was updated, broadcast dealer change to all clients in the sqid
    if (dealer_id !== undefined) {
      req.io?.to(`/sqid/${gameInfo.sqid_id}`).emit('dealer_changed', {
        game_id: gameInfo.id,
        dealer_id: updatedGame.dealer_id,
        sqid: gameInfo.sqid_id,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(createResponse(true, updatedGame));
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/:sqid/games/:gameId - Delete game (only if not finalized)
 */
router.delete('/:gameId', validateGameAccess, async (req, res, next) => {
  try {
    const { gameInfo } = req;
    
    if (gameInfo.finalized) {
      throw new ConflictError('Cannot delete finalized games');
    }
    
    // Delete game (cascade will handle stats)
    await db.run('DELETE FROM games WHERE id = ?', [gameInfo.id]);
    
    res.json(createResponse(true, { message: 'Game deleted successfully' }));
  } catch (error) {
    next(error);
  }
});

/**
 * Helper function to create or update rivalry
 */
async function createOrUpdateRivalry(db, sqidId, gameTypeId, playerIds) {
  // Sort player IDs for consistent rivalry identification
  const sortedPlayerIds = [...playerIds].sort();
  // Find rivalry by sqid and exact set of players (no game_type_id in rivalries)
  let rivalry = await db.get(`
    SELECT r.id
    FROM rivalries r
    JOIN rivalry_players rp ON r.id = rp.rivalry_id
    WHERE r.sqid_id = ?
    AND rp.player_id IN (${sortedPlayerIds.map(() => '?').join(',')})
    GROUP BY r.id
    HAVING COUNT(rp.player_id) = ?
    AND (
      SELECT COUNT(*) FROM rivalry_players WHERE rivalry_id = r.id
    ) = ?
  `, [sqidId, ...sortedPlayerIds, sortedPlayerIds.length, sortedPlayerIds.length]);
  if (!rivalry) {
    // Create new rivalry
    const rivalryId = generateUUID();
    await db.run(
      'INSERT INTO rivalries (id, sqid_id, created_at) VALUES (?, ?, ?)',
      [rivalryId, sqidId, new Date().toISOString()]
    );
    // Add players to rivalry
    for (const playerId of playerIds) {
      await db.run(
        'INSERT INTO rivalry_players (rivalry_id, player_id) VALUES (?, ?)',
        [rivalryId, playerId]
      );
    }
    // Add game type to rivalry_game_types
    await db.run(
      'INSERT INTO rivalry_game_types (rivalry_id, game_type_id) VALUES (?, ?)',
      [rivalryId, gameTypeId]
    );
    // No longer initialize rivalry_stats. All stats aggregation uses rivalry_player_stats and games.
    return rivalryId;
  } else {
    // If rivalry exists, ensure game type is linked
    const exists = await db.get(
      'SELECT 1 FROM rivalry_game_types WHERE rivalry_id = ? AND game_type_id = ?',
      [rivalry.id, gameTypeId]
    );
    if (!exists) {
      await db.run(
        'INSERT INTO rivalry_game_types (rivalry_id, game_type_id) VALUES (?, ?)',
        [rivalry.id, gameTypeId]
      );
      // No longer initialize rivalry_stats for this game type.
    }
    return rivalry.id;
  }
}

/**
 * Helper function to update rivalry statistics
 */
async function updateRivalryStats(sqidId, gameTypeId, gameId) {
  // Get game type information to understand win/lose condition
  const gameType = await db.get(`
    SELECT is_win_condition FROM game_types WHERE id = ?
  `, [gameTypeId]);
  
  if (!gameType) return;
  
  const isWinCondition = gameType.is_win_condition;

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
  // Get all finalized games for this rivalry and game type
  // Fixed: Use g.rivalry_id to ensure we only include games from this specific rivalry
  const games = await db.query(`
    SELECT 
      g.id,
      g.winner_id,
      MAX(s.score) - MIN(s.score) as score_difference,
      s.player_id,
      s.score
    FROM games g
    JOIN stats s ON g.id = s.game_id
    WHERE g.rivalry_id = ? AND g.game_type_id = ? AND g.finalized = true
    ORDER BY g.started_at ASC
  `, [rivalry.id, gameTypeId]);

  // No longer update rivalry_stats. All stats aggregation uses rivalry_player_stats and games.

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
      
      const otherScores = scores.filter(s => s.player_id !== playerId).map(s => s.score);
      let margin = 0;
      
      if (game.winner_id === playerId) {
        wins++;
        
        // For win margin, we always want the margin against the next closest score
        // regardless of win/lose condition type
        if (isWinCondition) {
          // Win condition (higher score wins): next closest is the highest of the remaining scores
          const nextClosest = otherScores.length > 0 ? Math.max(...otherScores) : 0;
          margin = playerScore - nextClosest;
        } else {
          // Lose condition (lower score wins): next closest is the lowest of the remaining scores  
          const nextClosest = otherScores.length > 0 ? Math.min(...otherScores) : 0;
          margin = nextClosest - playerScore;
        }
        
        winMargins.push(Math.abs(margin)); // Store as positive value
        last10Results += 'W';
      } else {
        losses++;
        
        if (isWinCondition) {
          // Win condition: loss margin = winner_score - loser_score
          margin = winnerScore - playerScore;
        } else {
          // Lose condition: loss margin = loser_score - winner_score
          margin = playerScore - winnerScore;
        }
        
        lossMargins.push(Math.abs(margin)); // Store as positive value
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

export default router;
