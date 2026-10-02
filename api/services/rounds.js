import { ConflictError, NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { generateUUID } from '../utils/helpers.js';
import { computeWinner } from '../utils/winner.js';

/**
 * Round workflow for a game.
 *
 * A game has committed rounds (history) and at most one open round (the draft
 * the table is entering right now). stats.score is a cached total: committed
 * rounds plus the open draft. The winner is only evaluated against committed
 * rounds, and is only set when the table confirms it at commit.
 *
 * Every write runs as one synchronous transaction (db.transactionSync), so it is
 * atomic and cannot interleave with another request. Writes accept an optional
 * opId; a repeated opId is a no-op and returns { duplicate: true }.
 */

const SELECT_GAME = `
  SELECT g.*, gt.is_win_condition, gt.win_condition, gt.loss_condition, gt.score_parts
  FROM games g
  JOIN game_types gt ON gt.id = g.game_type_id
  WHERE g.id = ?`;

function scoreBounds() {
  return {
    min: parseInt(process.env.MIN_SCORE) || -999,
    max: parseInt(process.env.MAX_SCORE) || 999
  };
}

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Helpers that run inside a transaction (synchronous handle `tx`)
// ---------------------------------------------------------------------------

function loadEditableGame(tx, gameId) {
  const game = tx.get(SELECT_GAME, [gameId]);
  if (!game) throw new NotFoundError('Game not found');
  if (game.finalized) throw new ConflictError('Cannot change scores for finalized games');
  return game;
}

function isDuplicate(tx, opId) {
  return Boolean(opId) && Boolean(tx.get('SELECT 1 AS found FROM score_audit WHERE op_id = ?', [opId]));
}

function playersInOrder(tx, gameId) {
  return tx.all(
    'SELECT player_id FROM stats WHERE game_id = ? ORDER BY COALESCE(player_order, 999), created_at, player_id',
    [gameId]
  );
}

function insertRound(tx, { gameId, roundNumber, dealerId, status = 'open', isBackfill = 0, points = null }) {
  const id = generateUUID();
  const stamp = now();
  tx.run(
    `INSERT INTO rounds (id, game_id, round_number, dealer_id, status, is_backfill, created_at, committed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, gameId, roundNumber, dealerId ?? null, status, isBackfill, stamp, status === 'committed' ? stamp : null]
  );
  for (const { player_id: playerId } of playersInOrder(tx, gameId)) {
    tx.run(
      'INSERT INTO round_scores (round_id, game_id, player_id, points, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, gameId, playerId, points ? (points[playerId] ?? 0) : 0, stamp]
    );
  }
  return id;
}

/**
 * Makes sure the game has an open round. A game with no rounds at all (should not
 * exist after the migration) gets a legacy round holding its current totals first,
 * so recomputing totals from rounds never loses points.
 */
function ensureOpenRound(tx, game) {
  const anyRound = tx.get('SELECT 1 AS found FROM rounds WHERE game_id = ? LIMIT 1', [game.id]);
  if (!anyRound) {
    const totals = {};
    for (const row of tx.all('SELECT player_id, score FROM stats WHERE game_id = ?', [game.id])) {
      totals[row.player_id] = row.score;
    }
    insertRound(tx, { gameId: game.id, roundNumber: 1, dealerId: game.dealer_id, status: 'committed', isBackfill: 1, points: totals });
  }

  let open = tx.get("SELECT * FROM rounds WHERE game_id = ? AND status = 'open'", [game.id]);
  if (!open) {
    const { next } = tx.get('SELECT COALESCE(MAX(round_number), 0) + 1 AS next FROM rounds WHERE game_id = ?', [game.id]);
    const id = insertRound(tx, { gameId: game.id, roundNumber: next, dealerId: game.dealer_id });
    open = tx.get('SELECT * FROM rounds WHERE id = ?', [id]);
  }
  return open;
}

/**
 * Rewrites stats.score from round points (committed + draft) and rejects the
 * whole change if any total leaves the allowed range.
 */
function recomputeTotals(tx, gameId) {
  const { min, max } = scoreBounds();
  const totals = tx.all(
    `SELECT s.player_id, COALESCE(SUM(rs.points), 0) AS total
     FROM stats s
     LEFT JOIN round_scores rs ON rs.game_id = s.game_id AND rs.player_id = s.player_id
     WHERE s.game_id = ?
     GROUP BY s.player_id`,
    [gameId]
  );
  const stamp = now();
  for (const { player_id: playerId, total } of totals) {
    if (total < min || total > max) {
      throw new ValidationError(`Score must be between ${min} and ${max}. Attempted score: ${total}`);
    }
    tx.run('UPDATE stats SET score = ?, updated_at = ? WHERE game_id = ? AND player_id = ?', [total, stamp, gameId, playerId]);
  }
}

function committedTotals(tx, gameId) {
  return tx.all(
    `SELECT s.player_id, COALESCE(SUM(CASE WHEN r.status = 'committed' THEN rs.points ELSE 0 END), 0) AS score
     FROM stats s
     LEFT JOIN round_scores rs ON rs.game_id = s.game_id AND rs.player_id = s.player_id
     LEFT JOIN rounds r ON r.id = rs.round_id
     WHERE s.game_id = ?
     GROUP BY s.player_id`,
    [gameId]
  );
}

/**
 * Clears a winner that the committed rounds no longer support. When confirmWinnerId
 * is given, it must match the current standings and becomes the winner.
 * @returns {string|null} the winner after reconciling
 */
function reconcileWinner(tx, game, confirmWinnerId = null) {
  const candidate = computeWinner(game, committedTotals(tx, game.id));
  let winnerId = game.winner_id ?? null;

  if (winnerId && winnerId !== candidate) winnerId = null;

  if (confirmWinnerId) {
    if (confirmWinnerId !== candidate) {
      throw new ValidationError('That player is not the winner under the current scores');
    }
    winnerId = candidate;
  }

  if (winnerId !== (game.winner_id ?? null)) {
    tx.run('UPDATE games SET winner_id = ? WHERE id = ?', [winnerId, game.id]);
  }
  return winnerId;
}

function writeAudit(tx, entries, opId) {
  entries.forEach((entry, index) => {
    tx.run(
      `INSERT INTO score_audit (game_id, round_id, player_id, kind, old_points, new_points, origin, op_id, part)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entry.gameId, entry.roundId ?? null, entry.playerId, entry.kind, entry.oldPoints ?? null, entry.newPoints ?? null, entry.origin ?? null, index === 0 ? (opId ?? null) : null, entry.part ?? null]
    );
  });
}

