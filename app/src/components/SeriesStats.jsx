import React from 'react'
import { currentStreak, longestStreaks, barHeights, gameTypeOwner, pointsShares, differentialNote } from '../utils/seriesStats.js'

const colorOf = (index) => ({ '--c': `var(--pc-${index % 8})` })
const MIN_GAMES = 3
const CHART_GAMES = 40 // the API sends the whole history; the chart draws only the latest games

const W = 340
const PAD = 8
const LANE_LABEL = 16 // room for each player's initial at the left of a lane
const BAR_ROOM = 24 // tallest bar, in px

const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

/**
 * One column per finished game, oldest to newest. Two players: the winner's bar goes up for the first
 * player and down for the second. Three or more: one lane per player, with the bar in the winner's lane.
 * Bar height is the winning margin. The current streak is boxed. Tap a bar to open that game's history.
 */
export function SeriesTimeline({ timeline = [], players = [], onOpenGame }) {
  const indexOf = Object.fromEntries(players.map((p, i) => [p.id, i]))
  const all = timeline.filter((g) => indexOf[g.winner_id] !== undefined)
  const games = all.slice(-CHART_GAMES)
  if (games.length < MIN_GAMES || players.length < 2) return null

  const nameOf = (id) => players.find((p) => p.id === id)?.name
  const heights = barHeights(games)
  const streak = currentStreak(all)
  const best = longestStreaks(all).best
  // The current streak is the longest one on record: say it once
  const longest = best.playerId === streak.playerId && best.length === streak.length ? { length: 0 } : best

  const split = players.length === 2
  const laneH = BAR_ROOM + 6
  const H = split ? BAR_ROOM * 2 + 16 : players.length * laneH + 4
  const left = split ? PAD : PAD + LANE_LABEL
  const col = (W - left - PAD) / games.length
  const bw = Math.min(col - 2, 18)
  const x = (i) => left + i * col + (col - bw) / 2
  // baseline of the winner's lane: the middle line for two players, the lane floor for more
  const baseline = (pi) => (split ? H / 2 : (pi + 1) * laneH - 2)

  const boxStart = streak.length >= 2 ? games.length - streak.length : -1

  return (
    <section className="st-card" aria-labelledby="st-series">
      <h4 id="st-series" className="st-lbl">Series · last {games.length} games</h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label="Series timeline, oldest game first">
        {split ? (
          <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} stroke="var(--color-base-300)" />
        ) : (
          players.map((p, pi) => (
            <g key={p.id}>
              <line x1={left} x2={W - PAD} y1={baseline(pi)} y2={baseline(pi)} stroke="var(--color-base-300)" strokeDasharray="2 3" />
              <text x={PAD} y={baseline(pi) - 2} fontSize="11" fontWeight="800" fill={`var(--pc-${pi % 8})`}>{(p.name || '?').charAt(0).toUpperCase()}</text>
            </g>
          ))
        )}
        {boxStart >= 0 && (
          <g>
            <rect
              x={x(boxStart) - 3} y="2" width={x(games.length - 1) + bw - x(boxStart) + 6} height={H - 4}
              rx="6" fill="none" stroke={`var(--pc-${indexOf[streak.playerId] % 8})`} strokeDasharray="3 3"
            />
          </g>
        )}
        {games.map((g, i) => {
          const pi = indexOf[g.winner_id]
          const h = heights[i] * BAR_ROOM
          const up = !split || pi === 0
          const y = up ? baseline(pi) - h : baseline(pi)
          const label = `${nameOf(g.winner_id)} won ${g.game_type_name || 'a game'}${g.ended_at ? ` on ${dateText(g.ended_at)}` : ''} by ${g.margin}. Open score history.`
          const open = () => onOpenGame?.(g)
          return (
            <g
              key={g.id} role="button" tabIndex={0} aria-label={label} className="sr-bar"
              onClick={open}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
            >
              <title>{`${nameOf(g.winner_id)} · ${g.game_type_name} · +${g.margin}`}</title>
              <rect x={x(i) - (col - bw) / 2} y="0" width={col} height={H} fill="transparent" />
              <rect
                className="sr-grow" x={x(i)} y={y} width={bw} height={h} rx="3"
                fill={`var(--pc-${pi % 8})`}
                opacity={boxStart >= 0 && i < boxStart ? 0.45 : 1}
                style={{ transformOrigin: `${x(i) + bw / 2}px ${baseline(pi)}px`, animationDelay: `${Math.min(i * 18, 500)}ms` }}
              />
            </g>
          )
        })}
      </svg>
      {split && (
        <div className="flex justify-between st-key" aria-hidden="true">
          <span style={colorOf(0)}><b className="st-name">{players[0].name}</b> wins up</span>
          <span style={colorOf(1)}><b className="st-name">{players[1].name}</b> wins down</span>
        </div>
      )}
      {!split && (
        <ul className="st-key mt-1 flex flex-wrap gap-x-3" aria-hidden="true">
          {players.map((p, i) => <li key={p.id} style={colorOf(i)}><b className="st-name">{p.name}</b></li>)}
        </ul>
      )}
      {(streak.length >= 2 || longest.length >= 2) && (
        <div className="st-chips mt-2">
          {streak.length >= 2 && (
            <span className="st-chip" style={colorOf(indexOf[streak.playerId])}>
              Current streak <b className="st-name">{nameOf(streak.playerId)} {streak.length}</b>
            </span>
          )}
          {longest.length >= 2 && (
            <span className="st-chip" style={colorOf(indexOf[longest.playerId])}>
              Longest streak <b className="st-name">{nameOf(longest.playerId)} {longest.length}</b>
            </span>
          )}
        </div>
      )}
    </section>
  )
}

