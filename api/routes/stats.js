import express from 'express';
import {
  validateUpdateStats,
  validateGameAccess
} from '../middleware/validation.js';
import { createResponse } from '../utils/helpers.js';
import { addToDraft, getRoundState, loadStatsRows, setDraft } from '../services/rounds.js';
import { buildScoreUpdatePayload } from '../utils/scoreBroadcast.js';
import { ValidationError, ConflictError } from '../middleware/errorHandler.js';
import db from '../db/database.js';
import { createScoreRateLimiter } from '../middleware/scoreRateLimit.js';

const router = express.Router({ mergeParams: true });

// Per-sqid cap on score writes (in addition to the global per-IP limiter).
const scoreLimiter = createScoreRateLimiter({ capacity: 30, refillPerSec: 15 });

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
 * POST /api/:sqid/games/:gameId/stats - Add score deltas (kept for older clients).
 * Deltas go into the game's open round; use the /rounds routes for the round workflow.
 */
router.post('/', validateGameAccess, scoreLimiter.middleware, validateUpdateStats, async (req, res, next) => {
  try {
    const { sqid, gameId } = req.params;
    const { stats } = req.body;

    for (const stat of stats) {
      if (!Number.isInteger(stat.score)) {
        throw new ValidationError('Score delta must be an integer');
      }
    }

    await addToDraft(db, {
      gameId,
      entries: stats.map((stat) => ({ playerId: stat.player_id, delta: stat.score })),
      origin: req.body.socketId || null
    });

    const allStats = await loadStatsRows(db, gameId);
    const state = await getRoundState(db, gameId);

    // For tally: the last changed player and delta (single-tap case)
    const single = stats.length === 1 ? stats[0] : null;

    req.io?.to(`/sqid/${sqid}`).emit('round_update', {
      sqid,
      gameId,
      action: 'tap',
      state,
      originSocketId: req.body.socketId || null,
      timestamp: new Date().toISOString()
    });
    req.io?.to(`/sqid/${sqid}`).emit('score_update', buildScoreUpdatePayload({
      sqid,
      gameId,
      stats: allStats,
      playerId: single ? single.player_id : null,
      change: single ? single.score : null,
      winnerId: state.game.winner_id,
      originSocketId: req.body.socketId || null
    }));

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
 * PUT /api/:sqid/games/:gameId/stats/:playerId - Set a player's total (kept for older clients).
 * The open round's draft is adjusted so the player's total equals the given score.
 */
router.put('/:playerId', validateGameAccess, async (req, res, next) => {
  try {
    const { sqid, gameId, playerId } = req.params;
    const { score } = req.body;

    if (!Number.isInteger(score)) {
      throw new ValidationError('Score must be an integer');
    }

    const minScore = parseInt(process.env.MIN_SCORE) || -999;
    const maxScore = parseInt(process.env.MAX_SCORE) || 999;
    if (score < minScore || score > maxScore) {
      throw new ValidationError(`Score must be between ${minScore} and ${maxScore}`);
    }

    await setDraft(db, { gameId, playerId, total: score, origin: req.body.socketId || null });

    const updatedStat = await db.get(`
      SELECT
        s.*,
        p.name as player_name,
        p.color
      FROM stats s
      JOIN players p ON s.player_id = p.id
      WHERE s.game_id = ? AND s.player_id = ?
    `, [gameId, playerId]);

    const allStats = await loadStatsRows(db, gameId);
    const state = await getRoundState(db, gameId);

    req.io?.to(`/sqid/${sqid}`).emit('round_update', {
      sqid,
      gameId,
      action: 'set',
      state,
      originSocketId: req.body.socketId || null,
      timestamp: new Date().toISOString()
    });
    req.io?.to(`/sqid/${sqid}`).emit('score_update', buildScoreUpdatePayload({
      sqid,
      gameId,
      stats: allStats,
      playerId,
      change: null, // absolute set, not a delta
      winnerId: state.game.winner_id,
      originSocketId: req.body.socketId || null
    }));

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
