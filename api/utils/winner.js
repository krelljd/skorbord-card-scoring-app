/**
 * The single win rule, used by the server for every game. It matches the rule
 * the app uses (app/src/hooks/winnerLogic.js) so both sides agree.
 *
 * "win" games: the highest score at or above the target wins (target must be positive).
 * "lose" games: once any player reaches the target, the lowest positive score wins.
 *
 * The target comes from the game's own win_condition_type/value (custom per game),
 * falling back to the game type's defaults.
 *
 * @param {object} game - games row, joined with game_types columns when available
 * @param {Array<{ player_id: string, score: number }>} scores
 * @returns {string|null} winning player id, or null when nobody has won yet
 */
export function computeWinner(game, scores) {
  if (!game || !Array.isArray(scores) || scores.length === 0) return null;

  const { type, value } = resolveWinCondition(game);
  if (!type || value === null || value === undefined) return null;

  if (type === 'win') {
    const qualified = scores.filter((s) => s.score >= value && s.score > 0);
    if (qualified.length === 0) return null;
    return qualified.reduce((best, s) => (s.score > best.score ? s : best)).player_id;
  }

  if (type === 'lose') {
    if (!scores.some((s) => s.score >= value)) return null;
    const eligible = scores.filter((s) => s.score > 0);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, s) => (s.score < best.score ? s : best)).player_id;
  }

  return null;
}

/**
 * @param {object} game
 * @returns {{ type: 'win'|'lose'|null, value: number|null }}
 */
export function resolveWinCondition(game) {
  if (game.win_condition_type && game.win_condition_value) {
    return { type: game.win_condition_type, value: game.win_condition_value };
  }
  if (game.is_win_condition === undefined || game.is_win_condition === null) {
    return { type: null, value: null };
  }
  return game.is_win_condition
    ? { type: 'win', value: game.win_condition }
    : { type: 'lose', value: game.loss_condition };
}
