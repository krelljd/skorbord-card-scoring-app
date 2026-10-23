import { useEffect, useRef, useState } from 'react'
import useSnarkSetting from '../../hooks/useSnarkSetting.js'
import { pickLine, pickEmptyLine, pickWinnerLine } from '../../utils/snark.js'

/**
 * One snarky line with a Shuffle button. Hidden when the setting is Off or no line applies.
 * context: 'pregame' and 'history' use the rivalry facts, 'empty' needs none, 'winner' is the Game Over line
 * (winner and wins, never the loser). variant picks the look: 'strip' (New game), 'card' (Stats), 'flood' (Game Over).
 */
const SnarkLine = ({ context, facts = null, players = [], winner = '', wins = 0, variant = 'card' }) => {
  const [level] = useSnarkSetting()
  const [line, setLine] = useState(null)
  const lastId = useRef(null)

  const choose = (avoid) => {
    if (context === 'empty') return pickEmptyLine({ level, lastId: avoid })
    if (context === 'winner') return pickWinnerLine({ level, winner, wins, lastId: avoid })
    return pickLine({ level, context, facts, players, lastId: avoid })
  }

  // A new line whenever what it is about changes (a rivalry loads, the picked players change, the setting changes)
  const about = JSON.stringify([level, context, facts, players.map((p) => p.id), winner, wins])
  useEffect(() => {
    const next = choose(null)
    lastId.current = next?.id || null
    setLine(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [about])

  if (!line) return null
  const shuffle = () => {
    const next = choose(lastId.current)
    lastId.current = next?.id || null
    setLine(next)
  }

  return (
    <div className={`sn sn-${variant}`} data-testid="snark-line">
      <span className="sn-label">Snark</span>
      <p className="sn-text" aria-live="polite" key={line.id}>{line.text}</p>
      <button type="button" className="sn-shuffle" onClick={shuffle} aria-label="Shuffle snark line">Shuffle</button>
    </div>
  )
}

export default SnarkLine
