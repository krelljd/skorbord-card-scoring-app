import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PartSheet from './PartSheet.jsx'

const base = { title: 'Points this round', subtitle: 'Ann', parts: { play: 3, hand: 0, crib: 0 }, onClose: () => {} }

describe('PartSheet', () => {
  it('shows the crib row only for the dealer', () => {
    const { rerender } = render(<PartSheet {...base} isDealer={false} onAddPlay={() => {}} onSetPart={() => {}} />)
    expect(screen.queryByTestId('row-crib')).toBeNull()
    rerender(<PartSheet {...base} isDealer onAddPlay={() => {}} onSetPart={() => {}} />)
    expect(screen.getByTestId('row-crib')).toBeInTheDocument()
  })

  it('quick buttons add play points and Undo takes the last one back', () => {
    const onAddPlay = vi.fn()
    render(<PartSheet {...base} isDealer={false} onAddPlay={onAddPlay} onSetPart={() => {}} />)
    expect(screen.getByText('Undo last')).toBeDisabled()
    fireEvent.click(screen.getByText('+2'))
    fireEvent.click(screen.getByText('+6'))
    fireEvent.click(screen.getByText('Undo last'))
    expect(onAddPlay.mock.calls).toEqual([[2], [6], [-6]])
  })

  it('Heels gives the dealer +2 play', () => {
    const onAddPlay = vi.fn()
    render(<PartSheet {...base} isDealer onAddPlay={onAddPlay} onSetPart={() => {}} />)
    fireEvent.click(screen.getByText('Heels +2'))
    expect(onAddPlay).toHaveBeenCalledWith(2)
  })

  it('hand takes a typed number and refuses one that cannot happen', () => {
    const onSetPart = vi.fn()
    render(<PartSheet {...base} isDealer={false} onAddPlay={() => {}} onSetPart={onSetPart} />)
    fireEvent.click(screen.getByTestId('value-hand'))
    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('9'))
    expect(screen.getByRole('alert')).toHaveTextContent('Not a possible hand score')
    expect(screen.getByText('Save')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Delete last digit'))
    fireEvent.click(screen.getByText('8'))
    fireEvent.click(screen.getByText('Save'))
    expect(onSetPart).toHaveBeenCalledWith('hand', 18)
  })

  it('warns on a very large play total and offers the total-only fallback', () => {
    const onTotalOnly = vi.fn()
    render(<PartSheet {...base} parts={{ play: 70, hand: 0, crib: 0 }} isDealer={false} onAddPlay={() => {}} onSetPart={() => {}} onTotalOnly={onTotalOnly} />)
    expect(screen.getByText(/lot of play points/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Just enter total'))
    expect(onTotalOnly).toHaveBeenCalled()
  })

  it('history mode has no quick buttons', () => {
    render(<PartSheet {...base} quickPlay={false} isDealer={false} onSetPart={() => {}} />)
    expect(screen.queryByText('+2')).toBeNull()
  })
})
