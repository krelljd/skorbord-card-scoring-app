import React, { useState } from 'react'
import {
  rankPlayers, headToHeadLabel, rankLabel, winPct, marginText,
  formLetters, formSummary, scoreLine, fmt
} from '../utils/statsView'

const colorOf = (index) => ({ '--c': `var(--pc-${index % 8})` })

const Pill = ({ name, index }) => (
  <span className="st-pill" style={colorOf(index)} aria-hidden="true">{(name || '?').charAt(0).toUpperCase()}</span>
)

const FormDots = ({ results }) => {
  const letters = formLetters(results)
  if (!letters.length) return <span className="st-key">No games yet</span>
  return (
    <span className="st-dots" role="img" aria-label={formSummary(letters)}>
      {letters.map((c, i) => <i key={i} className={`st-dot st-dot-${c}`}>{c}</i>)}
    </span>
  )
}

const Tile = ({ value, label }) => (
  <div className="st-tile">
    <div className="st-tile-v">{value}</div>
    <div className="st-key">{label}</div>
  </div>
)

function RecentGames({ games, players, directionByName }) {
  if (!games?.length) return null
  return (
    <section className="st-card" aria-labelledby="st-recent">
      <h4 id="st-recent" className="st-lbl">Recent games</h4>
      <ul>
        {games.slice(0, 5).map((game) => {
          const idx = players.findIndex((p) => p.id === game.winner_id)
          const winnerName = game.winner_name || players[idx]?.name || 'Unknown'
          const date = game.completed_at
            ? new Date(game.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : ''
          const higher = directionByName[game.game_type_name] !== false
          return (
            <li key={game.id} className="st-game">
              <Pill name={winnerName} index={Math.max(idx, 0)} />
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{winnerName} won</div>
                <div className="st-key">{[date, game.game_type_name].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="st-score">{scoreLine(game.player_scores, game.winner_id, higher)}</div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function GameTypeTabs({ gameTypes, selected, onSelect }) {
  if (gameTypes.length < 2) return null
  return (
    <div className="st-seg" role="tablist" aria-label="Game type">
      {gameTypes.map((gt) => (
        <button
          key={gt.id}
          type="button"
          role="tab"
          aria-selected={selected === gt.id}
          className={selected === gt.id ? 'st-seg-on' : ''}
          onClick={() => onSelect(gt.id)}
        >
          {gt.name}
        </button>
      ))}
    </div>
  )
}

function PlayerCard({ entry, compact, higherIsBetter }) {
  const { player, index, stats, rs, label } = entry
  const total = Number(stats.total_games) || 0
  const wins = Number(stats.wins) || 0
  const losses = Number(stats.losses) || 0
  const tiles = [
    [fmt(rs?.avg_round), 'Avg round'],
    [fmt(rs?.best_round?.points), higherIsBetter ? 'Best round' : 'Best (low)'],
    ...(compact
      ? [[marginText(stats.max_win_margin, wins, '+'), 'Largest win']]
      : higherIsBetter
        ? [[marginText(stats.max_win_margin, wins, '+'), 'Largest win'], [marginText(stats.max_loss_margin, losses, '-'), 'Largest loss']]
        : [[fmt(rs?.worst_round?.points), 'Worst round'], [marginText(stats.max_win_margin, wins, '+'), 'Largest win']])
  ]

  return (
    <section className={`st-card ${compact ? 'st-card-compact' : ''}`} style={colorOf(index)} aria-label={player.name}>
      <div className="st-head">
        <Pill name={player.name} index={index} />
        <div className="min-w-0">
          <h4 className="font-bold truncate st-name">{player.name}</h4>
          {compact && <div className="st-key">{wins} of {total} games</div>}
        </div>
        {compact ? (
          <div className="ml-auto text-right">
            <div className="st-pct st-pct-sm">{winPct(wins, total)}</div>
            <div className="st-key">{label}</div>
          </div>
        ) : (
          <span className="st-key ml-auto">{label}</span>
        )}
      </div>
      {compact ? (
        <div className="mb-2"><FormDots results={stats.last_10_results} /></div>
      ) : (
        <div className="st-big">
          <div>
            <div className="st-pct">{winPct(wins, total)}</div>
            <div className="st-key">{wins} of {total} games</div>
          </div>
          <FormDots results={stats.last_10_results} />
        </div>
      )}
      <div className="st-tiles" style={{ '--n': compact ? 3 : 2 }}>
        {tiles.map(([v, k]) => <Tile key={k} value={v} label={k} />)}
      </div>
    </section>
  )
}

const SHADES = [1, 0.6, 0.3]

function PartsCard({ entries }) {
  const withParts = entries.filter((e) => e.rs?.parts)
  if (!withParts.length) return null
  return (
    <section className="st-card" aria-labelledby="st-parts">
      <h4 id="st-parts" className="st-lbl">Where points come from</h4>
      {withParts.map(({ player, index, rs }) => {
        const p = rs.parts
        const shares = [p.share_play, p.share_hand, p.share_crib].map((n) => Number(n) || 0)
        return (
          <div key={player.id} className="st-part" style={colorOf(index)}>
            <div className="flex justify-between text-xs">
              <b className="st-name">{player.name}</b>
              <span className="st-key">avg per round: play {fmt(p.avg_play)} · hand {fmt(p.avg_hand)} · crib {fmt(p.avg_crib)}</span>
            </div>
            <div className="st-split" role="img" aria-label={`${player.name}: play ${shares[0]}%, hand ${shares[1]}%, crib ${shares[2]}%`}>
              {shares.map((s, i) => <i key={i} style={{ flex: s, opacity: SHADES[i] }} />)}
            </div>
            <div className="st-legend">
              <span>Play {fmt(p.share_play)}%</span><span>Hand {fmt(p.share_hand)}%</span><span>Crib {fmt(p.share_crib)}%</span>
            </div>
            <div className="st-key mt-1">Best hand {fmt(p.best_hand)} · best crib {fmt(p.best_crib)} · {p.rounds_tracked} rounds</div>
          </div>
        )
      })}
    </section>
  )
}

function SkunksCard({ entries }) {
  const withSkunks = entries.filter((e) => e.rs?.skunks)
  if (!withSkunks.length) return null
  return (
    <section className="st-card" aria-labelledby="st-skunks">
      <h4 id="st-skunks" className="st-lbl">Skunks given / received</h4>
      <div className="st-chips">
        {withSkunks.map(({ player, index, rs }) => {
          const s = rs.skunks
          const dbl = (n) => (n ? ` (${n})` : '')
          return (
            <span key={player.id} className="st-chip" style={colorOf(index)}>
              <b className="st-name">{player.name}</b>
              <b>{s.skunks_given}{dbl(s.double_skunks_given)}</b>
              <span className="st-key">/ {s.skunks_received}{dbl(s.double_skunks_received)}</span>
            </span>
          )
        })}
      </div>
      <div className="st-key mt-2">Double skunks in brackets.</div>
    </section>
  )
}

/**
 * Detail view for one rivalry: recent games first, then a tab per game type with a
 * card per player (full card for two players, compact ranked cards for three or more).
 */
export default function RivalryStatsDetail({ details, gameTypes, players, onBack, backToSetup, error, loading }) {
  const [selectedType, setSelectedType] = useState(null)
  const activeId = gameTypes.some((g) => g.id === selectedType) ? selectedType : gameTypes[0]?.id
  const gt = gameTypes.find((g) => g.id === activeId)
  const higherIsBetter = gt ? gt.is_win_condition !== 0 && gt.is_win_condition !== false : true
  const directionByName = Object.fromEntries(gameTypes.map((g) => [g.name, g.is_win_condition !== 0 && g.is_win_condition !== false]))

  const playerStats = details.player_stats || {}
  const roundStats = details.round_stats || {}
  const compact = players.length > 2

  const statsFor = (player) => {
    const byType = playerStats[player.id] || playerStats[player.name] || {}
    return byType[gt.id] || byType[gt.game_type_id] || {}
  }
  const base = players.map((player, index) => ({
    player, index, stats: statsFor(player), rs: roundStats[player.id]?.[gt.id || gt.game_type_id]
  }))
  const { order, rankById } = rankPlayers(base.map((b) => ({ id: b.player.id, wins: Number(b.stats.wins) || 0 })))
  const entries = order.map(({ id }) => {
    const e = base.find((b) => b.player.id === id)
    const wins = Number(e.stats.wins) || 0
    const other = base.filter((b) => b.player.id !== id).map((b) => Number(b.stats.wins) || 0)
    const rank = rankById[id]
    return { ...e, rank, label: compact ? rankLabel(rank, wins) : headToHeadLabel(wins, other[0] ?? 0) }
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-2">
        <button className="btn btn-ghost min-h-11 min-w-11" onClick={onBack} aria-label="Back to rivalries">←</button>
        <h2 className="text-lg font-bold flex flex-wrap gap-x-1.5">
          {players.map((p, i) => (
            <span key={p.id}>
              <span className="st-name" style={colorOf(i)}>{p.name}</span>
              {i < players.length - 1 && <span className="opacity-60 font-normal"> vs</span>}
            </span>
          ))}
        </h2>
      </div>
      {error && <div className="error-state"><p>{error}</p></div>}
      {loading ? (
        <div className="flex justify-center"><div className="loading-state"></div></div>
      ) : (
        <>
          <RecentGames games={details.recent_games} players={players} directionByName={directionByName} />
          <GameTypeTabs gameTypes={gameTypes} selected={activeId} onSelect={setSelectedType} />
          {!higherIsBetter && <p className="st-note">{gt.name}: lower score wins. Best round is the lowest.</p>}
          {entries.map((entry) => <PlayerCard key={entry.player.id} entry={entry} compact={compact} higherIsBetter={higherIsBetter} />)}
          <PartsCard entries={entries} />
          <SkunksCard entries={entries} />
          <button className="btn btn-primary w-full min-h-11" onClick={backToSetup}>Start New Game</button>
        </>
      )}
    </div>
  )
}
