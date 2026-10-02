import { useState, useCallback, useRef } from 'react'

const MAX_DIGITS = 3

/**
 * Number pad for typing an exact point value (this round's draft, or a past
 * round's cell). Returns an integer through onSave.
 */
const NumberPad = ({ title, subtitle, initial = 0, onSave, onCancel, isValid = null, invalidHint = 'Not a possible score', allowNegative = true }) => {
  const [negative, setNegative] = useState(initial < 0)
  const [digits, setDigits] = useState(initial === 0 ? '' : String(Math.abs(initial)))

  // The first key replaces the shown value instead of appending to it
  const untouched = useRef(initial !== 0)

  const value = (digits === '' ? 0 : Number(digits)) * (negative ? -1 : 1)
  const valid = isValid ? isValid(value) : true

  const press = useCallback((d) => {
    const base = untouched.current ? '' : null
    untouched.current = false
    setDigits((prev) => {
      if (base !== null) return d === '0' ? '' : d
      if (prev.length >= MAX_DIGITS) return prev
      if (prev === '' && d === '0') return prev
      return prev + d
    })
  }, [])

  const back = useCallback(() => {
    untouched.current = false
    setDigits((prev) => prev.slice(0, -1))
  }, [])

  return (
    <div className="modal modal-open" role="dialog" aria-label={title}>
      <div className="modal-box max-w-xs">
        <h3 className="font-bold text-lg">{title}</h3>
        {subtitle && <p className="text-sm text-base-content/60">{subtitle}</p>}

        <div
          className="my-3 text-center text-5xl font-bold tabular-nums"
          data-testid="pad-value"
          aria-live="polite"
        >
          {value}
        </div>

        {!valid && (
          <p className="text-center text-sm text-error" role="alert">
            {invalidHint}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className="btn btn-lg" onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button
            type="button"
            disabled={!allowNegative}
            className={`btn btn-lg ${negative ? 'btn-error' : ''}`}
            onClick={() => setNegative((n) => !n)}
            aria-pressed={negative}
            aria-label="Toggle negative"
          >
            +/−
          </button>
          <button type="button" className="btn btn-lg" onClick={() => press('0')}>
            0
          </button>
          <button type="button" className="btn btn-lg" onClick={back} aria-label="Delete last digit">
            ⌫
          </button>
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSave(value)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default NumberPad
