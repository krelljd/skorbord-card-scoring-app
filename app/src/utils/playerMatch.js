const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Edit distance, capped: returns max+1 as soon as it is certain to exceed max. */
function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

/**
 * Compare a typed name with the known players.
 * exact: same name ignoring case and spacing (use that player).
 * near: a close but different name worth a "Did you mean" nudge.
 */
export function matchPlayerName(typed, players) {
  const t = norm(typed)
  if (!t) return { exact: null, near: null }
  const exact = players.find((p) => norm(p.name) === t) || null
  if (exact) return { exact, near: null }
  const near = players.find((p) => {
    const n = norm(p.name)
    if (!n) return false
    if (t.length >= 3 && (n.startsWith(t) || t.startsWith(n))) return true
    return distance(t, n, 1) <= 1 && Math.min(t.length, n.length) >= 3
  }) || null
  return { exact: null, near }
}

/** Most played first, then alphabetical, so the usual people are at the front. */
export function sortPlayersForChips(players) {
  return [...players].sort((a, b) => (Number(b.games_played) || 0) - (Number(a.games_played) || 0) || norm(a.name).localeCompare(norm(b.name)))
}

/** Favorites first, keeping the given order inside each group. */
export function sortGameTypesForChips(gameTypes) {
  return [...gameTypes.filter((g) => g.is_favorited), ...gameTypes.filter((g) => !g.is_favorited)]
}
