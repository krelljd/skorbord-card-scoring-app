import express from 'express';
import db from '../db/database.js';
import { ValidationError, ConflictError } from '../middleware/errorHandler.js';
import { isValidId } from '../utils/helpers.js';

const router = express.Router({ mergeParams: true });

/**
 * POST /api/:sqid/game_types/:gameTypeId/favorite - Add favorite
 * Accepts both /favorite and /favorite/ for robustness
 */
router.post(['/', ''], async (req, res, next) => {
  try {
    const { sqid, gameTypeId } = req.params;
    if (!isValidId(sqid) || !isValidId(gameTypeId)) {
      throw new ValidationError('Invalid sqid or gameTypeId');
    }
    // Check if already favorited
    const existing = await db.get(
      'SELECT * FROM favorites WHERE sqid_id = ? AND game_type_id = ?',
      [sqid, gameTypeId]
    );
    if (existing) {
      throw new ConflictError('Already favorited');
    }
    await db.run(
      'INSERT INTO favorites (sqid_id, game_type_id, created_at) VALUES (?, ?, ?)',
      [sqid, gameTypeId, new Date().toISOString()]
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/:sqid/game_types/:gameTypeId/favorite - Remove favorite
 * Accepts both /favorite and /favorite/ for robustness
 */
router.delete(['/', ''], async (req, res, next) => {
  try {
    const { sqid, gameTypeId } = req.params;
    if (!isValidId(sqid) || !isValidId(gameTypeId)) {
      throw new ValidationError('Invalid sqid or gameTypeId');
    }
    await db.run(
      'DELETE FROM favorites WHERE sqid_id = ? AND game_type_id = ?',
      [sqid, gameTypeId]
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
