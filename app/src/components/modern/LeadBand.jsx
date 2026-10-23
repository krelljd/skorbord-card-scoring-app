/**
 * Who led after each saved round: one cell per round, colored by the leader, dashed on a tie for first.
 * A pointer marks the swing round. mode "players" uses each player's color (Score history).
 * mode "neutral" is for Game Over, whose background is the winner's color: the winner's rounds are
 * solid and everyone else's are faded, so nothing depends on matching the background.
 */
const W = 340
const PAD = 4
const CELL_H = 18

const labelEvery = (n) => (n <= 12 ? 1 : n <= 24 ? 2 : 5)

/** "Jess rounds 1–6, Alex rounds 7–11": the band in words, for screen readers. */
export function bandSummary(cells, nameOf) {
  const runs = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last && last.leaderId === c.leaderId) last.to = c.round
    else runs.push({ leaderId: c.leaderId, from: c.round, to: c.round })
  }
  return runs
    .map((r) => `${r.leaderId ? nameOf(r.leaderId) : 'Tied'} ${r.from === r.to ? `round ${r.from}` : `rounds ${r.from} to ${r.to}`}`)
    .join(', ')
}

const LeadBand = ({ story, players, colors, mode = 'players', winnerId = null }) => {
  if (!story || story.cells.length < 2) return null
  const { cells, swing } = story
  const n = cells.length
  const cw = (W - PAD * 2) / n
  const colorOf = Object.fromEntries(players.map((p, i) => [p.player_id, colors[i]]))
  const nameOf = (id) => players.find((p) => p.player_id === id)?.player_name || 'Someone'
  const every = labelEvery(n)
  const top = swing ? 10 : 2
  const H = top + CELL_H + 16

  const fillOf = (leaderId) => {
    if (!leaderId) return { fill: 'none' }
    if (mode === 'neutral') return { fill: 'currentColor', fillOpacity: leaderId === winnerId ? 1 : 0.3 }
    return { fill: colorOf[leaderId] }
  }
  const swingIndex = swing ? cells.findIndex((c) => c.round === swing.round) : -1

  return (
    <figure className="lb" data-testid="lead-band">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Who led after each round: ${bandSummary(cells, nameOf)}`}>
        {cells.map((c, i) => {
          const x = PAD + i * cw
          const attrs = fillOf(c.leaderId)
          return (
            <g key={c.round}>
              <rect
                className="lb-cell" x={x + 1} y={top} width={Math.max(1, cw - 2)} height={CELL_H} rx="3"
                {...attrs}
                stroke={c.leaderId ? 'none' : 'currentColor'} strokeOpacity=".6" strokeDasharray={c.leaderId ? undefined : '3 2'}
                style={{ animationDelay: `${Math.min(i * 35, 600)}ms` }}
              >
                <title>{`Round ${c.round}: ${c.leaderId ? `${nameOf(c.leaderId)} ahead` : 'tied'}`}</title>
              </rect>
              {(i % every === 0 || i === n - 1) && (
                <text x={x + cw / 2} y={top + CELL_H + 11} textAnchor="middle" fontSize="9" fill="currentColor" opacity=".7">{c.round}</text>
              )}
            </g>
          )
        })}
        {swingIndex >= 0 && (
          <polygon
            points={`${PAD + swingIndex * cw + cw / 2 - 4},1 ${PAD + swingIndex * cw + cw / 2 + 4},1 ${PAD + swingIndex * cw + cw / 2},8`}
            fill="currentColor"
          >
            <title>{`Swing round ${swing.round}`}</title>
          </polygon>
        )}
      </svg>
      <figcaption className="lb-cap">
        {mode === 'neutral' ? (
          <span>Solid: {nameOf(winnerId)} ahead · faded: someone else · dashed: tied</span>
        ) : (
          <>
            {players.map((p, i) => (
              <span key={p.player_id} className="lb-key"><i style={{ background: colors[i] }} />{p.player_name}</span>
            ))}
            <span className="lb-key"><i className="lb-tie" />Tied</span>
            {swing && <span className="lb-key">▼ Swing round</span>}
          </>
        )}
      </figcaption>
    </figure>
  )
}

export default LeadBand
