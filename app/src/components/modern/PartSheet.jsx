import { useState } from 'react'
import NumberPad from './NumberPad.jsx'
import { PARTS, PART_LABELS, PEG_BUTTONS, PLAY_WARNING, isValidPartValue } from '../../utils/cribbage.js'

/**
 * Bottom sheet for one player's cribbage points: play, hand and crib.
 * Play takes quick taps (1, 2, 3, 4, 6) with Undo for the last one; hand and crib
 * take one number on the pad, which refuses scores that cannot happen.
 * The crib row only shows for the dealer.
 *
 * quickPlay=false (history corrections) shows play as a number like the others.
 * onTotalOnly (optional) offers the old way: one total, with no breakdown.
 */
const PartSheet = ({ title, subtitle, parts, isDealer, quickPlay = true, onAddPlay, onSetPart, onTotalOnly, onClose }) => {
  const [padPart, setPadPart] = useState(null)
  const [taps, setTaps] = useState([])

  const tap = (delta) => {
    setTaps((t) => [...t, delta])
    onAddPlay?.(delta)
  }

  const undo = () => {
    const last = taps[taps.length - 1]
    if (last === undefined) return
    setTaps((t) => t.slice(0, -1))
    onAddPlay?.(-last)
  }

  const rows = PARTS.filter((part) => part !== 'crib' || isDealer)
  const total = PARTS.reduce((sum, part) => sum + (parts[part] || 0), 0)

  return (
    <div className="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-label={title}>
      <div className="modal-box">
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="font-bold text-lg">{title}</h3>
            {subtitle && <p className="text-sm text-base-content/60">{subtitle}</p>}
          </div>
          <div className="text-3xl font-bold tabular-nums" data-testid="sheet-total">{total}</div>
        </div>

        <div className="mt-3 space-y-3">
          {rows.map((part) => (
            <div key={part} className="rounded-box bg-base-200 p-3" data-testid={`row-${part}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{PART_LABELS[part]}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost text-xl font-bold tabular-nums"
                  onClick={() => setPadPart(part)}
                  aria-label={`${PART_LABELS[part]} points: ${parts[part] || 0}. Tap to type`}
                  data-testid={`value-${part}`}
                >
                  {parts[part] || 0}
                </button>
              </div>

              {part === 'play' && quickPlay && (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-2">
                    {PEG_BUTTONS.map((n) => (
                      <button key={n} type="button" className="btn btn-primary btn-md flex-1" onClick={() => tap(n)}>
                        +{n}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {isDealer && (
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => tap(2)}>
                        His heels +2
                      </button>
                    )}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={undo} disabled={taps.length === 0}>
                      Undo last
                    </button>
                  </div>
                </div>
              )}

              {part === 'play' && (parts.play || 0) > PLAY_WARNING && (
                <p className="mt-1 text-xs text-warning">That is a lot of play points for one round. Check it.</p>
              )}
            </div>
          ))}
        </div>

        <div className="modal-action justify-between">
          {onTotalOnly ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onTotalOnly}>
              Just enter total
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {padPart && (
        <NumberPad
          title={`${PART_LABELS[padPart]} points`}
          subtitle={subtitle}
          initial={parts[padPart] || 0}
          allowNegative={false}
          isValid={(v) => isValidPartValue(padPart, v)}
          invalidHint={padPart === 'play' ? 'Cannot be negative' : `Not a possible ${padPart} score`}
          onSave={(value) => {
            const part = padPart
            setPadPart(null)
            setTaps([])
            onSetPart(part, value)
          }}
          onCancel={() => setPadPart(null)}
        />
      )}
    </div>
  )
}

export default PartSheet
