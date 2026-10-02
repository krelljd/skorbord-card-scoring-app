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
    const row = screen.getByText('Avg per round').closest('tr')
    expect(row).toHaveTextContent('8')
    expect(row).toHaveTextContent('2')
  })

  it('totals include the earlier row', () => {
    render(<RoundHistory roundState={roundState} onEdit={() => {}} onClose={() => {}} canEdit />)
    expect(screen.getByText('Total').closest('tr')).toHaveTextContent('106')
  })

  const cribState = {
    game: { score_parts: ['play', 'hand', 'crib'] },
    players: roundState.players,
    rounds: [
      round(1, { a: 24, b: 10 }, { dealer_id: 'a', parts: { a: { play: 4, hand: 12, crib: 8 }, b: { play: 4, hand: 6, crib: 0 } } }),
      round(2, { a: 6, b: 14 }, { dealer_id: 'b', parts: { a: { play: 2, hand: 4, crib: 0 }, b: { play: 6, hand: 4, crib: 4 } } })
    ]
  }

  it('shows parts and part averages only when asked, and the crib average counts dealt rounds only', () => {
    render(<RoundHistory roundState={cribState} onEdit={() => {}} onClose={() => {}} canEdit />)
    expect(screen.queryAllByTestId('cell-parts')).toHaveLength(0)
    expect(screen.queryByText('Avg hand')).toBeNull()

    fireEvent.click(screen.getByLabelText('Show parts'))
    const cells = screen.getAllByTestId('cell-parts').map((c) => c.textContent)
    expect(cells).toEqual(['4 / 12 / 8', '4 / 6', '2 / 4', '6 / 4 / 4'])
    expect(screen.getByText('Avg hand').closest('tr')).toHaveTextContent('8')
    expect(screen.getByText('Avg crib').closest('tr')).toHaveTextContent('8')
  })

  it('has no parts toggle for games without parts', () => {
    render(<RoundHistory roundState={roundState} onEdit={() => {}} onClose={() => {}} canEdit />)
    expect(screen.queryByLabelText('Show parts')).toBeNull()
  })

  it('correcting a cell in parts view sends the part', () => {
    const onEdit = vi.fn()
    render(<RoundHistory roundState={cribState} onEdit={onEdit} onClose={() => {}} canEdit />)
    fireEvent.click(screen.getByLabelText('Show parts'))
    fireEvent.click(screen.getByLabelText('Edit round 1 for Ann'))
    fireEvent.click(screen.getByTestId('value-hand'))
    fireEvent.click(screen.getByText('9'))
    fireEvent.click(screen.getByText('Save'))
    expect(onEdit).toHaveBeenCalledWith(1, 'a', 9, 1, 'hand')
  })
})
