/**
 * Consistency check between the cached total on stats.score and the sum of
 * that player's round points in the same game (committed rounds plus the open
 * draft). Returns one row per mismatch; an empty array means everything agrees.
 *
 * Also catches games that have scores but no rounds, and rounds with no score
 * rows for a player who has a stats row.
 *
 * @param {import('./database.js').default} db
 * @returns {Promise<Array<{ game_id: string, player_id: string, cached_total: number, round_total: number }>>}
 */
export async function findTotalMismatches(db) {
  return db.query(`
    SELECT
      s.game_id,
      s.player_id,
      s.score AS cached_total,
      COALESCE(SUM(rs.points), 0) AS round_total
    FROM stats s
    LEFT JOIN round_scores rs ON rs.game_id = s.game_id AND rs.player_id = s.player_id
    GROUP BY s.game_id, s.player_id, s.score
    HAVING s.score != COALESCE(SUM(rs.points), 0)
    ORDER BY s.game_id, s.player_id
  `);
}
