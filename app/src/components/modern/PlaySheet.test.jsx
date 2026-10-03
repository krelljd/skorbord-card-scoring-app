import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import PlaySheet from './PlaySheet.jsx'

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

describe('PlaySheet', () => {
  it('starts on the player left of the dealer and the choice sticks across events', () => {
    const onAdd = setup()
    expect(screen.getByTestId('chip-b')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByText('15'))
    fireEvent.click(screen.getByText('Pair'))
    fireEvent.click(screen.getByTestId('chip-c'))
    fireEvent.click(screen.getByText('Go'))
    expect(onAdd.mock.calls).toEqual([['b', 2], ['b', 2], ['c', 1]])
  })

  it('logs events for all players in order', () => {
    setup()
    fireEvent.click(screen.getByText('15'))
    fireEvent.click(screen.getByTestId('chip-c'))
    fireEvent.click(screen.getByText('Trips'))
    const log = screen.getByTestId('play-log')
    expect(log).toHaveTextContent('Bob 15 ×Cy Trips ×')
  })

  it('tapping a log entry removes just that entry and takes its points back', () => {
    const onAdd = setup()
    fireEvent.click(screen.getByText('15'))
    fireEvent.click(screen.getByTestId('chip-c'))
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
