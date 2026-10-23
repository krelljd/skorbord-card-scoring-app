import { useMemo, useState } from 'react'
import NumberPad from './NumberPad.jsx'
import PartSheet from './PartSheet.jsx'
import CountUp from './CountUp.jsx'
import RoundReplay from './RoundReplay.jsx'
import LeadBand from './LeadBand.jsx'
import { gameStory } from '../../utils/gameStory.js'
import { polylineLength } from '../../utils/motion.js'
import { PARTS, PART_LABELS } from '../../utils/cribbage.js'

/**
 * Score history: a summary card (totals, progress and averages so far), the totals chart, then one card
 * per saved round, newest first, with each player's points and running total and average.
 * Tap a saved score to correct it.
 * Games from before round tracking show one "Earlier" card with totals only.
 */
// Same palette as the player cards, so a player keeps one color everywhere
const playerColor = (i) => `var(--pc-${i % 8})`
// colorOrder (optional) lists player ids in the order another screen colors them, so a player keeps one color there
const colorIndexOf = (colorOrder, playerId, i) => {
  const k = colorOrder ? colorOrder.indexOf(playerId) : -1
  return k >= 0 ? k : i
}
const round1 = (n) => Math.round(n * 10) / 10

/** Running totals after each saved round, one line per player, with the goal line when the game has one. */
const TotalsChart = ({ players, rows, target, colorOrder, upTo = rows.length, animate = true }) => {
  if (rows.length < 2) return null
  const W = 340
  const H = 150
  const padL = 26
  const padR = 34
  const padT = 10
  const padB = 18
  const all = rows.flatMap((r) => r.cells.map((c) => c.running))
  const max = target || Math.max(1, ...all)
  const x = (i) => padL + (i * (W - padL - padR)) / (rows.length - 1)
  const y = (v) => H - padB - (Math.max(0, v) * (H - padT - padB)) / max
  const ticks = [0, Math.round(max / 3), Math.round((2 * max) / 3), max]
  const shown = Math.max(1, Math.min(upTo, rows.length))
  const last = rows[shown - 1].cells
  // Nudge end labels apart when the two leaders finish close together
  const labelY = (pi) => {
    const mine = y(last[pi].running)
    const crowded = last.some((c, k) => k !== pi && Math.abs(y(c.running) - mine) < 12)
    return mine + 3 + (crowded ? (pi % 2 ? 9 : -3) : 0)
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img" aria-label="Running totals by round">
      {ticks.map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--color-base-300)" strokeWidth={target && g === max ? 1.5 : 1} strokeDasharray={target && g === max ? undefined : '3 3'} />
          <text x={padL - 4} y={y(g) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity=".7">{g}</text>
        </g>
      ))}
      {target && <text x={W - padR + 3} y={y(max) + 3} fontSize="8" fill="currentColor" opacity=".7" fontFamily="ui-monospace, monospace">GOAL</text>}
      {rows.map((r, i) => (
        <text key={r.round.round_number} x={x(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="currentColor" opacity=".7">{i + 1}</text>
      ))}
      {players.map((p, pi) => {
        const color = playerColor(colorIndexOf(colorOrder, p.player_id, pi))
        const line = rows.slice(0, shown).map((r, i) => [x(i), y(r.cells[pi].running)])
        return (
        <g key={p.player_id}>
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={animate ? 'rh-draw' : undefined}
            style={animate ? { '--len': polylineLength(line) } : undefined}
            points={line.map((pt) => pt.join(',')).join(' ')}
          />
          <circle className={animate ? 'rh-pop' : undefined} cx={x(shown - 1)} cy={y(last[pi].running)} r="4" fill={color} />
          <text className={animate ? 'rh-pop' : undefined} x={x(shown - 1) + 7} y={labelY(pi)} fontSize="11" fontWeight="800" fill={color}>{last[pi].running}</text>
        </g>
        )
      })}
    </svg>
  )
}