// ---------------------------------------------------------------------------
// Score parts (cribbage: play, hand, crib)
// ---------------------------------------------------------------------------

// Hands and cribs can score 0 to 29, but never these values.
const IMPOSSIBLE_COUNT_SCORES = new Set([19, 25, 26, 27]);

function gameParts(game) {
  if (!game.score_parts) return null;
  try {
    const parts = JSON.parse(game.score_parts);
    return Array.isArray(parts) && parts.length > 0 ? parts : null;
  } catch {
    return null;
  }
}

function requirePart(game, part) {
  if (part === undefined || part === null) return null;
  const parts = gameParts(game);
  if (!parts) throw new ValidationError('This game does not track score parts');
  if (!parts.includes(part)) throw new ValidationError(`part must be one of: ${parts.join(', ')}`);
  return part;
}

function validatePartValue(part, value) {
  if (value < 0) throw new ValidationError(`${part} points cannot be negative`);
  if (part === 'hand' || part === 'crib') {
    if (value > 29 || IMPOSSIBLE_COUNT_SCORES.has(value)) {
      throw new ValidationError(`${value} is not a possible ${part} score`);
    }
  }
}

/** A row's parts. A row with no parts yet counts its existing points as play. */
function readParts(row) {
  if (row.play_points === null && row.hand_points === null && row.crib_points === null) {
    return { play: row.points, hand: 0, crib: 0 };
  }
  return { play: row.play_points ?? 0, hand: row.hand_points ?? 0, crib: row.crib_points ?? 0 };
}

const partTotal = (parts) => parts.play + parts.hand + parts.crib;

/**
 * Changes one part of a player's row in a round (add a delta or set a value) and
 * keeps points equal to the sum of the parts.
 * @returns {{ oldPoints: number, newPoints: number }}
 */
