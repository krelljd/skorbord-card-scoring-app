// Pure win-condition evaluation, extracted so it can run against freshly
// fetched data at load time, not only through a stale render-closure ref.
export function computeWinner(game, stats) {
  if (!game || game.finalized) return null

  const winCondition = game.win_condition_value
  const winConditionType = game.win_condition_type

  if (winConditionType === 'win') {
    // Win condition: first player to reach the target score (must be positive)
    const qualified = stats.filter(stat => stat.score >= winCondition && stat.score > 0)
    return qualified.length
      ? qualified.reduce((max, current) => (current.score > max.score ? current : max))
      : null
  }

  if (winConditionType === 'lose') {
    // Lose condition: when someone hits the target, lowest positive score wins
    const anyLoser = stats.some(stat => stat.score >= winCondition)
    if (!anyLoser) return null
    const eligible = stats.filter(stat => stat.score > 0)
    return eligible.length
      ? eligible.reduce((min, current) => (current.score < min.score ? current : min))
      : null
  }

  return null
}
