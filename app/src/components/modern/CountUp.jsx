import { useEffect, useRef } from 'react'
import { reducedMotion } from '../../utils/motion.js'

const STEP_MS = 40

/**
 * A number that counts up from 0 when it first appears. The rendered value is always the real one; the
 * count only rewrites the text for a moment, so later changes (a corrected score) show at once.
 */
const CountUp = ({ value, delay = 0, ms = 700, prefix = '' }) => {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    if (!node || reducedMotion() || !Number.isFinite(value)) return undefined
    const steps = Math.max(1, Math.round(ms / STEP_MS))
    const timers = []
    node.textContent = `${prefix}0`
    for (let i = 1; i <= steps; i += 1) {
      timers.push(setTimeout(() => { node.textContent = `${prefix}${Math.round((value * i) / steps)}` }, delay + i * STEP_MS))
    }
    return () => { timers.forEach(clearTimeout); node.textContent = `${prefix}${value}` }
    // Only on first appearance; a later edit renders the new value without counting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Keyed by value so React never reconciles against text this component rewrote
  return <span key={value} ref={ref}>{prefix}{value}</span>
}

export default CountUp
