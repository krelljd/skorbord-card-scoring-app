import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RivalryAdmin from './RivalryAdmin.jsx'

const rivalries = [
  { id: 'riv1', player_names: ['Alice', 'Bob'], players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }] }
]

describe('RivalryAdmin PIN gate', () => {
  beforeEach(() => {
    sessionStorage.clear()
    global.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides the rivalry list until a correct PIN is entered', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    render(<RivalryAdmin sqid="abcd" rivalries={rivalries} setRivalries={() => {}} backToStats={() => {}} />)

    expect(screen.queryByText('Alice vs Bob')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Admin PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Alice vs Bob')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/abcd/admin/verify-pin', expect.objectContaining({
      method: 'POST',
      headers: { 'X-Admin-Pin': '1234' }
    }))
  })

  it('shows an error and keeps the list hidden for a wrong PIN', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 })
    render(<RivalryAdmin sqid="abcd" rivalries={rivalries} setRivalries={() => {}} backToStats={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Admin PIN'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Incorrect PIN')).toBeInTheDocument())
    expect(screen.queryByText('Alice vs Bob')).not.toBeInTheDocument()
  })

  it('skips the gate when a pin is already cached in sessionStorage', () => {
    sessionStorage.setItem('skorbord_admin_pin_abcd', '1234')
    render(<RivalryAdmin sqid="abcd" rivalries={rivalries} setRivalries={() => {}} backToStats={() => {}} />)
    expect(screen.getByText('Alice vs Bob')).toBeInTheDocument()
  })
})
