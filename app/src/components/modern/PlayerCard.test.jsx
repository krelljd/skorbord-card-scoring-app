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
  const [draftA, setDraftA] = useState(0)
  return (
    <div>
      <button onClick={() => setDraftA(5)}>bump-a</button>
      <PlayerCard player={playerA} playerIndex={0} draft={draftA}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
      <PlayerCard player={playerB} playerIndex={1} draft={0}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
    </div>
  )
}

describe('PlayerCard redraw isolation', () => {
  beforeEach(() => {
    usePointerInteraction.mockClear()
  })

  it('re-renders only the card whose draft changed', () => {
    render(<Harness />)
    const afterMount = usePointerInteraction.mock.calls.length
    fireEvent.click(screen.getByText('bump-a'))
    const afterClick = usePointerInteraction.mock.calls.length
    expect(afterClick - afterMount).toBe(2)
  })

  it('renders the round chip from props with no GameState provider', () => {
    render(
      <PlayerCard player={playerA} playerIndex={0} draft={7}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
    )
    expect(screen.getByText('+7')).toBeInTheDocument()
  })

  it('cribbage cards show Play, Hand and Crib instead of + and -, and Crib only for the dealer', () => {
    const onPartClick = vi.fn()
    const parts = { play: 4, hand: 12, crib: 0 }
    const { rerender } = render(
      <PlayerCard player={playerA} playerIndex={0} draft={16} partsMode draftParts={parts}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} onPartClick={onPartClick} />
    )
    expect(screen.queryByLabelText('Add point to Alice')).toBeNull()
    expect(screen.queryByLabelText('Subtract point from Alice')).toBeNull()
    expect(screen.getByLabelText('hand points for Alice: 12')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^crib points/)).toBeNull()

    rerender(
      <PlayerCard player={playerA} playerIndex={0} draft={16} partsMode draftParts={parts}
        isDealer isWinner={false} onScoreUpdate={noop} onDealerClick={noop} onPartClick={onPartClick} />
    )
    fireEvent.click(screen.getByLabelText('crib points for Alice: 0'))
    fireEvent.click(screen.getByLabelText('play points for Alice: 4'))
    expect(onPartClick.mock.calls).toEqual([['a', 'crib'], ['a', 'play']])
  })

  it('other games keep + and -', () => {
    render(
      <PlayerCard player={playerA} playerIndex={0} draft={0}
        isDealer={false} isWinner={false} onScoreUpdate={noop} onDealerClick={noop} />
    )
    expect(screen.getByLabelText('Add point to Alice')).toBeInTheDocument()
    expect(screen.getByLabelText('Subtract point from Alice')).toBeInTheDocument()
  })
})