/** One tile per game type: who has the most wins, or "Even" when first place is tied. */
export function GameTypeOwners({ gameTypes = [], players = [], playerStats = {} }) {
  if (gameTypes.length < 2 || players.length < 2) return null
  const tiles = gameTypes.map((gt) => {
    const rows = players.map((p) => {
      const byType = playerStats[p.id] || playerStats[p.name] || {}
      const s = byType[gt.id] || byType[gt.game_type_id] || {}
      return { id: p.id, name: p.name, wins: Number(s.wins) || 0 }
    })
    return { gt, ...gameTypeOwner(rows), index: (id) => players.findIndex((p) => p.id === id) }
  })
  const totalGames = tiles.reduce((sum, t) => sum + t.total, 0)
  if (totalGames < MIN_GAMES) return null

  return (
    <section className="st-card" aria-labelledby="st-owners">
      <h4 id="st-owners" className="st-lbl">Who owns each game</h4>
      <ul className="so-tiles">
        {tiles.map(({ gt, owner, tied, wins, total, index }) => (
          <li key={gt.id} className="so-tile" style={owner ? colorOf(index(owner.id)) : undefined}>
            <div className="st-key">{gt.name}</div>
            <div className={`so-owner ${owner ? 'st-name' : ''}`}>{total === 0 ? '–' : tied ? 'Even' : owner.name}</div>
            <div className="st-key">{total === 0 ? 'No games' : `${wins} of ${total} ${wins === 1 ? 'win' : 'wins'}`}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Lifetime points in one game type as a split bar, with a note when the wins leader is not the points leader. */
export function PointsSplit({ pointsTotals, players = [], gameTypeId, wins = [], higherIsBetter = true }) {
  const shares = pointsShares(pointsTotals, players, gameTypeId)
  const games = wins.reduce((sum, r) => sum + r.wins, 0)
  if (!shares || games < MIN_GAMES) return null
  const note = differentialNote(shares, wins, higherIsBetter)
  const title = players.length > 2 ? 'Share of points' : 'Points scored'
  const aria = shares.map((s) => `${s.name} ${s.points}`).join(', ')

  return (
    <section className="st-card" aria-labelledby="st-points">
      <h4 id="st-points" className="st-lbl">{title} · all games</h4>
      <div className="flex justify-between text-sm font-semibold" aria-hidden="true">
        {shares.map((s, i) => (
          <span key={s.id} style={colorOf(i)} className="st-name">{s.name} {s.points.toLocaleString()}</span>
        ))}
      </div>
      <div className="st-split" role="img" aria-label={aria}>
        {shares.map((s, i) => <i key={s.id} style={{ ...colorOf(i), flex: s.points }} />)}
      </div>
      {note && <div className="st-chips mt-2"><span className="st-chip">{note}</span></div>}
    </section>
  )
}