function writePart(tx, round, playerId, part, { delta, value, markEdited = false }) {
  const row = tx.get(
    'SELECT points, play_points, hand_points, crib_points FROM round_scores WHERE round_id = ? AND player_id = ?',
    [round.id, playerId]
  );
  if (!row) throw new ValidationError('Player not found in this game');
  if (part === 'crib' && round.dealer_id && round.dealer_id !== playerId) {
    throw new ValidationError('Only the dealer scores the crib');
  }

  const parts = readParts(row);
  parts[part] = delta !== undefined ? parts[part] + delta : value;
  validatePartValue(part, parts[part]);

  const points = partTotal(parts);
  tx.run(
    `UPDATE round_scores SET points = ?, play_points = ?, hand_points = ?, crib_points = ?, edited = CASE WHEN ? THEN 1 ELSE edited END, updated_at = ?
     WHERE round_id = ? AND player_id = ?`,
    [points, parts.play, parts.hand, parts.crib, markEdited ? 1 : 0, now(), round.id, playerId]
  );
  return { oldPoints: row.points, newPoints: points };
}

/**
 * A plain total change (no part given) on a row that already has parts goes to
 * play, so points still equals the sum of the parts. Rows without parts are left alone.
 */
function followTotalChange(tx, roundId, playerId, change) {
  if (change === 0) return;
  tx.run(
    'UPDATE round_scores SET play_points = play_points + ? WHERE round_id = ? AND player_id = ? AND play_points IS NOT NULL',
    [change, roundId, playerId]
  );
}

function requireInteger(value, name) {
  if (!Number.isInteger(value)) throw new ValidationError(`${name} must be an integer`);
}

