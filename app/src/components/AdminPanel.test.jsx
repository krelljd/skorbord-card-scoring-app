import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminPanel from './AdminPanel.jsx'

const gameTypes = [
  { id: 1, name: 'Cribbage', is_win_condition: 1, win_condition: 121, is_favorited: 1 },
  { id: 2, name: 'Hearts', is_win_condition: 0, loss_condition: 100, is_favorited: 0 }
]
const rivalries = [
  { id: 'riv1', player_names: ['Alice', 'Bob'], players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }] }
]

const renderPanel = (props = {}) => render(
  <AdminPanel sqid="abcd" gameTypes={gameTypes} setGameTypes={() => {}} backToSetup={() => {}}
    rivalries={rivalries} setRivalries={() => {}} {...props} />
)

describe('AdminPanel', () => {
  beforeEach(() => {
    sessionStorage.clear()
    global.fetch = vi.fn()
  })

  it('lists game types with their rule', () => {
    renderPanel()
    expect(screen.getByText('First to 121')).toBeInTheDocument()
    expect(screen.getByText('Lose at 100')).toBeInTheDocument()
  })

  it('confirms inline before deleting a game type', () => {
    renderPanel()
    fireEvent.click(screen.getByLabelText('Delete Hearts'))
    expect(screen.getByText('Delete Hearts? This cannot be undone.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Keep'))
    expect(screen.queryByText('Delete Hearts? This cannot be undone.')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows rivalry admin behind the PIN gate on the Rivalries tab', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('tab', { name: 'Rivalries' }))
    expect(screen.getByPlaceholderText('Admin PIN')).toBeInTheDocument()
  })

  it('opens on the Rivalries tab when asked', () => {
    sessionStorage.setItem('skorbord_admin_pin_abcd', '1234')
    renderPanel({ initialTab: 'rivalries' })
    expect(screen.getByText('Alice vs Bob')).toBeInTheDocument()
  })
})
