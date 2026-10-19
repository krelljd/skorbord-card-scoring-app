import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import LastGameResult from './LastGameResult.jsx'
import gameAPI from '../../services/gameAPI.js'

vi.mock('../Toast.jsx', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

const roundState = {
  game: { id: 'g1', winner_id: 'a', game_type_name: 'Cribbage', win_condition_type: 'win', win_condition_value: 121, score_parts: ['play', 'hand', 'crib'], rivalry_id: 'r1' },
  players: [
    { player_id: 'a', player_name: 'Jason', committed_total: 121, draft: 0 },
    { player_id: 'b', player_name: 'Sam', committed_total: 108, draft: 0 }
  ],
  rounds: []
}

describe('LastGameResult', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reopens the last finished game as the Game Over screen', async () => {
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: [{ id: 'g1', winner_id: 'a' }] })
    vi.spyOn(gameAPI, 'getRounds').mockResolvedValue(roundState)
    render(<LastGameResult sqid="s" rivalries={[]} onNewGame={() => {}} onRematch={() => {}} onOpenStats={() => {}} />)
    expect(await screen.findByRole('dialog', { name: 'Jason wins' })).toBeInTheDocument()
    expect(screen.getByText('by 13 points')).toBeInTheDocument()
  })

  it('falls back to the empty state when no game has finished', async () => {
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: [] })
    render(<LastGameResult sqid="s" rivalries={[]} onNewGame={() => {}} onRematch={() => {}} onOpenStats={() => {}} />)
    await waitFor(() => expect(screen.getByText('No Active Game')).toBeInTheDocument())
    expect(screen.queryByText(/Last game result/)).toBeNull()
  })
})
