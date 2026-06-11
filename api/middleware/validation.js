import { body, param, query, validationResult } from 'express-validator';
import { isValidId, isValidScore, isValidPlayerCount, sanitizeName } from '../utils/helpers.js';
import { ValidationError, NotFoundError } from './errorHandler.js';
import db from '../db/database.js';

/**
 * Middleware to validate Sqid exists and is accessible
 */
export async function validateSquid(req, res, next) {
  try {
    const { sqid } = req.params;
    
    if (!isValidId(sqid)) {
      throw new ValidationError('Invalid Sqid format');
    }

    // Check if Sqid exists
    const sqidRecord = await db.get(
      'SELECT id, name, created_at FROM sqids WHERE id = ?',[sqid]
    );

    if (!sqidRecord) {
      throw new NotFoundError('Sqid not found');
    }

    // Add sqid info to request
    req.sqidInfo = sqidRecord;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Validation middleware for creating a Sqid
 */
export const validateCreateSquid = [
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 64 })
    .trim()
    .customSanitizer(sanitizeName),
  handleValidationErrors
];

/**
 * Validation middleware for creating a player
 */
export const validateCreatePlayer = [
  body('name')
    .isString()
    .isLength({ min: 1, max: 64 })
    .trim()
    .customSanitizer(sanitizeName)
    .custom((value) => {
      if (!value || value.length === 0) {
        throw new Error('Player name is required');
      }
      return true;
    }),
  handleValidationErrors
];

/**
 * Validation middleware for creating a game
 */
export const validateCreateGame = [
  body('game_type_id')
    .isString()
    .custom((value) => {
      if (!isValidId(value)) {
        throw new Error('Invalid game type ID format');
      }
      return true;
    }),
  body().custom((body) => {
    // Accept either player_ids (array of IDs) or player_names (array of strings)
    if (!Array.isArray(body.player_ids) && !Array.isArray(body.player_names)) {
      throw new Error('Either player_ids or player_names is required');
    }
    const arr = body.player_ids || body.player_names;
    if (!Array.isArray(arr) || arr.length < 2) {
      throw new Error('At least 2 players are required');
    }
    if (body.player_ids) {
      // Validate each player ID
      for (const playerId of body.player_ids) {
        if (!isValidId(playerId)) {
          throw new Error('Invalid player ID format');
        }
      }
      if (new Set(body.player_ids).size !== body.player_ids.length) {
        throw new Error('Duplicate player IDs are not allowed');
      }
    }
    if (body.player_names) {
      for (const name of body.player_names) {
        if (typeof name !== 'string') {
          throw new Error('Player names must be strings');
        }
      }
      // Allow empty names, but still check for duplicates (ignore case/whitespace)
      const trimmedNames = body.player_names.map(n => n.trim().toLowerCase());
      if (new Set(trimmedNames).size !== body.player_names.length) {
        throw new Error('Duplicate player names are not allowed');
      }
    }
    return true;
  }),
  body('win_condition_type')
    .optional()
    .isString()
    .isIn(['win', 'lose'])
    .withMessage('Win condition type must be either "win" or "lose"'),
  body('win_condition_value')
    .optional()
    .isInt({ min: 1, max: 999 })
    .withMessage('Win condition value must be between 1 and 999'),
  handleValidationErrors
];

/**
 * Validation middleware for updating game stats
 */
export const validateUpdateStats = [
  body('stats')
    .isArray({ min: 1 })
    .custom((stats) => {
      for (const stat of stats) {
        if (!stat.player_id || !isValidId(stat.player_id)) {
          throw new Error('Invalid player ID in stats');
        }
        if (!isValidScore(stat.score)) {
          throw new Error(`Score must be between ${process.env.MIN_SCORE || -999} and ${process.env.MAX_SCORE || 999}`);
        }
      }
      return true;
    }),
  handleValidationErrors
];

/**
 * Validation middleware for updating a game
 */
export const validateUpdateGame = [
  body('ended_at')
    .optional()
    .isISO8601()
    .toDate(),
  body('finalized')
    .optional()
    .isBoolean(),
  body('winner_id')
    .optional()
    .custom((value) => {
      if (value && !isValidId(value)) {
        throw new Error('Invalid winner ID format');
      }
      return true;
    }),
  body('dealer_id')
    .optional()
    .custom((value) => {
      if (value && !isValidId(value)) {
        throw new Error('Invalid dealer ID format');
      }
      return true;
    }),
  handleValidationErrors
];

/**
 * Validation middleware for creating a game type
 */
export const validateCreateGameType = [
  body('name')
    .isString()
    .isLength({ min: 1, max: 64 })
    .trim()
    .customSanitizer(sanitizeName),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 256 })
    .trim(),
  body('win_condition')
    .optional()
    .isInt({ min: -999, max: 999 }),
  body('loss_condition')
    .optional()
    .isInt({ min: -999, max: 999 }),
  body('is_win_condition')
    .optional()
    .isBoolean(),
  handleValidationErrors
];

/**
 * Validation middleware for route parameters
 */
export const validateIdParam = (paramName) => [
  param(paramName)
    .custom((value) => {
      if (!isValidId(value)) {
        throw new Error(`Invalid ${paramName} format`);
      }
      return true;
    }),
  handleValidationErrors
];

/**
 * Validation middleware for pagination query parameters
 */
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt(),
  query('sort')
    .optional()
    .isString()
    .isIn(['created_at', 'updated_at', 'name', 'score']),
  query('order')
    .optional()
    .isString()
    .isIn(['asc', 'desc']),
  handleValidationErrors
];

/**
 * Handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg).join(', ');
    throw new ValidationError(errorMessages);
  }
  
  next();
}

/**
 * Middleware to validate game exists and belongs to Sqid
 */
export async function validateGameAccess(req, res, next) {
  try {
    const { sqid, gameId } = req.params;
    
    if (!isValidId(gameId)) {
      throw new ValidationError('Invalid game ID format');
    }

    const game = await db.get(
      'SELECT * FROM games WHERE id = ? AND sqid_id = ?',
      [gameId, sqid]
    );

    if (!game) {
      throw new NotFoundError('Game not found');
    }

    req.gameInfo = game;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to validate player exists and belongs to Sqid
 */
export async function validatePlayerAccess(req, res, next) {
  try {
    const { sqid, playerId } = req.params;
    
    if (!isValidId(playerId)) {
      throw new ValidationError('Invalid player ID format');
    }

    const player = await db.get(
      'SELECT * FROM players WHERE id = ? AND sqid_id = ?',
      [playerId, sqid]
    );

    if (!player) {
      throw new NotFoundError('Player not found');
    }

    req.playerInfo = player;
    next();
  } catch (error) {
    next(error);
  }
}
