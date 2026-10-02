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
 * Play, hand and crib stats for games that track score parts. Rounds without
 * parts (older games, totals-only entry) are left out. The crib average only
 * counts rounds the player dealt, since only the dealer scores a crib.
 * @param {Array<{ player_id: string, game_type_id: string, dealer_id: string|null, play_points: number|null, hand_points: number|null, crib_points: number|null }>} rows
 * @returns {Record<string, Record<string, object>>}
 */
export function summarizeParts(rows) {
  const round1 = (n) => Math.round(n * 10) / 10;
  const grouped = {};
  for (const row of rows) {
    if (row.play_points === null && row.hand_points === null && row.crib_points === null) continue;
    ((grouped[row.player_id] ||= {})[row.game_type_id] ||= []).push(row);
  }

  const result = {};
  for (const [playerId, byType] of Object.entries(grouped)) {
    result[playerId] = {};
    for (const [gameTypeId, list] of Object.entries(byType)) {
      const play = list.reduce((t, r) => t + (r.play_points ?? 0), 0);
      const hand = list.reduce((t, r) => t + (r.hand_points ?? 0), 0);
      const cribs = list.filter((r) => r.dealer_id === r.player_id);
      const crib = cribs.reduce((t, r) => t + (r.crib_points ?? 0), 0);
      const all = play + hand + crib;
      result[playerId][gameTypeId] = {
        rounds_tracked: list.length,
        cribs_dealt: cribs.length,
        avg_play: round1(play / list.length),
        avg_hand: round1(hand / list.length),
        avg_crib: cribs.length ? round1(crib / cribs.length) : null,
        best_hand: Math.max(...list.map((r) => r.hand_points ?? 0)),
        best_crib: cribs.length ? Math.max(...cribs.map((r) => r.crib_points ?? 0)) : null,
        share_play: all ? round1((play / all) * 100) : null,
        share_hand: all ? round1((hand / all) * 100) : null,
        share_crib: all ? round1((crib / all) * 100) : null
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
    `SELECT rs.player_id, g.game_type_id, rs.points, g.id AS game_id, r.round_number, g.ended_at,
            r.dealer_id, rs.play_points, rs.hand_points, rs.crib_points
     FROM games g
     JOIN rounds r ON r.game_id = g.id AND r.status = 'committed' AND r.is_backfill = 0
     JOIN round_scores rs ON rs.round_id = r.id
     WHERE g.rivalry_id = ? AND g.finalized = 1`,
    [rivalryId]
  );
  const types = await db.query('SELECT id, is_win_condition FROM game_types');
  const higherIsBetter = new Map(types.map((t) => [t.id, Boolean(t.is_win_condition)]));
  const result = summarizeRounds(rows, higherIsBetter);
  for (const [playerId, byType] of Object.entries(summarizeParts(rows))) {
    for (const [gameTypeId, parts] of Object.entries(byType)) {
      result[playerId][gameTypeId].parts = parts;
    }
  }
  return result;
}
