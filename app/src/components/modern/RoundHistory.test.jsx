import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RoundHistory from './RoundHistory.jsx'

const round = (n, scores, extra = {}) => ({ round_number: n, status: 'committed', is_backfill: false, revision: 1, scores, edited: {}, ...extra })

const roundState = {
  players: [
    { player_id: 'a', player_name: 'Ann' },
    { player_id: 'b', player_name: 'Bob' }
  ],
  rounds: [
    round(1, { a: 90, b: 70 }, { is_backfill: true }),
    round(2, { a: 10, b: 4 }),
    round(3, { a: 6, b: 0 }),
    { round_number: 4, status: 'open', is_backfill: false, revision: 0, scores: { a: 99, b: 99 }, edited: {} }
  ]
}

describe('RoundHistory', () => {
  it('averages real rounds only, skipping the earlier row and the open round', () => {
    render(<RoundHistory roundState={roundState} onEdit={() => {}} onClose={() => {}} canEdit />)
    const [ann, bob] = screen.getAllByTestId('summary-player')
    expect(ann).toHaveTextContent('8Avg/rnd')
    expect(bob).toHaveTextContent('2Avg/rnd')
  })

  it('totals include the earlier row', () => {
    render(<RoundHistory roundState={roundState} onEdit={() => {}} onClose={() => {}} canEdit />)
    const [ann, bob] = screen.getAllByTestId('summary-player')
    expect(ann).toHaveTextContent('106')
    expect(bob).toHaveTextContent('74')
  })

  const cribState = {
    game: { score_parts: ['play', 'hand', 'crib'] },
    players: roundState.players,
    rounds: [
      round(1, { a: 24, b: 10 }, { dealer_id: 'a', parts: { a: { play: 4, hand: 12, crib: 8 }, b: { play: 4, hand: 6, crib: 0 } } }),
      round(2, { a: 6, b: 14 }, { dealer_id: 'b', parts: { a: { play: 2, hand: 4, crib: 0 }, b: { play: 6, hand: 4, crib: 4 } } })
    ]
  }

  it('always shows parts and part averages, and the crib average counts dealt rounds only', () => {
    render(<RoundHistory roundState={cribState} onEdit={() => {}} onClose={() => {}} canEdit />)
    const cells = screen.getAllByTestId('cell-parts').map((c) => c.textContent)
    // Newest round first
    expect(cells).toEqual(['2 / 4', '6 / 4 / 4', '4 / 12 / 8', '4 / 6'])
    const [ann] = screen.getAllByTestId('summary-player')
    expect(ann).toHaveTextContent('8Hand')
    expect(ann).toHaveTextContent('8Crib')
  })

  it('shows no parts for games without parts', () => {
    render(<RoundHistory roundState={roundState} onEdit={() => {}} onClose={() => {}} canEdit />)
    expect(screen.queryAllByTestId('cell-parts')).toHaveLength(0)
    expect(screen.queryByLabelText('Show parts')).toBeNull()
  })

  it('correcting a cell on a round with parts sends the part', () => {
    const onEdit = vi.fn()
    render(<RoundHistory roundState={cribState} onEdit={onEdit} onClose={() => {}} canEdit />)
    fireEvent.click(screen.getByLabelText('Edit round 1 for Ann'))
    fireEvent.click(screen.getByTestId('value-hand'))
    fireEvent.click(screen.getByText('9'))
    fireEvent.click(screen.getByText('Save'))
    expect(onEdit).toHaveBeenCalledWith(1, 'a', 9, 1, 'hand')
  })

  it('shows each round newest first with a running average, and none on the earlier row', () => {
    render(<RoundHistory roundState={roundState} onEdit={() => {}} onClose={() => {}} canEdit />)
    const cards = screen.getAllByTestId('round-card')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveTextContent('Round 3')
    expect(cards[0]).toHaveTextContent('avg 8')
    expect(cards[2]).toHaveTextContent('Earlier rounds')
    expect(cards[2]).not.toHaveTextContent('avg')
  })

  it('offers Replay once there are two real rounds, and steps with the slider', () => {
    render(<RoundHistory roundState={roundState} onEdit={() => {}} onClose={() => {}} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(screen.getByTestId('round-replay')).toBeInTheDocument()
    const [ann] = screen.getAllByTestId('replay-player')
    expect(ann).toHaveTextContent('90')
    fireEvent.change(screen.getByLabelText('Round'), { target: { value: '3' } })
    expect(screen.getAllByTestId('replay-player')[0]).toHaveTextContent('106')
    expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop replay' }))
    expect(screen.queryByTestId('round-replay')).toBeNull()
  })

  it('hides Replay when there is only one real round', () => {
    const one = { players: roundState.players, rounds: [round(1, { a: 5, b: 3 })] }
    render(<RoundHistory roundState={one} onEdit={() => {}} onClose={() => {}} canEdit />)
    expect(screen.queryByRole('button', { name: 'Replay' })).toBeNull()
  })
})
