import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeriesTimeline, GameTypeOwners, PointsSplit } from './SeriesStats.jsx'

const two = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Jess' }]
const three = [...two, { id: 'c', name: 'Cy' }]
const game = (i, winner, margin = 10, type = 'c') => ({ id: `g${i}`, winner_id: winner, game_type_id: type, game_type_name: 'Cribbage', ended_at: `2026-10-0${i}T00:00:00Z`, margin })

describe('SeriesTimeline', () => {
  const timeline = [game(1, 'b', 14), game(2, 'a', 22), game(3, 'a', 8), game(4, 'a', 15)]

  it('hides until three games are behind it', () => {
    const { container } = render(<SeriesTimeline timeline={timeline.slice(0, 2)} players={two} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the current streak once when it is also the longest', () => {
    render(<SeriesTimeline timeline={timeline} players={two} />)
    expect(screen.getByText('Alex 3', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getAllByText(/streak/)).toHaveLength(1)
  })

  it('also shows a longer streak that has ended', () => {
    render(<SeriesTimeline timeline={[game(1, 'b'), game(2, 'b'), game(3, 'b'), game(4, 'a'), game(5, 'a')]} players={two} />)
    expect(screen.getByText('Jess 3', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByText('Alex 2', { selector: 'b' })).toBeInTheDocument()
  })

  it('draws a lane per player with three players and opens a game on tap', async () => {
    const onOpenGame = vi.fn()
    render(<SeriesTimeline timeline={[...timeline, game(5, 'c', 30)]} players={three} onOpenGame={onOpenGame} />)
    expect(screen.queryByText(/wins up/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Cy won Cribbage.*by 30/ }))
    expect(onOpenGame).toHaveBeenCalledWith(expect.objectContaining({ id: 'g5' }))
  })

  it('skips games won by someone outside the rivalry', () => {
    const { container } = render(<SeriesTimeline timeline={[game(1, 'x'), game(2, 'x'), game(3, 'a')]} players={two} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('GameTypeOwners', () => {
  const types = [{ id: 'c', name: 'Cribbage' }, { id: 'p', name: 'Pitch' }, { id: 'g', name: 'Gin' }]
  const stats = { a: { c: { wins: 2 }, p: { wins: 1 }, g: { wins: 2 } }, b: { c: { wins: 3 }, p: { wins: 2 }, g: { wins: 0 } } }

  it('names the leader per game type and calls first-place ties even', () => {
    render(<GameTypeOwners gameTypes={[...types, { id: 'x', name: 'Rummy' }]} players={two} playerStats={{ ...stats, a: { ...stats.a, x: { wins: 1 } }, b: { ...stats.b, x: { wins: 1 } } }} />)
    expect(screen.getByText('Gin').closest('li')).toHaveTextContent('Alex')
    expect(screen.getByText('Cribbage').closest('li')).toHaveTextContent('Jess')
    expect(screen.getByText('Rummy').closest('li')).toHaveTextContent('Even')
  })

  it('stays hidden with one game type', () => {
    const { container } = render(<GameTypeOwners gameTypes={[types[0]]} players={two} playerStats={stats} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PointsSplit', () => {
  it('notes when the wins leader is not the points leader', () => {
    render(<PointsSplit pointsTotals={{ a: { c: 2310 }, b: { c: 2244 } }} players={two} gameTypeId="c" wins={[{ id: 'a', wins: 2 }, { id: 'b', wins: 3 }]} />)
    expect(screen.getByText('Jess wins more, Alex scores more')).toBeInTheDocument()
    expect(screen.getByText('Points scored · all games')).toBeInTheDocument()
  })

  it('labels a three-player split as a share and hides below three games', () => {
    const { rerender } = render(<PointsSplit pointsTotals={{ a: { c: 3 }, b: { c: 2 }, c: { c: 1 } }} players={three} gameTypeId="c" wins={[{ id: 'a', wins: 2 }, { id: 'b', wins: 1 }, { id: 'c', wins: 0 }]} />)
    expect(screen.getByText('Share of points · all games')).toBeInTheDocument()
    rerender(<PointsSplit pointsTotals={{ a: { c: 3 }, b: { c: 2 } }} players={two} gameTypeId="c" wins={[{ id: 'a', wins: 1 }, { id: 'b', wins: 1 }]} />)
    expect(screen.queryByText(/all games/)).toBeNull()
  })
})
