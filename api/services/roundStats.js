/**
 * Per-round statistics for a rivalry. Only saved rounds of finished games count.
 * The "Earlier" row that holds old games' totals (is_backfill) is left out, since
 * it is not a real round and would wreck the averages.
 */

/**
 * @param {Array<{ player_id: string, game_type_id: string, points: number, game_id: string, round_number: number, ended_at: string|null }>} rows
 * @param {Map<string, boolean>} higherIsBetter - game_type_id -> true when a high round is a good round
 * @returns {Record<string, Record<string, { rounds_played: number, avg_round: number, best_round: object, worst_round: object }>>}
 */
export function summarizeRounds(rows, higherIsBetter) {
  const grouped = {};
  for (const row of rows) {
    const byType = (grouped[row.player_id] ||= {});
    (byType[row.game_type_id] ||= []).push(row);
  }

  const result = {};
  for (const [playerId, byType] of Object.entries(grouped)) {
    result[playerId] = {};
    for (const [gameTypeId, list] of Object.entries(byType)) {
      const highIsGood = higherIsBetter.get(gameTypeId) !== false;
      const sum = list.reduce((total, r) => total + r.points, 0);
      let max = list[0];
      let min = list[0];
      for (const r of list) {
        if (r.points > max.points) max = r;
        if (r.points < min.points) min = r;
      }
      const describe = (r) => ({ points: r.points, game_id: r.game_id, round_number: r.round_number, date: r.ended_at });
      result[playerId][gameTypeId] = {
        rounds_played: list.length,
        avg_round: Math.round((sum / list.length) * 10) / 10,
        best_round: describe(highIsGood ? max : min),
        worst_round: describe(highIsGood ? min : max)
      };
    }
  }
  return result;
}

/**
 * One query for the whole rivalry, aggregated in memory.
 */
export async function getRivalryRoundStats(db, rivalryId) {
  const rows = await db.query(
    `SELECT rs.player_id, g.game_type_id, rs.points, g.id AS game_id, r.round_number, g.ended_at
     FROM games g
     JOIN rounds r ON r.game_id = g.id AND r.status = 'committed' AND r.is_backfill = 0
     JOIN round_scores rs ON rs.round_id = r.id
     WHERE g.rivalry_id = ? AND g.finalized = 1`,
    [rivalryId]
  );
  const types = await db.query('SELECT id, is_win_condition FROM game_types');
  const higherIsBetter = new Map(types.map((t) => [t.id, Boolean(t.is_win_condition)]));
  return summarizeRounds(rows, higherIsBetter);
}
