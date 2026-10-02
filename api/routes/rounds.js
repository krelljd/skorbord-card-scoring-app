import express from 'express';
import { validateGameAccess } from '../middleware/validation.js';
import { createResponse, isValidId } from '../utils/helpers.js';
import { buildScoreUpdatePayload } from '../utils/scoreBroadcast.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { createScoreRateLimiter } from '../middleware/scoreRateLimit.js';
import {
  addToDraft,
  commitRound,
  editRound,
  getRoundState,
  loadStatsRows,
  setDraft,
  undoCommit
} from '../services/rounds.js';
import db from '../db/database.js';

const router = express.Router({ mergeParams: true });

const scoreLimiter = createScoreRateLimiter({ capacity: 30, refillPerSec: 15 });

function requirePlayerId(value) {
  if (!value || !isValidId(value)) throw new ValidationError('Invalid player ID');
  return value;
}

function optionalOpId(body) {
  const { opId } = body;
  if (opId === undefined || opId === null) return null;
  if (typeof opId !== 'string' || opId.length === 0 || opId.length > 100) {
    throw new ValidationError('opId must be a string of 1 to 100 characters');
  }
  return opId;
}

/**
 * Emits the authoritative round state to every device on the board. The older
 * score_update event is still sent so open tabs from before this change keep working.
 */
async function broadcast(req, { action, playerId = null, change = null }) {
  const { sqid, gameId } = req.params;
  const state = await getRoundState(db, gameId);
  const originSocketId = req.body?.socketId || null;

  req.io?.to(`/sqid/${sqid}`).emit('round_update', {
    sqid,
    gameId,
    action,
    state,
    originSocketId,
    timestamp: new Date().toISOString()
  });

  const stats = await loadStatsRows(db, gameId);
  req.io?.to(`/sqid/${sqid}`).emit('score_update', buildScoreUpdatePayload({
    sqid,
    gameId,
    stats,
    playerId,
    change,
    winnerId: state.game.winner_id,
    originSocketId
  }));

  return state;
}

function respond(res, state, result) {
  res.json(createResponse(true, { ...state, duplicate: Boolean(result?.duplicate) }));
}

/**
 * GET /api/:sqid/games/:gameId/rounds - Rounds, draft, totals, winner candidate
 */
router.get('/', validateGameAccess, async (req, res, next) => {
  try {
    res.json(createResponse(true, await getRoundState(db, req.params.gameId)));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /rounds/current/scores - Add to the draft.
 * Body: { playerId, delta } or { entries: [{ playerId, delta }] }, plus optional opId, socketId.
 */
router.post('/current/scores', validateGameAccess, scoreLimiter.middleware, async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const entries = Array.isArray(req.body.entries)
      ? req.body.entries
      : [{ playerId: req.body.playerId, delta: req.body.delta }];
    for (const entry of entries) requirePlayerId(entry.playerId);

    const result = await addToDraft(db, {
      gameId,
      entries,
      opId: optionalOpId(req.body),
      origin: req.body.socketId || null
    });
    const single = entries.length === 1 ? entries[0] : null;
    const state = await broadcast(req, { action: 'tap', playerId: single?.playerId ?? null, change: single?.delta ?? null });
    respond(res, state, result);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /rounds/current/scores/:playerId - Set a player's draft for the open round.
 * Body: { points } or { total }, plus optional opId, socketId.
 */
router.put('/current/scores/:playerId', validateGameAccess, scoreLimiter.middleware, async (req, res, next) => {
  try {
    const { gameId, playerId } = req.params;
    requirePlayerId(playerId);

    const result = await setDraft(db, {
      gameId,
      playerId,
      points: req.body.points,
      total: req.body.total,
      opId: optionalOpId(req.body),
      origin: req.body.socketId || null
    });
    const state = await broadcast(req, { action: 'set', playerId });
    respond(res, state, result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /rounds/commit - Save the round, advance the dealer, open the next round.
 * Body: { expectedRound?, winnerId?, opId?, socketId? }
 */
router.post('/commit', validateGameAccess, async (req, res, next) => {
  try {
    const { gameId } = req.params;
    if (req.body.winnerId) requirePlayerId(req.body.winnerId);

    const result = await commitRound(db, {
      gameId,
      expectedRound: req.body.expectedRound,
      winnerId: req.body.winnerId || null,
      opId: optionalOpId(req.body),
      origin: req.body.socketId || null
    });
    const state = await broadcast(req, { action: 'commit' });
    req.io?.to(`/sqid/${req.params.sqid}`).emit('dealer_changed', {
      game_id: gameId,
      dealer_id: state.game.dealer_id,
      sqid: req.params.sqid,
      timestamp: new Date().toISOString()
    });
    respond(res, state, result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /rounds/undo-commit - Reopen the last saved round.
 */
router.post('/undo-commit', validateGameAccess, async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const result = await undoCommit(db, {
      gameId,
      opId: optionalOpId(req.body),
      origin: req.body.socketId || null
    });
    const state = await broadcast(req, { action: 'undo' });
    req.io?.to(`/sqid/${req.params.sqid}`).emit('dealer_changed', {
      game_id: gameId,
      dealer_id: state.game.dealer_id,
      sqid: req.params.sqid,
      timestamp: new Date().toISOString()
    });
    respond(res, state, result);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /rounds/:roundNumber/scores/:playerId - Correct a saved round.
 * Body: { points, expectedRevision?, opId?, socketId? }
 */
router.put('/:roundNumber/scores/:playerId', validateGameAccess, scoreLimiter.middleware, async (req, res, next) => {
  try {
    const { gameId, playerId } = req.params;
    requirePlayerId(playerId);

    const result = await editRound(db, {
      gameId,
      roundNumber: Number(req.params.roundNumber),
      playerId,
      points: req.body.points,
      expectedRevision: req.body.expectedRevision,
      opId: optionalOpId(req.body),
      origin: req.body.socketId || null
    });
    const state = await broadcast(req, { action: 'edit', playerId });
    respond(res, state, result);
  } catch (error) {
    next(error);
  }
});

export default router;
