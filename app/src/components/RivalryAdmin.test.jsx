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

describe('RivalryAdmin rename and delete', () => {
  const baseRivalries = [
    { id: 'riv1', player_names: ['Alice', 'Bob'], players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }] }
  ]

  beforeEach(() => {
    sessionStorage.setItem('skorbord_admin_pin_abcd', '1234')
    global.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renames a player and reflects the new name in rivalry state', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 'p1', name: 'Alicia' } })
    })
    let latestRivalries = baseRivalries
    const setRivalries = (updater) => { latestRivalries = updater(latestRivalries) }

    render(<RivalryAdmin sqid="abcd" rivalries={baseRivalries} setRivalries={setRivalries} backToStats={() => {}} />)

    fireEvent.click(screen.getAllByText('Rename')[0])
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Alicia' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/abcd/players/p1', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'X-Admin-Pin': '1234' })
    })))
    expect(latestRivalries[0].players[0].name).toBe('Alicia')
  })

  it('surfaces a duplicate-name conflict from the server', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: 'Player name already exists in this Sqid' })
    })

    render(<RivalryAdmin sqid="abcd" rivalries={baseRivalries} setRivalries={() => {}} backToStats={() => {}} />)

    fireEvent.click(screen.getAllByText('Rename')[0])
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByText('Player name already exists in this Sqid')).toBeInTheDocument())
  })

  it('keeps delete disabled until the confirm text matches exactly, then deletes on click', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) })
    let latestRivalries = baseRivalries
    const setRivalries = (updater) => { latestRivalries = updater(latestRivalries) }

    render(<RivalryAdmin sqid="abcd" rivalries={baseRivalries} setRivalries={setRivalries} backToStats={() => {}} />)

    fireEvent.click(screen.getByText('Delete Rivalry'))
    const confirmInput = screen.getByRole('textbox')
    const confirmButton = screen.getByText('Confirm Delete')
    expect(confirmButton).toBeDisabled()

    fireEvent.change(confirmInput, { target: { value: 'Alice vs Bob' } })
    expect(confirmButton).not.toBeDisabled()

    fireEvent.click(confirmButton)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/abcd/rivalries/riv1', expect.objectContaining({
      method: 'DELETE',
      headers: { 'X-Admin-Pin': '1234' }
    })))
    expect(latestRivalries.find(r => r.id === 'riv1')).toBeUndefined()
  })

  it('clears the cached pin and re-shows the gate on a 403 from a mutating call', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 })

    render(<RivalryAdmin sqid="abcd" rivalries={baseRivalries} setRivalries={() => {}} backToStats={() => {}} />)

    fireEvent.click(screen.getAllByText('Rename')[0])
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Alicia' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByPlaceholderText('Admin PIN')).toBeInTheDocument())
    expect(sessionStorage.getItem('skorbord_admin_pin_abcd')).toBeNull()
  })

  it('scopes the rename error to the player being edited, not every rivalry card', async () => {
    const multiRivalries = [
      { id: 'riv1', player_names: ['Alice', 'Bob'], players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }] },
      { id: 'riv2', player_names: ['Carol', 'Dave'], players: [{ id: 'p3', name: 'Carol' }, { id: 'p4', name: 'Dave' }] }
    ]
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: 'Player name already exists in this Sqid' })
    })

    render(<RivalryAdmin sqid="abcd" rivalries={multiRivalries} setRivalries={() => {}} backToStats={() => {}} />)

    fireEvent.click(screen.getAllByText('Rename')[0])
    fireEvent.change(screen.getByDisplayValue('Alice'), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByText('Player name already exists in this Sqid')).toBeInTheDocument())

    expect(screen.getAllByText('Player name already exists in this Sqid')).toHaveLength(1)
    const errorNode = screen.getByText('Player name already exists in this Sqid')
    const riv2Card = screen.getByText('Carol vs Dave').closest('.card')
    expect(riv2Card.contains(errorNode)).toBe(false)
  })
})
