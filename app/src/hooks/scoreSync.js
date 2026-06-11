/**
 * Decide whether a received score_update should trigger the "+N" tally
 * animation on this client.
 *
 * The acting client already showed its own (accumulated) tally locally, so it
 * must NOT re-animate from its own broadcast. Only single-player taps
 * (playerId present) animate.
 *
 * @param {{ playerId: string|null, originSocketId: string|null }} data
 * @param {string|null} mySocketId
 * @returns {boolean}
 */
export function shouldApplyRemoteTally(data, mySocketId) {
  if (!data || data.playerId == null) return false
  return data.originSocketId !== mySocketId
}
