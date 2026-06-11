/**
 * Builds the single canonical `score_update` event payload broadcast to a
 * sqid room. This is the only score event in the system — there is no
 * client-relayed second event.
 *
 * @param {object} args
 * @param {string} args.sqid
 * @param {string} args.gameId
 * @param {Array}  args.stats - full authoritative stats rows for the game
 * @param {string|null} [args.playerId] - player for the single-tap tally
 * @param {number|null} [args.change] - integer delta for the tally animation
 * @param {string|null} [args.winnerId]
 * @param {string|null} [args.originSocketId] - socket id of the acting client
 * @returns {object}
 */
export function buildScoreUpdatePayload({
  sqid,
  gameId,
  stats,
  playerId = null,
  change = null,
  winnerId = null,
  originSocketId = null
}) {
  return {
    sqid,
    gameId,
    stats,
    playerId,
    change,
    winnerId,
    originSocketId,
    timestamp: new Date().toISOString()
  }
}
