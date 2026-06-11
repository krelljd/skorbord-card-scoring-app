import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock the pointer hook so we can count PlayerCard render executions.
vi.mock('../../hooks/usePointerInteraction.js', () => ({
  usePointerInteraction: vi.fn(() => ({
    glowingButton: null,
    handlePointerDown: () => {},
    handlePointerMove: () => {},
    handlePointerUp: () => {},
    handlePointerCancel: () => {},
    handlePointerLeave: () => {}
  }))
}))

import { usePointerInteraction } from '../../hooks/usePointerInteraction.js'
import PlayerCard from './PlayerCard.jsx'

// Stable props (module-level) so memo can bail out for the unchanged card.
const playerA = { id: 'a', name: 'Alice', score: 1 }
const playerB = { id: 'b', name: 'Bob', score: 2 }
const noop = () => {}

function Harness() {
  const [tallyA, setTallyA] = useState(null)
  return (
    <div>
      <button onClick={() => setTallyA({ total: 5, timestamp: 1 })}>bump-a</button>
      <PlayerCard player={playerA} playerIndex={0} tally={tallyA}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
      <PlayerCard player={playerB} playerIndex={1} tally={null}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
    </div>
  )
}

describe('PlayerCard redraw isolation', () => {
  beforeEach(() => {
    usePointerInteraction.mockClear()
  })

  it('re-renders only the card whose tally changed', () => {
    render(<Harness />)
    const afterMount = usePointerInteraction.mock.calls.length
    fireEvent.click(screen.getByText('bump-a'))
    const afterClick = usePointerInteraction.mock.calls.length
    expect(afterClick - afterMount).toBe(2)
  })

  it('renders the tally value from props with no GameState provider', () => {
    render(
      <PlayerCard player={playerA} playerIndex={0} tally={{ total: 7, timestamp: 1 }}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
    )
    expect(screen.getByText('+7')).toBeInTheDocument()
  })
})