const RoundHistory = ({ roundState, onEdit, onClose, canEdit, colorOrder, title = 'Score history', subtitle }) => {
  const [editing, setEditing] = useState(null)
  const [replaying, setReplaying] = useState(false)
  const tracksParts = Array.isArray(roundState?.game?.score_parts) && roundState.game.score_parts.length > 0
  const target = roundState?.game?.win_condition_type === 'win' ? Number(roundState.game.win_condition_value) || null : null

  const { players, rows, totals, averages, partAverages } = useMemo(() => {
    const players = roundState?.players || []
    const running = {}
    const realRunning = {}
    let realCount = 0
    const rows = (roundState?.rounds || [])
      .filter((r) => r.status === 'committed')
      .map((r) => {
        if (!r.is_backfill) realCount += 1
        const cells = players.map((p) => {
          running[p.player_id] = (running[p.player_id] || 0) + (r.scores[p.player_id] || 0)
          if (!r.is_backfill) realRunning[p.player_id] = (realRunning[p.player_id] || 0) + (r.scores[p.player_id] || 0)
          return {
            playerId: p.player_id,
            points: r.scores[p.player_id] || 0,
            running: running[p.player_id],
            // Average per round so far; the earlier row is not a round, so it has none
            avg: r.is_backfill ? null : round1(realRunning[p.player_id] / realCount),
            edited: Boolean(r.edited[p.player_id])
          }
        })
        return { round: r, cells }
      })
    const totals = players.map((p) => running[p.player_id] || 0)
    // Averages use real rounds only; the "Earlier" row holds old totals, not a round
    const real = rows.filter((r) => !r.round.is_backfill)
    const averages = players.map((p, i) =>
      real.length ? round1(real.reduce((sum, r) => sum + r.cells[i].points, 0) / real.length) : null
    )
    // Average per part over rounds that have parts (older rounds are skipped).
    // The crib average only counts rounds the player dealt.
    const partAverages = PARTS.map((part) =>
      players.map((p) => {
        const tracked = real.filter((r) => r.round.parts?.[p.player_id])
        const list = part === 'crib' ? tracked.filter((r) => r.round.dealer_id === p.player_id) : tracked
        if (list.length === 0) return null
        const sum = list.reduce((total, r) => total + r.round.parts[p.player_id][part], 0)
        return round1(sum / list.length)
      })
    )
    return { players, rows, totals, averages, partAverages }
  }, [roundState])

  const story = useMemo(() => gameStory(roundState), [roundState])

  const canReplay = rows.filter((r) => !r.round.is_backfill).length >= 2
  const leader = totals.length > 1 && Math.max(...totals) > 0 ? totals.indexOf(Math.max(...totals)) : -1
  const nameOf = (id) => players.find((p) => p.player_id === id)?.player_name
  // Avg/rnd first, then one tile per part that anyone has data for
  const statTiles = (i) => [
    { key: 'avg', label: 'Avg/rnd', value: averages[i], main: true },
    ...PARTS.map((part, k) => ({ key: part, label: PART_LABELS[part], value: partAverages[k][i], show: partAverages[k].some((a) => a !== null) })).filter((t) => t.show)
  ]

  const save = async (points) => {
    const target = editing
    setEditing(null)
    await onEdit(target.round.round_number, target.playerId, points, target.round.revision)
  }

  // The sheet reads the live round, since each correction bumps its revision
  const liveRound = editing ? (roundState?.rounds || []).find((r) => r.round_number === editing.round.round_number) : null
  const sheetParts = editing ? liveRound?.parts?.[editing.playerId] : null

  return (
    <div className="modal modal-open" role="dialog" aria-label={title}>
      {/* daisyUI caps the box at 100vh, which on iPhone Safari is taller than the visible area, so the top
          (title, toggle, Close) ends up off screen and cannot be scrolled to. Cap it at the dynamic viewport
          instead, keep the header fixed and scroll only the body. */}
      <div className="modal-box max-w-3xl flex flex-col p-0 max-h-[calc(100dvh-1.5rem)]">
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-3 border-b border-base-300 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-lg">{title}</h3>
            {subtitle && <div className="pc-label truncate">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            {canReplay && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setReplaying((on) => !on)} aria-pressed={replaying}>
                {replaying ? 'Stop replay' : 'Replay'}
              </button>
            )}
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 flex-1 min-h-0">
          {rows.length === 0 ? (
            <p className="text-base-content/70 py-6 text-center">
              No saved rounds yet. Tap Next round to save the first one.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {replaying && canReplay ? (
                <RoundReplay players={players} rows={rows} target={target} colors={players.map((p, i) => playerColor(colorIndexOf(colorOrder, p.player_id, i)))} onDone={() => setReplaying(false)}
                  renderChart={(upTo) => <TotalsChart players={players} rows={rows} target={target} colorOrder={colorOrder} upTo={upTo} animate={false} />} />
              ) : (
              <>
              <div className="rh-summary">
                <span className="pc-label">{subtitle ? 'Final' : 'Game so far'} · {rows.filter((r) => !r.round.is_backfill).length} rounds</span>
                {players.map((p, i) => (
                  <div key={p.player_id} className="flex flex-col gap-2" style={{ '--c': playerColor(colorIndexOf(colorOrder, p.player_id, i)) }} data-testid="summary-player">
                    <div className="flex items-center gap-2">
                      <div className="pc-avatar" aria-hidden="true">{p.player_name.trim().charAt(0).toUpperCase()}</div>
                      <span className="flex-1 min-w-0 truncate font-bold">
                        {p.player_name}
                        {i === leader && <span className="pc-label ml-2" style={{ color: 'var(--c)' }}>Leads</span>}
                      </span>
                      <span className="pc-score rh-total">{totals[i]}</span>
                    </div>
                    {target && (
                      <div className="pc-track" role="progressbar" aria-label={`${p.player_name} progress to ${target}`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.max(0, totals[i])}>
                        <i style={{ width: `${Math.max(0, Math.min(100, Math.round((totals[i] / target) * 100)))}%` }} />
                      </div>
                    )}
                    <div className="rh-stats">
                      {statTiles(i).map((t) => (
                        <div key={t.key} className={`rh-stat ${t.main ? 'rh-stat-main' : ''}`}>
                          <div className="rh-stat-v">{t.value ?? '–'}</div>
                          <div className="pc-label">{t.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {tracksParts && <span className="rh-note">Crib average counts only rounds that player dealt.</span>}
              </div>

              <LeadBand story={story} players={players} colors={players.map((p, i) => playerColor(colorIndexOf(colorOrder, p.player_id, i)))} />

              <TotalsChart players={players} rows={rows} target={target} colorOrder={colorOrder} />
              </>
              )}

              <span className="pc-label mt-1">Rounds · newest first{canEdit ? ' · tap a score to correct' : ''}</span>
              {[...rows].reverse().map(({ round, cells }, idx) => (
                <div key={round.round_number} className="rh-round rh-in" style={{ animationDelay: `${Math.min(idx, 8) * 60}ms` }} data-testid="round-card">
                  <div className="flex items-center">
                    <span className="pc-label flex-1">
                      {round.is_backfill ? 'Earlier rounds' : `Round ${round.round_number}${nameOf(round.dealer_id) ? ` · ${nameOf(round.dealer_id)} dealt` : ''}`}
                    </span>
                    <span className="pc-label">Total{round.is_backfill ? '' : ' · Avg'}</span>
                  </div>
                  {cells.map((cell, i) => (
                    <button
                      key={cell.playerId}
                      type="button"
                      className="flex items-center gap-2 min-h-11 w-full disabled:cursor-default"
                      style={{ '--c': playerColor(colorIndexOf(colorOrder, cell.playerId, i)) }}
                      disabled={!canEdit}
                      onClick={() => setEditing({ round, playerId: cell.playerId, points: cell.points })}
                      aria-label={`Edit round ${round.round_number} for ${nameOf(cell.playerId)}`}
                    >
                      <div className="pc-avatar rh-mini" aria-hidden="true">{nameOf(cell.playerId).trim().charAt(0).toUpperCase()}</div>
                      <span className="flex-1 min-w-0 truncate text-left text-sm font-semibold">{nameOf(cell.playerId)}</span>
                      {round.parts?.[cell.playerId] && (
                        <span className="rh-parts" data-testid="cell-parts">
                          {PARTS.filter((k) => k !== 'crib' || round.dealer_id === cell.playerId)
                            .map((k) => round.parts[cell.playerId][k])
                            .join(' / ')}
                        </span>
                      )}
                      <span className="rh-chip">
                        <CountUp value={cell.points} prefix={cell.points > 0 ? '+' : ''} delay={Math.min(idx, 8) * 60 + 250} />
                        {cell.edited && <span className="text-warning" title="Corrected"> •</span>}
                      </span>
                      <span className="rh-run">
                        <b><CountUp value={cell.running} delay={Math.min(idx, 8) * 60 + 250} /></b>
                        {cell.avg !== null && <i>avg {cell.avg}</i>}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              <p className="rh-note">Chip is the points that round. Large number is the running total. • marks a corrected score.</p>
            </div>
          )}
        </div>
      </div>

      {editing && sheetParts && (
        <PartSheet
          title="Correct points"
          subtitle={`Round ${editing.round.round_number} · ${players.find((p) => p.player_id === editing.playerId)?.player_name}`}
          parts={sheetParts}
          isDealer={liveRound.dealer_id === editing.playerId}
          quickPlay={false}
          onSetPart={(part, value) => onEdit(liveRound.round_number, editing.playerId, value, liveRound.revision, part)}
          onClose={() => setEditing(null)}
        />
      )}

      {editing && !sheetParts && (
        <NumberPad
          title="Correct score"
          subtitle={`Round ${editing.round.is_backfill ? '(earlier)' : editing.round.round_number} · ${players.find((p) => p.player_id === editing.playerId)?.player_name}`}
          initial={editing.points}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

export default RoundHistory
