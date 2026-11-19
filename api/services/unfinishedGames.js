import { ConflictError, NotFoundError } from '../middleware/errorHandler.js';

/**
 * Unfinished games: games with finalized = false. At most one is "active"
 * (abandoned_at is NULL); the rest are parked (abandoned_at is set). Parked games keep all
 * their scores and rounds and can be resumed.
 *
 * - A game with no scores (no committed round and every total zero) is discarded quietly.
 * - Parked games older than 30 days (by last activity) are hidden. The rows are kept.
 */

export const UNFINISHED_MAX_AGE_DAYS = 30;

// No committed round and every player at zero: nothing worth keeping.
const EMPTY_GAME = `
  NOT EXISTS (SELECT 1 FROM rounds r WHERE r.game_id = g.id AND r.status = 'committed')
  AND COALESCE((SELECT SUM(ABS(s.score)) FROM stats s WHERE s.game_id = g.id), 0) = 0`;

// Latest sign of life: a score write, else the start of the game.
const LAST_ACTIVITY = `
  COALESCE(
    (SELECT MAX(s.updated_at) FROM stats s WHERE s.game_id = g.id),
    g.started_at
  )`;

/** Deletes this board's unfinished games that have no scores. Returns how many. */
export async function discardEmptyGames(db, sqid) {
  const empty = await db.query(
    `SELECT g.id FROM games g WHERE g.sqid_id = ? AND g.finalized = false AND ${EMPTY_GAME}`,
    [sqid]
  );
  for (const { id } of empty) {
    // stats, rounds and round_scores go with it (ON DELETE CASCADE)
    await db.run('DELETE FROM games WHERE id = ?', [id]);
  }
  return empty.length;
}

/** Unfinished games from the last 30 days, newest first. is_active marks the one being played. */
export async function listUnfinished(db, sqid, { now = new Date() } = {}) {
  await discardEmptyGames(db, sqid);

  const cutoff = new Date(now.getTime() - UNFINISHED_MAX_AGE_DAYS * 86400000).toISOString();
  const games = await db.query(
    `SELECT
       g.id, g.game_type_id, g.started_at, g.dealer_id, g.win_condition_type, g.win_condition_value,
       gt.name AS game_type_name,
       gt.is_win_condition, gt.win_condition, gt.loss_condition,
       CASE WHEN g.abandoned_at IS NULL THEN 1 ELSE 0 END AS is_active,
       ${LAST_ACTIVITY} AS last_activity,
       (SELECT COUNT(*) FROM rounds r WHERE r.game_id = g.id AND r.status = 'committed') + 1 AS current_round
     FROM games g
     JOIN game_types gt ON gt.id = g.game_type_id
     WHERE g.sqid_id = ? AND g.finalized = false
     ORDER BY ${LAST_ACTIVITY} DESC`,
    [sqid]
  );

  const kept = [];
  for (const game of games) {
    // the active game is always shown; parked games age out
    if (!game.is_active && game.last_activity < cutoff) continue;
    if (!game.win_condition_type || !game.win_condition_value) {
      game.win_condition_type = game.is_win_condition ? 'win' : 'lose';
      game.win_condition_value = game.is_win_condition ? game.win_condition : game.loss_condition;
    }
    game.is_active = Boolean(game.is_active);
    game.players = await db.query(
      `SELECT p.id, p.name, s.score, s.player_order
       FROM stats s JOIN players p ON p.id = s.player_id
       WHERE s.game_id = ?
       ORDER BY COALESCE(s.player_order, 999), s.created_at ASC`,
      [game.id]
    );
    kept.push(game);
  }
  return kept;
}

/**
 * Makes a parked game the active one. The game being played is parked (or discarded if it has
 * no scores). Throws NotFoundError for another board's game, ConflictError for a finished one
 * or one older than 30 days.
 */
export async function resumeGame(db, sqid, gameId, { now = new Date() } = {}) {
  return db.transaction(async (tx) => {
    const game = await tx.get(
      `SELECT g.*, ${LAST_ACTIVITY} AS last_activity FROM games g WHERE g.id = ? AND g.sqid_id = ?`,
      [gameId, sqid]
    );
    if (!game) throw new NotFoundError('Game not found');
    if (game.finalized) throw new ConflictError('Finished games cannot be resumed');
    if (game.abandoned_at) {
      const cutoff = new Date(now.getTime() - UNFINISHED_MAX_AGE_DAYS * 86400000).toISOString();
      if (game.last_activity < cutoff) throw new ConflictError('This game is too old to resume');
    }

    // park whatever is being played now (never the game being resumed)
    await tx.run(
      'UPDATE games SET abandoned_at = ? WHERE sqid_id = ? AND finalized = false AND abandoned_at IS NULL AND id != ?',
      [now.toISOString(), sqid, gameId]
    );
    await tx.run('UPDATE games SET abandoned_at = NULL WHERE id = ?', [gameId]);
    await discardEmptyGames(tx, sqid);
    return { id: gameId };
  });
}
