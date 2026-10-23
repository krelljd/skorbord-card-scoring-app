/**
 * The game-by-game record of a rivalry, for the series timeline and points totals on the Stats screen.
 * Only finished games with a confirmed winner count. Legacy one-round games count too, since only
 * final scores are used.
 */

export const TIMELINE_LIMIT = 40;

/**
 * One entry per game, oldest first, capped to the most recent TIMELINE_LIMIT.
 * margin is the winner's lead over the closest other player, so it reads the same for every
 * game: the lowest score wins in games where low is good.
 * @param {Array<{ game_id: string, game_type_id: string, game_type_name: string, winner_id: string, ended_at: string|null, player_id: string, score: number }>} rows
 * @param {Map<string, boolean>} higherIsBetter - game_type_id -> true when a high score wins
 */
export function summarizeTimeline(rows, higherIsBetter) {
  const games = new Map();
  for (const row of rows) {
    if (!games.has(row.game_id)) {
      games.set(row.game_id, {
        id: row.game_id,
        winner_id: row.winner_id,
        game_type_id: row.game_type_id,
        game_type_name: row.game_type_name,
        ended_at: row.ended_at,
        scores: []
      });
    }
    games.get(row.game_id).scores.push({ player_id: row.player_id, score: Number(row.score) || 0 });
  }

  const timeline = [];
  for (const game of games.values()) {
    const winner = game.scores.find((s) => s.player_id === game.winner_id);
    const others = game.scores.filter((s) => s.player_id !== game.winner_id);
    if (!winner || others.length === 0) continue;
    const high = higherIsBetter.get(game.game_type_id) !== false;
    const closest = high ? Math.max(...others.map((s) => s.score)) : Math.min(...others.map((s) => s.score));
    const { scores, ...rest } = game;
    timeline.push({ ...rest, margin: Math.abs(winner.score - closest) });
  }

  timeline.sort((a, b) => {
    const at = a.ended_at || '';
    const bt = b.ended_at || '';
    return at < bt ? -1 : at > bt ? 1 : 0;
  });
  return timeline.slice(-TIMELINE_LIMIT);
}

/**
 * Lifetime points per player and game type, summed from final scores.
 * @param {Array<{ game_type_id: string, player_id: string, score: number }>} rows
 * @returns {Record<string, Record<string, number>>} player_id -> game_type_id -> points
 */
export function summarizePoints(rows) {
  const result = {};
  for (const row of rows) {
    const byType = (result[row.player_id] ||= {});
    byType[row.game_type_id] = (byType[row.game_type_id] || 0) + (Number(row.score) || 0);
  }
  return result;
}

/** One query for the whole rivalry, aggregated in memory. */
export async function getRivalrySeries(db, rivalryId) {
  const rows = await db.query(
    `SELECT g.id AS game_id, g.game_type_id, gt.name AS game_type_name, g.winner_id, g.ended_at,
            s.player_id, s.score
     FROM games g
     JOIN game_types gt ON gt.id = g.game_type_id
     JOIN stats s ON s.game_id = g.id
     WHERE g.rivalry_id = ? AND g.finalized = 1 AND g.winner_id IS NOT NULL`,
    [rivalryId]
  );
  const types = await db.query('SELECT id, is_win_condition FROM game_types');
  const higherIsBetter = new Map(types.map((t) => [t.id, Boolean(t.is_win_condition)]));
  return {
    timeline: summarizeTimeline(rows, higherIsBetter),
    points_totals: summarizePoints(rows)
  };
}
