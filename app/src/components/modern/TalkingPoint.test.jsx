import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GameOverTalkingPoint, PregameTalkingPoints } from './TalkingPoint.jsx'
import gameAPI from '../../services/gameAPI.js'

const g = (winner, type = 'c', name = 'Cribbage') => ({ id: `${Math.random()}`, winner_id: winner, game_type_id: type, game_type_name: name, margin: 10 })
const details = {
  players: [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Jess' }],
  timeline: [g('b'), g('a'), g('a'), g('a')]
}

beforeEach(() => vi.restoreAllMocks())

describe('GameOverTalkingPoint', () => {
  const props = { sqid: 's', game: { rivalry_id: 'r', game_type_id: 'c' } }

  it('shows series facts once the rivalry loads', async () => {
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: details })
    render(<GameOverTalkingPoint {...props} />)
    expect(screen.queryByTestId('talking-point')).toBeNull()
    await waitFor(() => expect(screen.getByText('Alex has won the last 3 games in a row.')).toBeInTheDocument())
    expect(gameAPI.request).toHaveBeenCalledWith('/api/s/rivalries/r')
  })

  it('steps through the facts and wraps around', async () => {
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: { ...details, timeline: [g('b'), g('b'), g('a'), g('a'), g('a')] } })
    render(<GameOverTalkingPoint {...props} />)
    const next = await screen.findByRole('button', { name: /Next fact · 1 of 2/ })
    expect(screen.getByText(/won the last 3 games in a row/)).toBeInTheDocument()
    fireEvent.click(next)
    expect(screen.getByText(/takes the series lead with 3 wins/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Next fact · 2 of 2/ }))
    expect(screen.getByText(/won the last 3 games in a row/)).toBeInTheDocument()
  })

  it('shows nothing before enough games, and survives a failed request', async () => {
    vi.spyOn(gameAPI, 'request').mockRejectedValueOnce(new Error('offline'))
    const { container, rerender } = render(<GameOverTalkingPoint {...props} />)
    await Promise.resolve()
    expect(container).toBeEmptyDOMElement()
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: { ...details, timeline: [g('a')] } })
    rerender(<GameOverTalkingPoint sqid="s" game={{ rivalry_id: 'r2', game_type_id: 'c' }} />)
    await waitFor(() => expect(gameAPI.request).toHaveBeenCalledTimes(2))
    expect(container).toBeEmptyDOMElement()
  })

  it('does not fetch without a sqid or rivalry', () => {
    const spy = vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: details })
    render(<GameOverTalkingPoint game={{ game_type_id: 'c' }} />)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('PregameTalkingPoints', () => {
  const rivalries = [{ id: 'r', players: [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Jess' }] }]

  it('shows up to two facts once both saved players are picked', async () => {
    vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: details })
    const { rerender } = render(<PregameTalkingPoints sqid="s" rivalries={rivalries} picked={[{ key: 'a', id: 'a' }]} gameTypeId="c" />)
    expect(screen.queryByTestId('pregame-points')).toBeNull()
    rerender(<PregameTalkingPoints sqid="s" rivalries={rivalries} picked={[{ key: 'a', id: 'a' }, { key: 'b', id: 'b' }]} gameTypeId="c" />)
    await waitFor(() => expect(screen.getByTestId('pregame-points')).toBeInTheDocument())
    expect(screen.getByText('Alex is on a 3-game streak.')).toBeInTheDocument()
    expect(screen.getByText('Alex leads the series with 3 wins.')).toBeInTheDocument()
  })

  it('skips new players and pairings with no rivalry', () => {
    const spy = vi.spyOn(gameAPI, 'request').mockResolvedValue({ data: details })
    render(<PregameTalkingPoints sqid="s" rivalries={rivalries} picked={[{ key: 'a', id: 'a' }, { key: 'new:z', name: 'Zed' }]} gameTypeId="c" />)
    render(<PregameTalkingPoints sqid="s" rivalries={rivalries} picked={[{ key: 'a', id: 'a' }, { key: 'c', id: 'c' }]} gameTypeId="c" />)
    expect(spy).not.toHaveBeenCalled()
    expect(screen.queryByTestId('pregame-points')).toBeNull()
  })
})
