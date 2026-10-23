import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SnarkLine from './SnarkLine.jsx'
import AdminPanel from '../AdminPanel.jsx'
import { resetSnarkSetting } from '../../hooks/useSnarkSetting.js'
import { rivalryFacts } from '../../utils/rivalryFacts.js'

const players = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Jess' }]
const day = (n) => new Date(Date.UTC(2026, 8, n, 12)).toISOString()
const game = (n, winner, margin) => ({ id: `g${n}`, winner_id: winner, game_type_id: 'c', game_type_name: 'Cribbage', ended_at: day(n), margin })
const facts = rivalryFacts({ players, timeline: [game(1, 'b', 9), game(2, 'a', 40), game(3, 'a', 12), game(4, 'a', 2)] })

beforeEach(() => {
  window.localStorage.clear()
  resetSnarkSetting()
})

describe('SnarkLine', () => {
  it('shows a line with Shuffle by default (Spicy)', () => {
    render(<SnarkLine context="history" facts={facts} players={players} />)
    expect(screen.getByTestId('snark-line')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /shuffle/i }))
    expect(screen.getByTestId('snark-line')).toBeInTheDocument()
  })

  it('is hidden when the setting is Off', () => {
    window.localStorage.setItem('skorbord-snark', 'off')
    render(<SnarkLine context="history" facts={facts} players={players} />)
    expect(screen.queryByTestId('snark-line')).toBeNull()
  })

  it('is hidden with no facts, but the first-game lines need none', () => {
    const { rerender } = render(<SnarkLine context="history" facts={null} players={players} />)
    expect(screen.queryByTestId('snark-line')).toBeNull()
    rerender(<SnarkLine context="empty" />)
    expect(screen.getByTestId('snark-line')).toBeInTheDocument()
  })

  it('falls back to Spicy when storage is blocked', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    try {
      render(<SnarkLine context="empty" />)
      expect(screen.getByTestId('snark-line')).toBeInTheDocument()
    } finally {
      Storage.prototype.getItem = original
    }
  })

  it('the Game Over line names the winner', () => {
    render(<SnarkLine context="winner" winner="Alex" wins={4} variant="flood" />)
    expect(screen.getByTestId('snark-line').textContent).toMatch(/Alex/)
  })
})

describe('Admin snark setting', () => {
  it('changes the setting everywhere and saves it on the phone', () => {
    render(<><AdminPanel sqid="s" gameTypes={[]} setGameTypes={() => {}} backToSetup={() => {}} /><SnarkLine context="empty" /></>)
    expect(screen.getByRole('radio', { name: 'Spicy' })).toHaveAttribute('aria-checked', 'true')
    act(() => { fireEvent.click(screen.getByRole('radio', { name: 'Off' })) })
    expect(window.localStorage.getItem('skorbord-snark')).toBe('off')
    expect(screen.queryByTestId('snark-line')).toBeNull()
    act(() => { fireEvent.click(screen.getByRole('radio', { name: 'Mild' })) })
    expect(screen.getByTestId('snark-line')).toBeInTheDocument()
  })
})
