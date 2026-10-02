import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
