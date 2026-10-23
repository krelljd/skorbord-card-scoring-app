/**
 * One summary per finished game, from its saved rounds, for the round-based snark lines (biggest comeback,
 * blown lead, wildest game, longest and shortest game, first dealer). Only games with MIN_ROUNDS or more real
 * rounds count, so legacy one-round games and short games are left out. Backfill rounds add to the running
 * totals but are not rounds. The app's game story uses the same rules for one game.
 */

export const MIN_ROUNDS = 3;

/**
 * @param {Array<{ game_id: string, winner_id: string, game_type_id: string, game_type_name: string, ended_at: string|null,
 *   round_number: number, is_backfill: number, dealer_id: string|null, player_id: string, points: number }>} rows
 * @param {Map<string, boolean>} higherIsBetter - game_type_id -> true when a high score wins
 * @returns {Array<{ id, winner_id, game_type_id, game_type_name, ended_at, rounds, lead_changes, comeback, blown_lead, blown_by, first_dealer_id }>}
 *   oldest first. comeback: the winner's worst deficit to the leader at a round end. blown_lead: the biggest
 *   lead a player who did not win held over the winner, and blown_by who held it.
 */
export function summarizeGameRounds(rows, higherIsBetter) {
  const games = new Map();
  for (const row of rows) {
    if (!games.has(row.game_id)) {
      games.set(row.game_id, { meta: row, rounds: new Map() });
    }
    const rounds = games.get(row.game_id).rounds;
    if (!rounds.has(row.round_number)) {
      rounds.set(row.round_number, { number: row.round_number, backfill: Boolean(row.is_backfill), dealer: row.dealer_id, scores: {} });
    }
    rounds.get(row.round_number).scores[row.player_id] = Number(row.points) || 0;
  }

  const out = [];
  for (const { meta, rounds } of games.values()) {
    const ordered = [...rounds.values()].sort((a, b) => a.number - b.number);
    const real = ordered.filter((r) => !r.backfill);
    if (real.length < MIN_ROUNDS) continue;

    const high = higherIsBetter.get(meta.game_type_id) !== false;
    const totals = {};
    let lastLeader = null;
    let leadChanges = 0;
    let comeback = 0;
    let blownLead = 0;
    let blownBy = null;

    for (const r of ordered) {
      for (const [playerId, points] of Object.entries(r.scores)) totals[playerId] = (totals[playerId] || 0) + points;
      if (r.backfill || totals[meta.winner_id] === undefined) continue;

      const ids = Object.keys(totals);
      const values = ids.map((id) => totals[id]);
      const best = high ? Math.max(...values) : Math.min(...values);
      const leaders = ids.filter((id) => totals[id] === best);
      if (leaders.length === 1) {
        if (lastLeader && lastLeader !== leaders[0]) leadChanges += 1;
        lastLeader = leaders[0];
      }

      const winnerTotal = totals[meta.winner_id];
      comeback = Math.max(comeback, high ? best - winnerTotal : winnerTotal - best);
      for (const id of ids) {
        if (id === meta.winner_id) continue;
        const ahead = high ? totals[id] - winnerTotal : winnerTotal - totals[id];
        if (ahead > blownLead) {
          blownLead = ahead;
          blownBy = id;
        }
      }
    }

    out.push({
      id: meta.game_id,
      winner_id: meta.winner_id,
      game_type_id: meta.game_type_id,
      game_type_name: meta.game_type_name,
      ended_at: meta.ended_at,
      rounds: real.length,
      lead_changes: leadChanges,
      comeback,
      blown_lead: blownLead,
      blown_by: blownBy,
      first_dealer_id: real[0].dealer || null
    });
  }

  out.sort((a, b) => {
    const at = a.ended_at || '';
    const bt = b.ended_at || '';
    return at < bt ? -1 : at > bt ? 1 : 0;
  });
  return out;
}

/** One query for the whole rivalry, summarized in memory. Same history cap as the series timeline. */
export async function getRivalryRounds(db, rivalryId) {
  const rows = await db.query(
    `SELECT g.id AS game_id, g.winner_id, g.game_type_id, gt.name AS game_type_name, g.ended_at,
            r.round_number, r.is_backfill, r.dealer_id, rs.player_id, rs.points
     FROM games g
     JOIN game_types gt ON gt.id = g.game_type_id
     JOIN rounds r ON r.game_id = g.id AND r.status = 'committed'
     JOIN round_scores rs ON rs.round_id = r.id
     WHERE g.rivalry_id = ? AND g.finalized = 1 AND g.winner_id IS NOT NULL
     ORDER BY g.id, r.round_number`,
    [rivalryId]
  );
  if (rows.length === 0) return [];
  const types = await db.query('SELECT id, is_win_condition FROM game_types');
  const higherIsBetter = new Map(types.map((t) => [t.id, Boolean(t.is_win_condition)]));
  return summarizeGameRounds(rows, higherIsBetter).slice(-1000);
}
