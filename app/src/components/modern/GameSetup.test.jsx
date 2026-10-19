import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GameSetup from './GameSetup.jsx'
import gameAPI from '../../services/gameAPI.js'

const gameTypes = [
  { id: 'crib', name: 'Cribbage', is_favorited: 1, is_win_condition: 1, win_condition: 121 },
  { id: 'hearts', name: 'Hearts', is_favorited: 0, is_win_condition: 0, loss_condition: 100 }
]
const players = [
  { id: 'a', name: 'Jason', games_played: 9 },
  { id: 'b', name: 'Sam', games_played: 3 }
]

describe('GameSetup', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('needs two players, then starts with the chosen first dealer', async () => {
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: [] })
    const create = vi.spyOn(gameAPI, 'createGame').mockResolvedValue({ id: 'g' })
    const onGameStart = vi.fn()
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} onGameStart={onGameStart} />)

    const start = screen.getByRole('button', { name: 'Start game' })
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Jason/ }))
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Sam/ }))
    expect(start).toBeEnabled()

    fireEvent.click(screen.getByRole('radio', { name: 'Sam' }))
    fireEvent.click(start)
    await waitFor(() => expect(onGameStart).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith('s', {
      game_type_id: 'crib',
      player_ids: ['a', 'b'],
      win_condition_type: 'win',
      win_condition_value: 121,
      dealer_id: 'b'
    })
  })

  it('uses the known player when a typed name matches, and warns on a close name', () => {
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: [] })
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} />)
    fireEvent.click(screen.getByText('+ New player'))
    fireEvent.change(screen.getByPlaceholderText('Player name'), { target: { value: 'Jaso' } })
    expect(screen.getByText(/Did you mean Jason/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Player name'), { target: { value: 'sam' } })
    fireEvent.click(screen.getByText('Add'))
    expect(screen.getByRole('button', { name: /Sam/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers Same again from the last game and starts it with the dealer alternated', async () => {
    vi.spyOn(gameAPI, 'request').mockResolvedValue({
      data: [{
        id: 'g1', game_type_id: 'crib', game_type_name: 'Cribbage', dealer_id: 'a',
        win_condition_type: 'win', win_condition_value: 121,
        players: [{ id: 'a', name: 'Jason' }, { id: 'b', name: 'Sam' }]
      }]
    })
    vi.spyOn(gameAPI, 'getRounds').mockResolvedValue({ rounds: [{ round_number: 1, dealer_id: 'a', is_backfill: 0 }] })
    const create = vi.spyOn(gameAPI, 'createGame').mockResolvedValue({ id: 'g2' })
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} onGameStart={() => {}} />)

    expect(await screen.findByText('Same again')).toBeInTheDocument()
    expect(screen.getByText('Sam deals first')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('s', expect.objectContaining({ player_ids: ['a', 'b'], dealer_id: 'b', game_type_id: 'crib' })))
  })
})
