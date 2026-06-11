import express from 'express';
import { 
  validateCreateGameType 
} from '../middleware/validation.js';
import { createResponse, generateUUID } from '../utils/helpers.js';
import { ConflictError } from '../middleware/errorHandler.js';
import db from '../db/database.js';

const router = express.Router();

/**
 * GET /api/game_types - List all game types
 */
router.get('/', async (req, res, next) => {
  try {
    // Accept sqid as a query param
    const { sqid } = req.query;
    let gameTypes;
    if (sqid) {
      gameTypes = await db.query(`
        SELECT 
          gt.*,
          COUNT(g.id) as games_played,
          CASE WHEN f.sqid_id IS NOT NULL THEN 1 ELSE 0 END as is_favorited
        FROM game_types gt
        LEFT JOIN games g ON gt.id = g.game_type_id
        LEFT JOIN favorites f ON gt.id = f.game_type_id AND f.sqid_id = ?
        GROUP BY gt.id, gt.name, gt.description, gt.win_condition, gt.loss_condition, gt.is_win_condition, gt.created_at, f.sqid_id
        ORDER BY gt.name ASC
      `, [sqid]);
      // Convert is_favorited to boolean
      gameTypes = gameTypes.map(gt => ({ ...gt, is_favorited: !!gt.is_favorited }));
    } else {
      gameTypes = await db.query(`
        SELECT 
          gt.*,
          COUNT(g.id) as games_played
        FROM game_types gt
        LEFT JOIN games g ON gt.id = g.game_type_id
        GROUP BY gt.id, gt.name, gt.description, gt.win_condition, gt.loss_condition, gt.is_win_condition, gt.created_at
        ORDER BY gt.name ASC
      `);
    }
    res.json(createResponse(true, gameTypes));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/game_types/:id - Get specific game type
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const gameType = await db.get(
      'SELECT * FROM game_types WHERE id = ?',
      [id]
    );
    
    if (!gameType) {
      return res.status(404).json(createResponse(false, null, 'Game type not found'));
    }
    
    res.json(createResponse(true, gameType));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/game_types - Add new game type (admin only)
 */
router.post('/', validateCreateGameType, async (req, res, next) => {
  try {
    const { 
      name, 
      description = '', 
      win_condition = 100, 
      loss_condition = 0, 
      is_win_condition = true 
    } = req.body;
    
    // Check if game type name already exists
    const existingGameType = await db.get(
      'SELECT id FROM game_types WHERE name = ?',
      [name]
    );
    
    if (existingGameType) {
      throw new ConflictError('Game type name already exists');
    }
    
    // Create new game type
    const gameTypeId = generateUUID();
    const gameTypeData = {
      id: gameTypeId,
      name: name,
      description: description,
      win_condition: win_condition,
      loss_condition: loss_condition,
      is_win_condition: is_win_condition,
      created_at: new Date().toISOString()
    };
    
    await db.run(
      'INSERT INTO game_types (id, name, description, win_condition, loss_condition, is_win_condition, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        gameTypeData.id,
        gameTypeData.name,
        gameTypeData.description,
        gameTypeData.win_condition,
        gameTypeData.loss_condition,
        gameTypeData.is_win_condition,
        gameTypeData.created_at
      ]
    );
    
    res.status(201).json(createResponse(true, gameTypeData));
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/game_types/:id - Update game type (admin only)
 */
router.put('/:id', validateCreateGameType, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      win_condition, 
      loss_condition, 
      is_win_condition 
    } = req.body;
    
    // Check if game type exists
    const existingGameType = await db.get(
      'SELECT * FROM game_types WHERE id = ?',
      [id]
    );
    
    if (!existingGameType) {
      return res.status(404).json(createResponse(false, null, 'Game type not found'));
    }
    
    // Check if new name conflicts with another game type
    if (name && name !== existingGameType.name) {
      const nameConflict = await db.get(
        'SELECT id FROM game_types WHERE name = ? AND id != ?',
        [name, id]
      );
      
      if (nameConflict) {
        throw new ConflictError('Game type name already exists');
      }
    }
    
    // Update game type
    const updatedData = {
      name: name || existingGameType.name,
      description: description !== undefined ? description : existingGameType.description,
      win_condition: win_condition !== undefined ? win_condition : existingGameType.win_condition,
      loss_condition: loss_condition !== undefined ? loss_condition : existingGameType.loss_condition,
      is_win_condition: is_win_condition !== undefined ? is_win_condition : existingGameType.is_win_condition
    };
    
    await db.run(
      'UPDATE game_types SET name = ?, description = ?, win_condition = ?, loss_condition = ?, is_win_condition = ? WHERE id = ?',
      [
        updatedData.name,
        updatedData.description,
        updatedData.win_condition,
        updatedData.loss_condition,
        updatedData.is_win_condition,
        id
      ]
    );
    
    const updated = await db.get('SELECT * FROM game_types WHERE id = ?', [id]);
    
    res.json(createResponse(true, updated));
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/game_types/:id - Remove game type (admin only)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if game type exists
    const gameType = await db.get(
      'SELECT * FROM game_types WHERE id = ?',
      [id]
    );
    
    if (!gameType) {
      return res.status(404).json(createResponse(false, null, 'Game type not found'));
    }
    
    // Check if there are any games using this type
    const gamesUsingType = await db.get(
      'SELECT COUNT(*) as count FROM games WHERE game_type_id = ?',
      [id]
    );
    
    if (gamesUsingType.count > 0) {
      throw new ConflictError('Cannot delete game type that is being used in games');
    }
    
    // Delete game type
    await db.run('DELETE FROM game_types WHERE id = ?', [id]);
    
    res.json(createResponse(true, { message: 'Game type deleted successfully' }));
  } catch (error) {
    next(error);
  }
});

export default router;
