import { useEffect, useState } from 'react'
import { reducedMotion } from '../../utils/motion.js'

const STEP_MS = 1000

/**
 * Replays a saved game one round at a time: bars race toward the goal, each round's points flash,
 * and the totals chart grows. Play, pause and a slider to scrub.
 * rows: the committed rounds with each player's points and running total, in order.
 * renderChart(upTo): draws the totals chart up to the first upTo rounds.
 */
const RoundReplay = ({ players, rows, target, colors, renderChart, onDone }) => {
  const n = rows.length
  const [step, setStep] = useState(1)
  const [playing, setPlaying] = useState(!reducedMotion())

  useEffect(() => {
    if (!playing) return undefined
    if (step >= n) { setPlaying(false); return undefined }
    const t = setTimeout(() => setStep((s) => Math.min(n, s + 1)), STEP_MS)
    return () => clearTimeout(t)
  }, [playing, step, n])

  const row = rows[step - 1]
  const scale = target || Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.running)))
  const label = row.round.is_backfill ? 'Earlier rounds' : `Round ${row.round.round_number}`
  const atEnd = step >= n
  const togglePlay = () => {
    if (atEnd) { setStep(1); setPlaying(true) } else setPlaying((p) => !p)
  }

  return (
    <div className="rh-summary" data-testid="round-replay">
      <div className="flex items-center gap-2">
        <span className="pc-label flex-1" aria-live="polite">{label} of {rows[n - 1].round.is_backfill ? 'earlier' : rows[n - 1].round.round_number}</span>
        <button type="button" className="btn btn-sm" onClick={togglePlay}>{playing ? 'Pause' : atEnd ? 'Again' : 'Play'}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDone}>Done</button>
      </div>
      {players.map((p, i) => {
        const cell = row.cells[i]
        const prev = step > 1 ? rows[step - 2].cells : null
        const takesLead = prev && cell.running > Math.max(...row.cells.filter((_, k) => k !== i).map((c) => c.running)) &&
          prev[i].running <= Math.max(...prev.filter((_, k) => k !== i).map((c) => c.running))
        return (
          <div key={p.player_id} className="flex items-center gap-2" style={{ '--c': colors[i] }} data-testid="replay-player">
            <div className="pc-avatar" aria-hidden="true">{p.player_name.trim().charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="pc-track" role="progressbar" aria-label={`${p.player_name} progress`} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={Math.max(0, cell.running)}>
                <i className="rh-race" style={{ width: `${Math.max(0, Math.min(100, (cell.running / scale) * 100))}%` }} />
              </div>
              <span key={step} className="rh-gain" style={{ color: 'var(--c)' }}>
                {cell.points > 0 ? `+${cell.points}` : cell.points}{takesLead ? ' · takes the lead' : ''}
              </span>
            </div>
            <span className="pc-score rh-total">{cell.running}</span>
          </div>
        )
      })}
      {renderChart(step)}
      <input type="range" min="1" max={n} value={step} aria-label="Round"
        onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)) }} />
    </div>
  )
}

export default RoundReplay
