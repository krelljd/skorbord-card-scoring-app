import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import PlaySheet, { COMBO_WINDOW_MS } from './PlaySheet.jsx'

const players = [
  { player_id: 'a', player_name: 'Ann', draft: 0, draft_parts: null, committed_total: 50 },
  { player_id: 'b', player_name: 'Bob', draft: 4, draft_parts: { play: 4, hand: 0, crib: 0 }, committed_total: 110 },
  { player_id: 'c', player_name: 'Cy', draft: 0, draft_parts: null, committed_total: 20 }
]

const setup = (props = {}) => {
  const onAdd = vi.fn()
  render(<PlaySheet players={players} dealerId="a" target={121} onAdd={onAdd} onClose={() => {}} {...props} />)
  return onAdd
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

const wait = (ms) => act(() => { vi.advanceTimersByTime(ms) })

describe('PlaySheet', () => {
  it('starts on the player left of the dealer; a second tap in the combo window stays on the same player', () => {
    const onAdd = setup()
    expect(screen.getByTestId('chip-b')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByText('15'))
    expect(screen.getByTestId('next-c')).toBeInTheDocument()
    wait(COMBO_WINDOW_MS - 500)
    fireEvent.click(screen.getByText('Pair'))
    wait(COMBO_WINDOW_MS - 500)
    expect(screen.getByTestId('chip-b')).toHaveAttribute('aria-checked', 'true')
    wait(600)
    expect(screen.getByTestId('chip-c')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByText('Go'))
    expect(onAdd.mock.calls).toEqual([['b', 2], ['b', 2], ['c', 1]])
  })

  it('tapping a player overrides the pending advance', () => {
    setup()
    fireEvent.click(screen.getByText('15'))
    fireEvent.click(screen.getByTestId('chip-a'))
    wait(COMBO_WINDOW_MS + 100)
    expect(screen.getByTestId('chip-a')).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps the log on the phone and restores it, then Clear play takes every point back', () => {
    const first = render(<PlaySheet players={players} dealerId="a" target={121} storageKey="k1" onAdd={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByText('15'))
    first.unmount()
    const onAdd = vi.fn()
    render(<PlaySheet players={players} dealerId="a" target={121} storageKey="k1" onAdd={onAdd} onClose={() => {}} />)
    expect(screen.getByTestId('play-log')).toHaveTextContent('Bob 15')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('Clear play'))
    expect(onAdd).toHaveBeenCalledWith('b', -2)
    expect(screen.getByTestId('play-log')).toHaveTextContent('Nothing scored yet')
  })

  it('buzzes and names who scored in a toast', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    setup()
    fireEvent.click(screen.getByText('Go'))
    expect(vibrate).toHaveBeenCalledWith([40, 60, 40])
    expect(screen.getByRole('status')).toHaveTextContent('Bob +1 Go')
    delete navigator.vibrate
  })

  it('logs events for all players in order', () => {
    setup()
    fireEvent.click(screen.getByText('15'))
    wait(COMBO_WINDOW_MS + 100)
    fireEvent.click(screen.getByText('Trips'))
    const log = screen.getByTestId('play-log')
    expect(log).toHaveTextContent('Bob 15 ×Cy Trips ×')
  })

  it('tapping a log entry removes just that entry and takes its points back', () => {
    const onAdd = setup()
    fireEvent.click(screen.getByText('15'))
    wait(COMBO_WINDOW_MS + 100)
    fireEvent.click(screen.getByText('Trips'))
    fireEvent.click(screen.getByLabelText('Remove Bob 15'))
    expect(onAdd).toHaveBeenLastCalledWith('b', -2)
    expect(screen.getByTestId('play-log')).toHaveTextContent('Cy Trips')
    expect(screen.getByTestId('play-log')).not.toHaveTextContent('Bob 15')
  })

  it('Undo last removes the newest entry', () => {
    const onAdd = setup()
    fireEvent.click(screen.getByText('Quad'))
    fireEvent.click(screen.getByText('Undo last'))
    expect(onAdd.mock.calls).toEqual([['b', 12], ['b', -12]])
    expect(screen.getByText('Undo last')).toBeDisabled()
  })

  it('Run asks for the length and scores that many points for the selected player', () => {
    const onAdd = setup()
    fireEvent.click(screen.getByText('Run'))
    fireEvent.click(within(screen.getByTestId('run-lengths')).getByText('4'))
    expect(onAdd).toHaveBeenCalledWith('b', 4)
    expect(screen.getByTestId('play-log')).toHaveTextContent('Bob Run of 4')
  })

  it('Heels always goes to the dealer, whoever is selected, and keeps the selection', () => {
    const onAdd = setup()
    fireEvent.click(screen.getByText('Heels'))
    expect(onAdd).toHaveBeenCalledWith('a', 2)
    expect(screen.getByTestId('chip-b')).toHaveAttribute('aria-checked', 'true')
  })

  it('shows play points and total on each chip, and a badge when someone reaches the target', () => {
    setup()
    expect(screen.getByTestId('chip-b')).toHaveTextContent('+4')
    expect(screen.getByTestId('chip-b')).toHaveTextContent('total 114')
    expect(screen.getByTestId('chip-b')).not.toHaveTextContent('121!')
    expect(screen.getByTestId('chip-a')).toHaveTextContent('total 50')
  })

  it('flags the 121 badge when a total reaches the target', () => {
    setup({ players: [{ ...players[0], committed_total: 119, draft: 2, draft_parts: { play: 2, hand: 0, crib: 0 } }, players[1]] })
    expect(screen.getByTestId('chip-a')).toHaveTextContent('121!')
  })
})
