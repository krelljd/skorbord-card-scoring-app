import { NotFoundError, ConflictError, ValidationError } from '../middleware/errorHandler.js';

/**
 * Renames a player within a sqid, rejecting names that collide
 * case-insensitively with another player already in that sqid.
 * @param {import('../db/database.js').default} db
 * @param {{ sqidId: string, playerId: string, name: string }} params
 * @returns {Promise<{ id: string, sqid_id: string, name: string, created_at: string, color: string }>}
 */
export async function renamePlayer(db, { sqidId, playerId, name }) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Player name is required');
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 64) {
    throw new ValidationError('Player name must be 64 characters or less');
  }

  const player = await db.get(
    'SELECT id FROM players WHERE id = ? AND sqid_id = ?',
    [playerId, sqidId]
  );
  if (!player) {
    throw new NotFoundError('Player not found');
  }

  const duplicate = await db.get(
    'SELECT id FROM players WHERE sqid_id = ? AND LOWER(TRIM(name)) = ? AND id != ?',
    [sqidId, trimmedName.toLowerCase(), playerId]
  );
  if (duplicate) {
    throw new ConflictError('Player name already exists in this Sqid');
  }

  await db.run('UPDATE players SET name = ? WHERE id = ?', [trimmedName, playerId]);

  return db.get(
    'SELECT id, sqid_id, name, created_at, color FROM players WHERE id = ?',
    [playerId]
  );
}
