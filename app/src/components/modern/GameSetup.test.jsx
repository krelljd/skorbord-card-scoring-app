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

describe('GameSetup unfinished games', () => {
  const parkedGame = {
    id: 'g-old', is_active: false, game_type_name: 'Pitch', current_round: 5, last_activity: new Date().toISOString(),
    players: [{ id: 'a', name: 'Jason', score: 41 }, { id: 'b', name: 'Sam', score: 38 }]
  }
  const playingGame = {
    id: 'g-now', is_active: true, game_type_name: 'Cribbage', current_round: 7, last_activity: new Date().toISOString(),
    players: [{ id: 'a', name: 'Jason', score: 64 }, { id: 'b', name: 'Sam', score: 57 }]
  }
  const pickPlayers = () => {
    fireEvent.click(screen.getByRole('button', { name: /Jason/ }))
    fireEvent.click(screen.getByRole('button', { name: /Sam/ }))
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: [] })
  })

  it('lists parked games, not the one being played, and resumes one', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([playingGame, parkedGame])
    const resume = vi.spyOn(gameAPI, 'resumeGame').mockResolvedValue({ id: 'g-old' })
    const onResume = vi.fn()
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} onResume={onResume} />)

    const button = await screen.findByRole('button', { name: /Resume Pitch/ })
    expect(screen.queryByRole('button', { name: /Resume Cribbage/ })).toBeNull()
    fireEvent.click(button)
    await waitFor(() => expect(onResume).toHaveBeenCalled())
    expect(resume).toHaveBeenCalledWith('s', 'g-old')
  })

  it('shows no list when there are no parked games', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([playingGame])
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} />)
    await waitFor(() => expect(gameAPI.getUnfinishedGames).toHaveBeenCalled())
    expect(screen.queryByText('Unfinished games')).toBeNull()
  })

  it('discards only after a confirm', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([parkedGame])
    const discard = vi.spyOn(gameAPI, 'discardGame').mockResolvedValue({})
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} />)
    await screen.findByText('Unfinished games')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(discard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(discard).toHaveBeenCalledWith('s', 'g-old'))
    await waitFor(() => expect(screen.queryByText('Unfinished games')).toBeNull())
  })

  it('asks before starting over a game in progress: keep playing goes back to it', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([playingGame])
    const create = vi.spyOn(gameAPI, 'createGame').mockResolvedValue({ id: 'n' })
    const onKeepPlaying = vi.fn()
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} onKeepPlaying={onKeepPlaying} />)
    await waitFor(() => expect(gameAPI.getUnfinishedGames).toHaveBeenCalled())
    pickPlayers()
    await screen.findByText(/^Pick at least|2 players/)
    await waitFor(() => expect(screen.queryByText('Unfinished games')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep playing that game' }))
    expect(onKeepPlaying).toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('park it and start new creates the game', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([playingGame])
    const create = vi.spyOn(gameAPI, 'createGame').mockResolvedValue({ id: 'n' })
    const onGameStart = vi.fn()
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} onGameStart={onGameStart} />)
    await waitFor(() => expect(gameAPI.getUnfinishedGames).toHaveBeenCalled())
    pickPlayers()
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Park it and start new' }))
    await waitFor(() => expect(onGameStart).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('starts straight away when nothing is in progress', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([])
    const create = vi.spyOn(gameAPI, 'createGame').mockResolvedValue({ id: 'n' })
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} onGameStart={vi.fn()} />)
    await waitFor(() => expect(gameAPI.getUnfinishedGames).toHaveBeenCalled())
    pickPlayers()
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('GameSetup older unfinished games', () => {
  const recent = {
    id: 'g-new', is_active: false, is_old: false, game_type_name: 'Pitch', current_round: 5, last_activity: new Date().toISOString(),
    players: [{ id: 'a', name: 'Jason', score: 41 }, { id: 'b', name: 'Sam', score: 38 }]
  }
  const old = {
    id: 'g-old', is_active: false, is_old: true, game_type_name: 'Golf', current_round: 3, last_activity: '2026-01-05T12:00:00Z',
    players: [{ id: 'a', name: 'Jason', score: 12 }, { id: 'b', name: 'Sam', score: 9 }]
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: [] })
  })

  it('keeps old games out of the main list behind an Older games row', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([recent, old])
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} />)
    await screen.findByRole('button', { name: /Resume Pitch/ })
    expect(screen.queryByRole('button', { name: /Resume Golf/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Older games/ }))
    expect(screen.getByRole('dialog', { name: 'Older games' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resume Golf/ })).toBeInTheDocument()
    expect(screen.getByText(/Jan 5/)).toBeInTheDocument()
  })

  it('shows the section when only old games exist, and resumes one', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([old])
    const resume = vi.spyOn(gameAPI, 'resumeGame').mockResolvedValue({ id: 'g-old' })
    const onResume = vi.fn()
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} onResume={onResume} />)
    fireEvent.click(await screen.findByRole('button', { name: /Older games/ }))
    fireEvent.click(screen.getByRole('button', { name: /Resume Golf/ }))
    await waitFor(() => expect(onResume).toHaveBeenCalled())
    expect(resume).toHaveBeenCalledWith('s', 'g-old')
  })

  it('discards all older games after a confirm', async () => {
    vi.spyOn(gameAPI, 'getUnfinishedGames').mockResolvedValue([recent, old])
    const discardAll = vi.spyOn(gameAPI, 'discardOlderGames').mockResolvedValue({ discarded: 1 })
    render(<GameSetup sqid="s" gameTypes={gameTypes} players={players} />)
    fireEvent.click(await screen.findByRole('button', { name: /Older games/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard all older games' }))
    expect(discardAll).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard all' }))
    await waitFor(() => expect(discardAll).toHaveBeenCalledWith('s'))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Older games/ })).toBeNull())
    expect(screen.getByRole('button', { name: /Resume Pitch/ })).toBeInTheDocument()
  })
})
