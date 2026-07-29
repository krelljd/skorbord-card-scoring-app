import { NotFoundError } from '../middleware/errorHandler.js';

/**
 * Deletes a rivalry and everything played under it: its games, those
 * games' stats, and (via ON DELETE CASCADE) rivalry_players,
 * rivalry_game_types, rivalry_stats, and rivalry_player_stats.
 * games.rivalry_id has no cascade, so games/stats must be deleted
 * explicitly before the rivalry row itself.
 * @param {import('../db/database.js').default} db
 * @param {{ sqidId: string, rivalryId: string }} params
 * @returns {Promise<void>}
 */
export async function deleteRivalryCascade(db, { sqidId, rivalryId }) {
  const rivalry = await db.get(
    'SELECT id FROM rivalries WHERE id = ? AND sqid_id = ?',
    [rivalryId, sqidId]
  );
  if (!rivalry) {
    throw new NotFoundError('Rivalry not found');
  }

  await db.transaction(async (tx) => {
    await tx.run(
      'DELETE FROM stats WHERE game_id IN (SELECT id FROM games WHERE rivalry_id = ?)',
      [rivalryId]
    );
    await tx.run('DELETE FROM games WHERE rivalry_id = ?', [rivalryId]);
    await tx.run('DELETE FROM rivalries WHERE id = ?', [rivalryId]);
  });
}
