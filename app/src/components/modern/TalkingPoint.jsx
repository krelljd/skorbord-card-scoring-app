import { useState } from 'react'
import useRivalryDetails from '../../hooks/useRivalryDetails.js'
import { talkingPoints } from '../../utils/talkingPoints.js'

/**
 * One surprising fact about the series after a game, on the Game Over screen. Tap "Next fact" to step
 * through up to three. It appears once the rivalry loads; the game's own facts are already chips above it.
 */
export const GameOverTalkingPoint = ({ sqid, game }) => {
  const details = useRivalryDetails(sqid, game?.rivalry_id)
  const [index, setIndex] = useState(0)
  const facts = talkingPoints({ context: 'gameover', players: details?.players || [], timeline: details?.timeline || [], gameTypeId: game?.game_type_id })
  if (!facts.length) return null
  const shown = facts[Math.min(index, facts.length - 1)]

  return (
    <div className="go-tp" data-testid="talking-point">
      <span className="go-tp-label">Talking point</span>
      <p className="go-tp-text" aria-live="polite" key={shown.id}>{shown.text}</p>
      {facts.length > 1 && (
        <button type="button" className="go-tp-next" onClick={() => setIndex((i) => (i + 1) % facts.length)}>
          Next fact · {Math.min(index, facts.length - 1) + 1} of {facts.length}
        </button>
      )}
    </div>
  )
}

const LABELS = { streak: 'Heading in', series: 'On the line', 'recent-type': 'In form', 'owns-type': 'In form' }

/**
 * Before the first deal: up to two facts about the picked players and game type.
 * Shows only when everyone picked is a saved player and they have a rivalry with enough games.
 */
export const PregameTalkingPoints = ({ sqid, rivalries = [], picked = [], gameTypeId }) => {
  const ids = picked.map((p) => p.id)
  const known = picked.length >= 2 && ids.every(Boolean)
  const rivalry = known
    ? rivalries.find((r) => r.players?.length === ids.length && r.players.every((p) => ids.includes(p.id)))
    : null
  const details = useRivalryDetails(sqid, rivalry?.id)
  if (!rivalry || !details) return null
  const facts = talkingPoints({ context: 'pregame', players: details.players || [], timeline: details.timeline || [], gameTypeId, max: 2 })
  if (!facts.length) return null

  return (
    <section className="su-sec" aria-label="Talking points" data-testid="pregame-points">
      {facts.map((f) => (
        <div key={f.id} className="su-tp">
          <span className="su-tp-label">{LABELS[f.id] || 'Talking point'}</span>
          <span className="su-tp-text">{f.text}</span>
        </div>
      ))}
    </section>
  )
}
