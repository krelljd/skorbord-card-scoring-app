import express from 'express';
import { 
  validateCreateSquid,
  validateIdParam 
} from '../middleware/validation.js';
import { createResponse, generateShortId, generateUUID } from '../utils/helpers.js';
import { NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import db from '../db/database.js';

const router = express.Router({ mergeParams: true });

/**
 * GET /api/:sqid - Get Sqid details
 */
router.get('/', async (req, res, next) => {
  try {
    const { sqidInfo } = req;
    
    // Get additional statistics
    const [playerCount, gameCount] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM players WHERE sqid_id = ?', [sqidInfo.id]),
      db.get('SELECT COUNT(*) as count FROM games WHERE sqid_id = ?', [sqidInfo.id])
    ]);
    
    const response = {
      ...sqidInfo,
      player_count: playerCount.count,
      game_count: gameCount.count
    };
    
    res.json(createResponse(true, response));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/:sqid - Create new Sqid (if it doesn't exist)
 */
router.post('/', validateCreateSquid, async (req, res, next) => {
  try {
    const { sqid } = req.params;
    const { name } = req.body;
    
    // Check if Sqid already exists
    const existingSquid = await db.get(
      'SELECT id FROM sqids WHERE id = ?',
      [sqid]
    );
    
    if (existingSquid) {
      throw new ConflictError('Sqid already exists');
    }
    
    // Create new Sqid
    const sqidName = name || `Game ${sqid}`;
    const sqidData = {
      id: sqid,
      name: sqidName,
      created_at: new Date().toISOString()
    };
    
    await db.run(
      'INSERT INTO sqids (id, name, created_at) VALUES (?, ?, ?)',
      [sqidData.id, sqidData.name, sqidData.created_at]
    );
    
    res.status(201).json(createResponse(true, sqidData));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/:sqid/players - Get all players in Sqid
 */
router.get('/players', async (req, res, next) => {
  try {
    const { sqid } = req.params;
    
    const players = await db.query(
      'SELECT * FROM players WHERE sqid_id = ? ORDER BY created_at ASC',
      [sqid]
    );
    
    res.json(createResponse(true, players));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/:sqid/games - Get all games in Sqid
 */
router.get('/games', async (req, res, next) => {
  try {
    const { sqid } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const games = await db.query(`
      SELECT 
        g.*,
        gt.name as game_type_name,
        gt.description as game_type_description,
        p.name as winner_name
      FROM games g
      LEFT JOIN game_types gt ON g.game_type_id = gt.id
      LEFT JOIN players p ON g.winner_id = p.id
      WHERE g.sqid_id = ?
      ORDER BY g.started_at DESC
      LIMIT ? OFFSET ?
    `, [sqid, parseInt(limit), parseInt(offset)]);
    
    res.json(createResponse(true, games));
  } catch (error) {
    next(error);
  }
});

export default router;

