import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RivalryStats from './RivalryStats.jsx'

const rivalries = [
  { id: 'r1', total_games: 14, game_types: [{ id: 'c', name: 'Cribbage' }], players: [{ id: 'a', name: 'Jason', wins: 6 }, { id: 'b', name: 'Samantha', wins: 8 }] },
  { id: 'r2', total_games: 6, game_types: [], players: [{ id: 'c', name: 'Jason', wins: 3 }, { id: 'd', name: 'Marcus', wins: 3 }] }
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: [] }) })))
})

describe('RivalryStats list', () => {
  it('shows wins per player and tags only the clear leader', () => {
    render(<RivalryStats sqid="s" rivalries={rivalries} players={[]} backToSetup={() => {}} onManage={() => {}} />)
    expect(screen.getByText('14 games')).toBeInTheDocument()
    expect(screen.getAllByText('Leads')).toHaveLength(1)
    const cards = screen.getAllByRole('button', { name: /View stats/ })
    expect(cards[0].textContent.indexOf('Samantha')).toBeLessThan(cards[0].textContent.indexOf('Jason'))
    expect(screen.getByText('Cribbage')).toBeInTheDocument()
  })

  it('falls back to player names when the list has no player objects', () => {
    render(<RivalryStats sqid="s" rivalries={[{ id: 'x', player_names: ['Ann', 'Bo'], game_types: [] }]} players={[]} backToSetup={() => {}} onManage={() => {}} />)
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(screen.queryByText('Leads')).toBeNull()
  })
})
