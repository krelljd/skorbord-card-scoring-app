import express from 'express';
import { createResponse } from '../utils/helpers.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import db from '../db/database.js';
import crypto from 'crypto';

const router = express.Router({ mergeParams: true });

/**
* GET /api/:sqid/rivalries - Get all rivalries in Sqid
*
* Returns all rivalries for the given sqid, with stats aggregated per game type for each rivalry.
*
* Response format:
* [
*   {
*     id: string,
*     created_at: string,
*     players: [{ id, name }],
*     player_names: [string],
*     game_type_stats: [
*       {
*         game_type_id: string,
*         game_type_name: string,
*         total_games: number,
*         min_win_margin: number,
*         max_win_margin: number,
*         min_loss_margin: number,
*         max_loss_margin: number,
*         last_10_results: string,
*         updated_at: string
*       }
*     ]
*   },
*   ...
* ]
 */
router.get('/', async (req, res, next) => {
  try {
    const { sqid } = req.params;
    // Get all rivalries for this sqid, ordered by total games played (most to least)
    const rivalries = await db.query(`
      SELECT r.id, r.created_at, COUNT(g.id) as total_games
      FROM rivalries r
      LEFT JOIN games g ON r.id = g.rivalry_id AND g.finalized = true
      WHERE r.sqid_id = ?
      GROUP BY r.id, r.created_at
      ORDER BY total_games DESC, r.created_at DESC
    `, [sqid]);

    for (const rivalry of rivalries) {
      // Get players in this rivalry
      const players = await db.query(`
        SELECT p.id, p.name
        FROM rivalry_players rp
        JOIN players p ON rp.player_id = p.id
        WHERE rp.rivalry_id = ?
        ORDER BY p.name ASC
      `, [rivalry.id]);
      rivalry.players = players;
      rivalry.player_names = players.map(p => p.name);

      // Get all game types played by this rivalry
      const gameTypes = await db.query(`
        SELECT gt.id, gt.name
        FROM rivalry_game_types rgt
        JOIN game_types gt ON rgt.game_type_id = gt.id
        WHERE rgt.rivalry_id = ?
        ORDER BY gt.name ASC
      `, [rivalry.id]);
      rivalry.game_types = gameTypes;

      // Remove aggregate stats - only per-player stats are tracked
      rivalry.game_type_stats = [];
    }
    // Return array of rivalries
    res.json(createResponse(true, rivalries));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/:sqid/rivalries/:rivalryId - Get rivalry details
 */
router.get('/:rivalryId', async (req, res, next) => {
  try {
    const { sqid, rivalryId } = req.params;
    
    // Get rivalry base info
    const rivalry = await db.get(`
      SELECT * FROM rivalries WHERE id = ? AND sqid_id = ?
    `, [rivalryId, sqid]);

    if (!rivalry) {
      throw new NotFoundError('Rivalry not found');
    }

    // Get players in this rivalry
    const players = await db.query(`
      SELECT p.id, p.name
      FROM rivalry_players rp
      JOIN players p ON rp.player_id = p.id
      WHERE rp.rivalry_id = ?
      ORDER BY p.name ASC
    `, [rivalry.id]);
    rivalry.player_names = players.map(player => player.name);
    rivalry.players = players;


    // Get game types played by this rivalry (no aggregate stats)
    const gameTypeStats = await db.query(`
      SELECT 
        gt.id as game_type_id,
        gt.name as game_type_name,
        gt.is_win_condition
      FROM game_types gt
      WHERE gt.id IN (SELECT game_type_id FROM rivalry_game_types WHERE rivalry_id = ?)
      ORDER BY gt.name ASC
    `, [rivalry.id]);
    rivalry.game_type_stats = gameTypeStats;

    // Get per-player stats for this rivalry and each game type
    const playerStats = {};
    for (const player of players) {
      playerStats[player.id] = {};
      for (const stat of gameTypeStats) {
        const pStat = await db.get(`
          SELECT 
            total_games, wins, losses, min_win_margin, max_win_margin, min_loss_margin, max_loss_margin, last_10_results, updated_at
          FROM rivalry_player_stats
          WHERE rivalry_id = ? AND player_id = ? AND game_type_id = ?
        `, [rivalry.id, player.id, stat.game_type_id]);
        playerStats[player.id][stat.game_type_id] = pStat || {
          total_games: 0,
          wins: 0,
          losses: 0,
          min_win_margin: null,
          max_win_margin: null,
          min_loss_margin: null,
          max_loss_margin: null,
          last_10_results: '',
          updated_at: null
        };
      }
    }
    rivalry.player_stats = playerStats;

    // Optionally, calculate aggregate wins/losses if needed
    // Removed aggregate rivalry stats. Only per-player stats are tracked and returned.

    // Get recent games for this rivalry
    const recentGames = await db.query(`
      SELECT 
        g.id,
        g.started_at,
        g.ended_at,
        g.finalized,
        g.winner_id,
        wp.name as winner_name,
        gt.name as game_type_name,
        g.ended_at as completed_at,
        (SELECT MAX(s.score) FROM stats s WHERE s.game_id = g.id) - (SELECT MIN(s.score) FROM stats s WHERE s.game_id = g.id) as score_difference
      FROM games g
      LEFT JOIN players wp ON g.winner_id = wp.id
      LEFT JOIN game_types gt ON g.game_type_id = gt.id
      WHERE g.rivalry_id = ? AND g.finalized = 1
      ORDER BY g.started_at DESC
      LIMIT 10
    `, [rivalry.id]);

    // Get player scores for each recent game and add is_winner field
    for (const game of recentGames) {
      const playerScores = await db.query(
        `SELECT s.player_id, p.name AS player_name, s.score
         FROM stats s
         JOIN players p ON s.player_id = p.id
         WHERE s.game_id = ?
         ORDER BY s.score DESC`,
        [game.id]
      );
      game.player_scores = playerScores.map(ps => ({
        ...ps,
        is_winner: ps.player_id === game.winner_id
      }));
    }
    rivalry.recent_games = recentGames;

    // Only send one response per request to avoid ERR_HTTP_HEADERS_SENT
    res.json(createResponse(true, rivalry));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/:sqid/rivalries/by-players - Get rivalry by player IDs
 */
router.get('/by-players', async (req, res, next) => {
  try {
    const { sqid } = req.params;
    const { player_ids, game_type_id } = req.query;
    
    if (!player_ids || !game_type_id) {
      throw new ValidationError('player_ids and game_type_id are required');
    }
    
    const playerIdArray = Array.isArray(player_ids) ? player_ids : [player_ids];
    
    if (playerIdArray.length < 2) {
      throw new ValidationError('At least 2 player IDs are required');
    }
    
    // Find rivalry that matches these players and is associated with the game type
    const placeholders = playerIdArray.map(() => '?').join(',');
    const rivalry = await db.get(`
      SELECT r.id
      FROM rivalries r
      JOIN rivalry_game_types rgt ON r.id = rgt.rivalry_id
      WHERE r.sqid_id = ? AND rgt.game_type_id = ?
      AND (
        SELECT COUNT(*) FROM rivalry_players rp
        WHERE rp.rivalry_id = r.id AND rp.player_id IN (${placeholders})
      ) = ?
      AND (
        SELECT COUNT(*) FROM rivalry_players rp
        WHERE rp.rivalry_id = r.id
      ) = ?
    `, [sqid, game_type_id, ...playerIdArray, playerIdArray.length, playerIdArray.length]);
    
    if (!rivalry) {
      return res.json(createResponse(true, null));
    }
    
    // Redirect to the full rivalry endpoint
    req.params.rivalryId = rivalry.id;
    return router.handle(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/:sqid/rivalries/:rivalryId/games - Get all games for a rivalry
 */
router.get('/:rivalryId/games', async (req, res, next) => {
  try {
    const { sqid, rivalryId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    // Get all games for this rivalry
    const games = await db.query(`
      SELECT 
        g.id,
        g.started_at,
        g.ended_at,
        g.finalized,
        g.winner_id,
        wp.name as winner_name,
        gt.name as game_type_name,
        g.ended_at as completed_at
      FROM games g
      LEFT JOIN players wp ON g.winner_id = wp.id
      LEFT JOIN game_types gt ON g.game_type_id = gt.id
      WHERE g.rivalry_id = ? AND g.sqid_id = ?
      ORDER BY g.started_at DESC
      LIMIT ? OFFSET ?
    `, [rivalryId, sqid, parseInt(limit), parseInt(offset)]);
    
    // Get player scores for each game
    for (const game of games) {
      const gameStats = await db.query(`
        SELECT 
          p.id as player_id,
          p.name as player_name,
          s.score
        FROM stats s
        JOIN players p ON s.player_id = p.id
        JOIN rivalry_players rp ON p.id = rp.player_id
        WHERE s.game_id = ? AND rp.rivalry_id = ?
        ORDER BY s.score DESC
      `, [game.id, rivalryId]);
      
      game.player_scores = gameStats;
    }
    
    res.json(createResponse(true, games));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/:sqid/rivalries - Create a new rivalry (unique player group)
 * Body: { player_ids: [string], game_type_ids?: [string] }
 */
router.post('/', async (req, res, next) => {
  try {
    const { sqid } = req.params;
    const { player_ids, game_type_ids = [] } = req.body;
    if (!Array.isArray(player_ids) || player_ids.length < 2) {
      return res.status(400).json(createResponse(false, null, 'At least 2 player_ids required'));
    }
    // Sort and join player_ids for uniqueness check
    const sortedPlayerIds = [...player_ids].sort();
    // Find existing rivalry with same player group in this sqid
    const existing = await db.get(`
      SELECT r.id FROM rivalries r
      WHERE r.sqid_id = ? AND r.id IN (
        SELECT rp.rivalry_id FROM rivalry_players rp
        WHERE rp.player_id IN (${sortedPlayerIds.map(() => '?').join(',')})
        GROUP BY rp.rivalry_id
        HAVING COUNT(*) = ?
      )
    `, [sqid, ...sortedPlayerIds, sortedPlayerIds.length]);
    if (existing) {
      return res.status(409).json(createResponse(false, null, 'Rivalry already exists for this player group'));
    }
    // Create new rivalry
    const rivalryId = crypto.randomUUID();
    await db.run(
      'INSERT INTO rivalries (id, sqid_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [rivalryId, sqid]
    );
    // Insert rivalry_players
    for (const pid of player_ids) {
      await db.run(
        'INSERT INTO rivalry_players (rivalry_id, player_id) VALUES (?, ?)',
        [rivalryId, pid]
      );
    }
    // Optionally associate game types
    for (const gtid of game_type_ids) {
      await db.run(
        'INSERT INTO rivalry_game_types (rivalry_id, game_type_id) VALUES (?, ?)',
        [rivalryId, gtid]
      );
    }
    // Return the created rivalry
    const rivalry = await db.get('SELECT * FROM rivalries WHERE id = ?', [rivalryId]);
    res.json(createResponse(true, rivalry));
  } catch (error) {
    next(error);
  }
});

export default router;
