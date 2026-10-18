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

describe('Recent games history', () => {
  it('opens a read-only Score History for a tapped recent game', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const { default: RivalryStatsDetail } = await import('./RivalryStatsDetail.jsx')
    const { gameAPI } = await import('../services/gameAPI.js')
    const roundState = {
      game: { id: 'g1', finalized: true, score_parts: null, win_condition_type: 'win', win_condition_value: 20 },
      players: [{ player_id: 'a', player_name: 'Jason', total: 12 }, { player_id: 'b', player_name: 'Samantha', total: 20 }],
      rounds: [
        { round_number: 1, dealer_id: 'a', status: 'committed', is_backfill: 0, revision: 0, scores: { a: 5, b: 9 }, edited: {}, parts: {} },
        { round_number: 2, dealer_id: 'b', status: 'committed', is_backfill: 0, revision: 0, scores: { a: 7, b: 11 }, edited: {}, parts: {} }
      ]
    }
    const spy = vi.spyOn(gameAPI, 'getRounds').mockResolvedValue(roundState)
    const details = {
      recent_games: [{ id: 'g1', winner_id: 'b', winner_name: 'Samantha', game_type_name: 'Cribbage', completed_at: '2026-10-10T00:00:00Z', player_scores: [{ player_id: 'b', score: 20 }, { player_id: 'a', score: 12 }] }],
      player_stats: {}, round_stats: {}
    }
    render(<RivalryStatsDetail sqid="s" details={details} players={[{ id: 'a', name: 'Jason' }, { id: 'b', name: 'Samantha' }]} gameTypes={[{ id: 'c', name: 'Cribbage' }]} onBack={() => {}} backToSetup={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Score history, Samantha won/ }))
    expect(spy).toHaveBeenCalledWith('s', 'g1')
    expect(await screen.findAllByTestId('round-card')).toHaveLength(2)
    screen.getAllByLabelText(/Edit round/).forEach((b) => expect(b).toBeDisabled())
  })
})
