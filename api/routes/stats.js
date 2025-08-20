import express from 'express';
import { 
  validateUpdateStats,
  validateGameAccess 
} from '../middleware/validation.js';
import { createResponse, generateUUID, determineWinner } from '../utils/helpers.js';
import { ValidationError, ConflictError } from '../middleware/errorHandler.js';
import db from '../db/database.js';

const router = express.Router({ mergeParams: true });

/**
 * GET /api/:sqid/games/:gameId/stats - Get stats for a game
 */
router.get('/', validateGameAccess, async (req, res, next) => {
  try {
    const { gameId } = req.params;
    
    const stats = await db.query(`
      SELECT 
        s.*,
        p.name as player_name,
        p.color
      FROM stats s
      JOIN players p ON s.player_id = p.id
      WHERE s.game_id = ?
      ORDER BY COALESCE(s.player_order, 999), s.created_at ASC
    `, [gameId]);
    
    res.json(createResponse(true, stats));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/:sqid/games/:gameId/stats - Add/update player stats
 */
router.post('/', validateGameAccess, validateUpdateStats, async (req, res, next) => {
  try {
    const { sqid, gameId } = req.params;
    const { stats } = req.body;
    const { gameInfo } = req;
    
    if (gameInfo.finalized) {
      throw new ConflictError('Cannot update stats for finalized games');
    }
    
    // Get game type for winner determination
    const gameType = await db.get(
      'SELECT * FROM game_types WHERE id = ?',
      [gameInfo.game_type_id]
    );
    
    // Validate all players belong to this game
    const gamePlayerIds = await db.query(
      'SELECT player_id FROM stats WHERE game_id = ?',
      [gameId]
    );
    
    const validPlayerIds = new Set(gamePlayerIds.map(p => p.player_id));
    
    for (const stat of stats) {
      if (!validPlayerIds.has(stat.player_id)) {
        throw new ValidationError('Player not found in this game');
      }
      
      if (!Number.isInteger(stat.score)) {
        throw new ValidationError('Score delta must be an integer');
      }
    }
    
    const minScore = parseInt(process.env.MIN_SCORE) || -999;
    const maxScore = parseInt(process.env.MAX_SCORE) || 999;
    
    // Increment the player's score by the delta provided
    await db.transaction(async (db) => {
      const timestamp = new Date().toISOString();
      for (const stat of stats) {
        // Get current score
        const current = await db.get(
          'SELECT score FROM stats WHERE game_id = ? AND player_id = ?',
          [gameId, stat.player_id]
        );
        if (!current) throw new ValidationError('Player stat not found');
        const newScore = current.score + stat.score; // stat.score is the delta
        
        // Validate score bounds to match database constraint
        if (newScore < minScore || newScore > maxScore) {
          throw new ValidationError(`Score must be between ${minScore} and ${maxScore}. Attempted score: ${newScore}`);
        }
        
        await db.run(
          'UPDATE stats SET score = ?, updated_at = ? WHERE game_id = ? AND player_id = ?',
          [newScore, timestamp, gameId, stat.player_id]
        );
      }
      // Check if game should be auto-completed
      const allPlayerScores = await db.query(
        'SELECT player_id, score FROM stats WHERE game_id = ?',
        [gameId]
      );
      const winnerId = determineWinner(gameType, allPlayerScores);
      if (winnerId && !gameInfo.winner_id) {
        await db.run(
          'UPDATE games SET winner_id = ? WHERE id = ?',
          [winnerId, gameId]
        );
      }
    });

    // After update, fetch all player stats for this game
    const allStats = await db.query(
      'SELECT s.*, p.name as player_name, p.color FROM stats s JOIN players p ON s.player_id = p.id WHERE s.game_id = ? ORDER BY s.created_at ASC',
      [gameId]
    );

    // For tally: get the last changed player and delta
    let player_id = null;
    let score_change = null;
    if (stats && stats.length === 1) {
      player_id = stats[0].player_id;
      score_change = stats[0].score;
    }

    // Broadcast score update with player_id and score_change for tally
    req.io?.to(`/sqid/${sqid}`).emit('score_update', {
      type: 'score_update',
      game_id: gameId,
      sqid_id: sqid,
      stats: allStats,
      player_id,
      score_change,
      timestamp: new Date().toISOString()
    });

    res.json(createResponse(true, allStats));
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/:sqid/games/:gameId/stats/order - Update player order for a game
 */
router.put('/order', validateGameAccess, async (req, res, next) => {
  try {
    const { sqid, gameId } = req.params;
    const { playerOrder } = req.body; // Array of player IDs in desired order
    const { gameInfo } = req;
    
    if (gameInfo.finalized) {
      throw new ConflictError('Cannot update player order for finalized games');
    }
    
    if (!Array.isArray(playerOrder) || playerOrder.length === 0) {
      throw new ValidationError('playerOrder must be a non-empty array of player IDs');
    }
    
    // Verify all players exist in this game
    const existingPlayerIds = await db.query(
      'SELECT player_id FROM stats WHERE game_id = ?',
      [gameId]
    );
    
    const validPlayerIds = new Set(existingPlayerIds.map(p => p.player_id));
    
    // Check that all provided player IDs exist in the game
    for (const playerId of playerOrder) {
      if (!validPlayerIds.has(playerId)) {
        throw new ValidationError(`Player ${playerId} not found in this game`);
      }
    }
    
    // Check that all players in the game are included in the new order
    if (playerOrder.length !== existingPlayerIds.length) {
      throw new ValidationError('All players in the game must be included in the new order');
    }
    
    // Update player order in the database
    await db.transaction(async (db) => {
      for (let i = 0; i < playerOrder.length; i++) {
        await db.run(
          'UPDATE stats SET player_order = ? WHERE game_id = ? AND player_id = ?',
          [i + 1, gameId, playerOrder[i]]
        );
      }
    });
    
    // Get updated stats with new order
    const updatedStats = await db.query(`
      SELECT 
        s.*,
        p.name as player_name,
        p.color
      FROM stats s
      JOIN players p ON s.player_id = p.id
      WHERE s.game_id = ?
      ORDER BY COALESCE(s.player_order, 999), s.created_at ASC
    `, [gameId]);
    
    // Broadcast player order update to all clients
    req.io?.to(`/sqid/${sqid}`).emit('player_order_updated', {
      type: 'player_order_updated',
      game_id: gameId,
      sqid_id: sqid,
      stats: updatedStats,
      timestamp: new Date().toISOString()
    });
    
    res.json(createResponse(true, updatedStats));
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/:sqid/games/:gameId/stats/:playerId - Update specific player's stat
 */
router.put('/:playerId', validateGameAccess, async (req, res, next) => {
  try {
    const { sqid, gameId, playerId } = req.params;
    const { score } = req.body;
    const { gameInfo } = req;
    
    if (gameInfo.finalized) {
      throw new ConflictError('Cannot update stats for finalized games');
    }
    
    if (!Number.isInteger(score)) {
      throw new ValidationError('Score must be an integer');
    }
    
    const minScore = parseInt(process.env.MIN_SCORE) || -999;
    const maxScore = parseInt(process.env.MAX_SCORE) || 999;
    
    if (score < minScore || score > maxScore) {
      throw new ValidationError(`Score must be between ${minScore} and ${maxScore}`);
    }
    
    // Verify player is in this game
    const existingStat = await db.get(
      'SELECT * FROM stats WHERE game_id = ? AND player_id = ?',
      [gameId, playerId]
    );
    
    if (!existingStat) {
      throw new ValidationError('Player not found in this game');
    }
    
    // Update score
    const timestamp = new Date().toISOString();
    await db.run(
      'UPDATE stats SET score = ?, updated_at = ? WHERE game_id = ? AND player_id = ?',
      [score, timestamp, gameId, playerId]
    );
    
    // Get updated stat with player name
    const updatedStat = await db.get(`
      SELECT 
        s.*,
        p.name as player_name,
        p.color
      FROM stats s
      JOIN players p ON s.player_id = p.id
      WHERE s.game_id = ? AND s.player_id = ?
    `, [gameId, playerId]);
    
    // Check for winner
    const gameType = await db.get(
      'SELECT * FROM game_types WHERE id = ?',
      [gameInfo.game_type_id]
    );
    
    const allPlayerScores = await db.query(
      'SELECT player_id, score FROM stats WHERE game_id = ?',
      [gameId]
    );
    
    const winnerId = determineWinner(gameType, allPlayerScores);
    
    if (winnerId && !gameInfo.winner_id) {
      await db.run(
        'UPDATE games SET winner_id = ? WHERE id = ?',
        [winnerId, gameId]
      );
    }
    
    // Broadcast individual score update
    req.io?.to(`/sqid/${sqid}`).emit('score_update', {
      type: 'score_update',
      gameId: gameId,
      sqidId: sqid,
      playerId: playerId,
      score: score,
      winnerId: winnerId,
      timestamp: timestamp
    });
    
    res.json(createResponse(true, updatedStat));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/:sqid/games/:gameId/stats/:playerId - Get specific player's stat
 */
router.get('/:playerId', validateGameAccess, async (req, res, next) => {
  try {
    const { gameId, playerId } = req.params;
    
    const stat = await db.get(`
      SELECT 
        s.*,
        p.name as player_name
      FROM stats s
      JOIN players p ON s.player_id = p.id
      WHERE s.game_id = ? AND s.player_id = ?
    `, [gameId, playerId]);
    
    if (!stat) {
      throw new ValidationError('Player not found in this game');
    }
    
    res.json(createResponse(true, stat));
  } catch (error) {
    next(error);
  }
});

export default router;
