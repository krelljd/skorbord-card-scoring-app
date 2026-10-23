import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GameOver, { RematchSheet } from './GameOver.jsx'
import { resetSnarkSetting } from '../../hooks/useSnarkSetting.js'

const players = [
  { player_id: 'a', player_name: 'Jason', score: 121 },
  { player_id: 'b', player_name: 'Sam', score: 59 }
]
const game = { game_type_name: 'Cribbage', win_condition_type: 'win', win_condition_value: 121 }

describe('GameOver', () => {
  it('shows the winner, margin, series and skunk, and wires the buttons', () => {
    const onRematch = vi.fn()
    const onStats = vi.fn()
    render(
      <GameOver game={game} players={players} winnerId="a" series={{ score: '15 – 11', status: 'Jason leads' }} showSkunk
        onRematch={onRematch} onStats={onStats} onHistory={() => {}} onClose={() => {}} />
    )
    expect(screen.getByRole('dialog', { name: 'Jason wins' })).toBeInTheDocument()
    expect(screen.getByText('by 62 points')).toBeInTheDocument()
    expect(screen.getByText(/Double skunk! Sam/)).toBeInTheDocument()
    expect(screen.getByText('Series 15 – 11')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Rematch'))
    fireEvent.click(screen.getByText('Rivalry stats'))
    expect(onRematch).toHaveBeenCalled()
    expect(onStats).toHaveBeenCalled()
  })

  it('shows a winner-only snark line, never naming the loser, and hides it when snark is Off', () => {
    window.localStorage.clear()
    const { unmount } = render(<GameOver game={game} players={players} winnerId="a" onRematch={() => {}} onStats={() => {}} onHistory={() => {}} onClose={() => {}} />)
    const line = screen.getByTestId('snark-line').textContent
    expect(line).toMatch(/Jason/)
    expect(line).not.toMatch(/Sam/)
    unmount()
    window.localStorage.setItem('skorbord-snark', 'off')
    resetSnarkSetting()
    render(<GameOver game={game} players={players} winnerId="a" onRematch={() => {}} onStats={() => {}} onHistory={() => {}} onClose={() => {}} />)
    expect(screen.queryByTestId('snark-line')).toBeNull()
    window.localStorage.clear()
    resetSnarkSetting()
  })

  it('hides the skunk chip unless asked', () => {
    render(<GameOver game={game} players={players} winnerId="a" onRematch={() => {}} onStats={() => {}} onHistory={() => {}} onClose={() => {}} />)
    expect(screen.queryByText(/skunk/i)).toBeNull()
  })
})

describe('GameOver game story', () => {
  const rs = (perPlayer) => ({
    game: { win_condition_type: 'win' },
    players: [{ player_id: 'a', player_name: 'Jason' }, { player_id: 'b', player_name: 'Sam' }],
    rounds: perPlayer.a.map((_, i) => ({ round_number: i + 1, status: 'committed', is_backfill: 0, scores: { a: perPlayer.a[i], b: perPlayer.b[i] } }))
  })
  const close = { players: [{ player_id: 'a', player_name: 'Jason', score: 121 }, { player_id: 'b', player_name: 'Sam', score: 110 }] }
  const props = { game, winnerId: 'a', onRematch: () => {}, onStats: () => {}, onHistory: () => {}, onClose: () => {} }

  it('shows the lead band and the comeback and swing chips', () => {
    const comeback = rs({ a: [5, 8, 6, 10, 7, 9, 26, 11, 12, 15, 12], b: [12, 9, 14, 6, 11, 8, 2, 10, 13, 9, 7] })
    render(<GameOver {...props} {...close} roundState={comeback} />)
    expect(screen.getByText('Trailed by 16, won')).toBeInTheDocument()
    expect(screen.getByText('Swing round: R7, Jason +26')).toBeInTheDocument()
    expect(screen.getByTestId('lead-band')).toBeInTheDocument()
  })

  it('adds nothing to a wire-to-wire win except the band', () => {
    render(<GameOver {...props} {...close} roundState={rs({ a: [10, 10, 10, 10], b: [1, 2, 3, 4] })} />)
    expect(screen.queryByText(/Trailed|Lead changed|^Swing round:/)).toBeNull()
  })

  it('shows neither without saved rounds', () => {
    render(<GameOver {...props} {...close} />)
    expect(screen.queryByTestId('lead-band')).toBeNull()
  })
})

describe('RematchSheet', () => {
  it('starts with the alternated dealer, and the dealer can be changed', () => {
    const onStart = vi.fn()
    render(<RematchSheet game={game} players={players} showDealer defaultDealerId="b" onStart={onStart} onCancel={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Sam' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Jason' }))
    fireEvent.click(screen.getByText('Start game'))
    expect(onStart).toHaveBeenCalledWith('a')
  })

  it('has no dealer choice for other games', () => {
    const onStart = vi.fn()
    render(<RematchSheet game={game} players={players} showDealer={false} defaultDealerId="b" onStart={onStart} onCancel={() => {}} />)
    expect(screen.queryByText('Who deals first')).toBeNull()
    fireEvent.click(screen.getByText('Start game'))
    expect(onStart).toHaveBeenCalledWith(null)
  })
})
