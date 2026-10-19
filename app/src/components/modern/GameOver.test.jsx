import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GameOver, { RematchSheet } from './GameOver.jsx'

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

  it('hides the skunk chip unless asked', () => {
    render(<GameOver game={game} players={players} winnerId="a" onRematch={() => {}} onStats={() => {}} onHistory={() => {}} onClose={() => {}} />)
    expect(screen.queryByText(/skunk/i)).toBeNull()
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
