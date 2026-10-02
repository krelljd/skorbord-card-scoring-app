import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NumberPad from './NumberPad.jsx'

describe('NumberPad', () => {
  it('builds a number from keys and saves it', () => {
    const onSave = vi.fn()
    render(<NumberPad title="t" initial={0} onSave={onSave} onCancel={() => {}} />)
    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('2'))
    expect(screen.getByTestId('pad-value')).toHaveTextContent('12')
    fireEvent.click(screen.getByText('Save'))
    expect(onSave).toHaveBeenCalledWith(12)
  })

  it('supports negatives and backspace, and starts from the current value', () => {
    const onSave = vi.fn()
    render(<NumberPad title="t" initial={-15} onSave={onSave} onCancel={() => {}} />)
    expect(screen.getByTestId('pad-value')).toHaveTextContent('-15')
    fireEvent.click(screen.getByLabelText('Delete last digit'))
    fireEvent.click(screen.getByText('Save'))
    expect(onSave).toHaveBeenCalledWith(-1)
  })

  it('first key replaces the shown value, later keys append', () => {
    const onSave = vi.fn()
    render(<NumberPad title="t" initial={7} onSave={onSave} onCancel={() => {}} />)
    fireEvent.click(screen.getByText('5'))
    expect(screen.getByTestId('pad-value')).toHaveTextContent('5')
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('Save'))
    expect(onSave).toHaveBeenCalledWith(53)
  })
})

describe('NumberPad validation', () => {
  it('disables Save and shows the hint when the value is not allowed', () => {
    render(<NumberPad title="t" initial={0} isValid={(v) => v !== 19} invalidHint="Nope" onSave={() => {}} onCancel={() => {}} />)
    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('9'))
    expect(screen.getByRole('alert')).toHaveTextContent('Nope')
    expect(screen.getByText('Save')).toBeDisabled()
  })

  it('can turn the negative key off', () => {
    render(<NumberPad title="t" initial={0} allowNegative={false} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('Toggle negative')).toBeDisabled()
  })
})