function nextDealerId(tx, game) {
  const order = playersInOrder(tx, game.id).map((p) => p.player_id);
  if (order.length === 0) return game.dealer_id ?? null;
  const index = order.indexOf(game.dealer_id);
  return order[(index + 1) % order.length];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Full round state for a game: players with totals and draft, every round with its scores.
 */
export async function getRoundState(db, gameId) {
  const game = await db.get(SELECT_GAME, [gameId]);
  if (!game) throw new NotFoundError('Game not found');

  const players = await db.query(
    `SELECT s.player_id, p.name AS player_name, p.color, s.player_order, s.score AS total
     FROM stats s
     JOIN players p ON p.id = s.player_id
     WHERE s.game_id = ?
     ORDER BY COALESCE(s.player_order, 999), s.created_at, s.player_id`,
    [gameId]
  );
  const roundRows = await db.query(
    `SELECT id, round_number, dealer_id, status, is_backfill, revision, created_at, committed_at
     FROM rounds WHERE game_id = ? ORDER BY round_number`,
    [gameId]
  );
  const scoreRows = await db.query(
    'SELECT round_id, player_id, points, edited, play_points, hand_points, crib_points FROM round_scores WHERE game_id = ?',
    [gameId]
  );

  const byRound = new Map(roundRows.map((r) => [r.id, { ...r, scores: {}, edited: {}, parts: {} }]));
  for (const row of scoreRows) {
    const round = byRound.get(row.round_id);
    if (!round) continue;
    round.scores[row.player_id] = row.points;
    if (row.play_points !== null || row.hand_points !== null || row.crib_points !== null) {
      round.parts[row.player_id] = { play: row.play_points ?? 0, hand: row.hand_points ?? 0, crib: row.crib_points ?? 0 };
    }
    if (row.edited) round.edited[row.player_id] = true;
  }

  const rounds = roundRows.map((r) => {
    const { id, ...rest } = byRound.get(r.id);
    return rest;
  });
  const open = rounds.find((r) => r.status === 'open') || null;

  const committed = {};
  for (const round of rounds) {
    if (round.status !== 'committed') continue;
    for (const [playerId, points] of Object.entries(round.scores)) {
      committed[playerId] = (committed[playerId] || 0) + points;
    }
  }

  const playerStates = players.map((p) => ({
    ...p,
    committed_total: committed[p.player_id] || 0,
    draft: open ? (open.scores[p.player_id] || 0) : 0,
    draft_parts: open?.parts[p.player_id] ?? null
  }));

  return {
    game: {
      id: game.id,
      finalized: Boolean(game.finalized),
      winner_id: game.winner_id ?? null,
      dealer_id: game.dealer_id ?? null,
      score_parts: gameParts(game),
      win_condition_type: game.win_condition_type ?? (game.is_win_condition ? 'win' : 'lose'),
      win_condition_value: game.win_condition_value ?? (game.is_win_condition ? game.win_condition : game.loss_condition)
    },
    players: playerStates,
    rounds,
    open_round: open ? open.round_number : null,
    winner_candidate: computeWinner(game, playerStates.map((p) => ({ player_id: p.player_id, score: p.committed_total })))
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Adds point deltas to the open round.
 * @param {object} db
 * @param {{ gameId: string, entries: Array<{ playerId: string, delta: number }>, opId?: string, origin?: string }} args
 */
export async function addToDraft(db, { gameId, entries, opId = null, origin = null }) {
  if (!Array.isArray(entries) || entries.length === 0) throw new ValidationError('At least one score change is required');
  for (const entry of entries) requireInteger(entry.delta, 'delta');

  return db.transactionSync((tx) => {
    const game = loadEditableGame(tx, gameId);
    if (isDuplicate(tx, opId)) return { duplicate: true };

    const round = ensureOpenRound(tx, game);
    const audit = [];
    for (const { playerId, delta, part: rawPart } of entries) {
      const part = requirePart(game, rawPart);
      if (part) {
        const { oldPoints, newPoints } = writePart(tx, round, playerId, part, { delta });
        audit.push({ gameId, roundId: round.id, playerId, kind: 'tap', oldPoints, newPoints, origin, part });
        continue;
      }
      const row = tx.get('SELECT points FROM round_scores WHERE round_id = ? AND player_id = ?', [round.id, playerId]);
      if (!row) throw new ValidationError('Player not found in this game');
      tx.run('UPDATE round_scores SET points = points + ?, updated_at = ? WHERE round_id = ? AND player_id = ?', [delta, now(), round.id, playerId]);
      followTotalChange(tx, round.id, playerId, delta);
      audit.push({ gameId, roundId: round.id, playerId, kind: 'tap', oldPoints: row.points, newPoints: row.points + delta, origin });
    }
    recomputeTotals(tx, gameId);
    writeAudit(tx, audit, opId);
    return { duplicate: false, round_number: round.round_number };
  });
}

/**
 * Sets one player's draft for the open round. Give either points (this round's value)
 * or total (the player's overall total, from which the draft is derived).
 */
export async function setDraft(db, { gameId, playerId, points = undefined, total = undefined, part: rawPart = undefined, opId = null, origin = null }) {
  if (points === undefined && total === undefined) throw new ValidationError('points is required');
  if (points !== undefined) requireInteger(points, 'points');
  if (total !== undefined) requireInteger(total, 'total');
  if ((rawPart ?? null) !== null && points === undefined) throw new ValidationError('A part needs points, not total');

  return db.transactionSync((tx) => {
    const game = loadEditableGame(tx, gameId);
    if (isDuplicate(tx, opId)) return { duplicate: true };

    const round = ensureOpenRound(tx, game);
    const part = requirePart(game, rawPart);
    if (part) {
      const { oldPoints, newPoints } = writePart(tx, round, playerId, part, { value: points });
      recomputeTotals(tx, gameId);
      writeAudit(tx, [{ gameId, roundId: round.id, playerId, kind: points === 0 ? 'clear' : 'set', oldPoints, newPoints, origin, part }], opId);
      return { duplicate: false, round_number: round.round_number };
    }
    const row = tx.get('SELECT points FROM round_scores WHERE round_id = ? AND player_id = ?', [round.id, playerId]);
    if (!row) throw new ValidationError('Player not found in this game');

    let newPoints = points;
    if (newPoints === undefined) {
      const committed = committedTotals(tx, gameId).find((c) => c.player_id === playerId);
      newPoints = total - (committed ? committed.score : 0);
    }

    tx.run('UPDATE round_scores SET points = ?, updated_at = ? WHERE round_id = ? AND player_id = ?', [newPoints, now(), round.id, playerId]);
    followTotalChange(tx, round.id, playerId, newPoints - row.points);
    recomputeTotals(tx, gameId);
    writeAudit(tx, [{ gameId, roundId: round.id, playerId, kind: newPoints === 0 ? 'clear' : 'set', oldPoints: row.points, newPoints, origin }], opId);
    return { duplicate: false, round_number: round.round_number };
  });
}

/**
 * Saves the open round, advances the dealer, opens the next round, and (when
 * winnerId is given and matches the standings) confirms the winner.
 * expectedRound guards against two devices committing the same round.
 */
export async function commitRound(db, { gameId, expectedRound = undefined, winnerId = null, opId = null, origin = null }) {
  if (expectedRound !== undefined) requireInteger(expectedRound, 'expectedRound');

  return db.transactionSync((tx) => {
    const game = loadEditableGame(tx, gameId);
    if (isDuplicate(tx, opId)) return { duplicate: true };

    const open = ensureOpenRound(tx, game);
    if (expectedRound !== undefined && expectedRound !== open.round_number) {
      throw new ConflictError(`Round ${expectedRound} is not the open round (round ${open.round_number} is)`);
    }

    const draft = tx.all('SELECT player_id, points FROM round_scores WHERE round_id = ?', [open.id]);
    tx.run(
      "UPDATE rounds SET status = 'committed', committed_at = ?, dealer_id = ?, revision = revision + 1 WHERE id = ?",
      [now(), game.dealer_id ?? null, open.id]
    );

    const dealerId = nextDealerId(tx, game);
    insertRound(tx, { gameId, roundNumber: open.round_number + 1, dealerId });
    if (dealerId && dealerId !== game.dealer_id) {
      tx.run('UPDATE games SET dealer_id = ? WHERE id = ?', [dealerId, gameId]);
    }

    reconcileWinner(tx, game, winnerId);
    writeAudit(
      tx,
      draft.map((d) => ({ gameId, roundId: open.id, playerId: d.player_id, kind: 'commit', oldPoints: null, newPoints: d.points, origin })),
      opId
    );
    return { duplicate: false, round_number: open.round_number };
  });
}

/**
 * Reopens the last committed round. Anything already tapped into the current
 * open round is merged into it, so no taps are lost. Legacy rounds cannot be reopened.
 */
export async function undoCommit(db, { gameId, opId = null, origin = null }) {
  return db.transactionSync((tx) => {
    const game = loadEditableGame(tx, gameId);
    if (isDuplicate(tx, opId)) return { duplicate: true };

    const open = ensureOpenRound(tx, game);
    const last = tx.get(
      "SELECT * FROM rounds WHERE game_id = ? AND status = 'committed' ORDER BY round_number DESC LIMIT 1",
      [gameId]
    );
    if (!last) throw new ConflictError('There is no saved round to undo');
    if (last.is_backfill) throw new ConflictError('Rounds from before round tracking cannot be reopened');

    const draft = tx.all('SELECT player_id, points, play_points, hand_points, crib_points FROM round_scores WHERE round_id = ?', [open.id]);
    if (draft.some((d) => d.crib_points)) {
      throw new ConflictError('Clear the crib points in the current round before undoing the last round');
    }
    for (const d of draft) {
      if (d.points === 0 && d.play_points === null) continue;
      const target = tx.get('SELECT points, play_points, hand_points, crib_points FROM round_scores WHERE round_id = ? AND player_id = ?', [last.id, d.player_id]);
      if (target && (d.play_points !== null || target.play_points !== null)) {
        const a = readParts(d);
        const b = readParts(target);
        tx.run(
          'UPDATE round_scores SET points = ?, play_points = ?, hand_points = ?, crib_points = ?, updated_at = ? WHERE round_id = ? AND player_id = ?',
          [target.points + d.points, a.play + b.play, a.hand + b.hand, a.crib + b.crib, now(), last.id, d.player_id]
        );
      } else if (d.points !== 0) {
        tx.run('UPDATE round_scores SET points = points + ?, updated_at = ? WHERE round_id = ? AND player_id = ?', [d.points, now(), last.id, d.player_id]);
      }
    }
    tx.run('DELETE FROM rounds WHERE id = ?', [open.id]);
    tx.run("UPDATE rounds SET status = 'open', committed_at = NULL, revision = revision + 1 WHERE id = ?", [last.id]);
    if (last.dealer_id) {
      tx.run('UPDATE games SET dealer_id = ? WHERE id = ?', [last.dealer_id, gameId]);
    }

    recomputeTotals(tx, gameId);
    reconcileWinner(tx, game);

    const reopened = tx.all('SELECT player_id, points FROM round_scores WHERE round_id = ?', [last.id]);
    writeAudit(
      tx,
      reopened.map((r) => ({ gameId, roundId: last.id, playerId: r.player_id, kind: 'undo', oldPoints: null, newPoints: r.points, origin })),
      opId
    );
    return { duplicate: false, round_number: last.round_number };
  });
}

/**
 * Corrects one player's points in a saved round. expectedRevision (optional)
 * rejects the edit if someone else changed that round since it was read.
 */
export async function editRound(db, { gameId, roundNumber, playerId, points, part: rawPart = undefined, expectedRevision = undefined, opId = null, origin = null }) {
  requireInteger(roundNumber, 'roundNumber');
  requireInteger(points, 'points');
  if (expectedRevision !== undefined) requireInteger(expectedRevision, 'expectedRevision');

  return db.transactionSync((tx) => {
    const game = loadEditableGame(tx, gameId);
    if (isDuplicate(tx, opId)) return { duplicate: true };

    const round = tx.get('SELECT * FROM rounds WHERE game_id = ? AND round_number = ?', [gameId, roundNumber]);
    if (!round) throw new NotFoundError('Round not found');
    if (round.status === 'open') throw new ValidationError('Use the current round endpoints to change the open round');
    if (expectedRevision !== undefined && expectedRevision !== round.revision) {
      throw new ConflictError('This round was changed by someone else. Reload and try again');
    }

    const part = requirePart(game, rawPart);
    let oldPoints;
    let newPoints = points;
    if (part) {
      ({ oldPoints, newPoints } = writePart(tx, round, playerId, part, { value: points, markEdited: true }));
    } else {
      const row = tx.get('SELECT points FROM round_scores WHERE round_id = ? AND player_id = ?', [round.id, playerId]);
      if (!row) throw new ValidationError('Player not found in this game');
      oldPoints = row.points;
      tx.run('UPDATE round_scores SET points = ?, edited = 1, updated_at = ? WHERE round_id = ? AND player_id = ?', [points, now(), round.id, playerId]);
      followTotalChange(tx, round.id, playerId, points - row.points);
    }
    tx.run('UPDATE rounds SET revision = revision + 1 WHERE id = ?', [round.id]);

    recomputeTotals(tx, gameId);
    reconcileWinner(tx, game);
    writeAudit(tx, [{ gameId, roundId: round.id, playerId, kind: 'edit', oldPoints, newPoints, origin, part }], opId);
    return { duplicate: false, round_number: roundNumber };
  });
}

/**
 * Called when a game is finalized: saves the open draft as the last round (no new
 * round is opened), or drops the open round if nothing was entered in it.
 */
export async function closeOpenRound(db, gameId) {
  return db.transactionSync((tx) => {
    const open = tx.get("SELECT * FROM rounds WHERE game_id = ? AND status = 'open'", [gameId]);
    if (!open) return;

    const draft = tx.all('SELECT player_id, points FROM round_scores WHERE round_id = ?', [open.id]);
    if (draft.every((d) => d.points === 0)) {
      tx.run('DELETE FROM rounds WHERE id = ?', [open.id]);
      return;
    }
    const game = tx.get('SELECT dealer_id FROM games WHERE id = ?', [gameId]);
    tx.run(
      "UPDATE rounds SET status = 'committed', committed_at = ?, dealer_id = ?, revision = revision + 1 WHERE id = ?",
      [now(), game?.dealer_id ?? null, open.id]
    );
    writeAudit(
      tx,
      draft.map((d) => ({ gameId, roundId: open.id, playerId: d.player_id, kind: 'commit', oldPoints: null, newPoints: d.points })),
      null
    );
  });
}

/**
 * Stats rows in the shape the existing score_update event and stats routes use.
 */
export async function loadStatsRows(db, gameId) {
  return db.query(
    `SELECT s.*, p.name AS player_name, p.color
     FROM stats s JOIN players p ON s.player_id = p.id
     WHERE s.game_id = ?
     ORDER BY COALESCE(s.player_order, 999), s.created_at ASC`,
    [gameId]
  );
}
