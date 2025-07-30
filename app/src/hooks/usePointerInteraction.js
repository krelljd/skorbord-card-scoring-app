import { useState, useRef, useCallback } from 'react'

/**
 * Modern hook for handling pointer interactions with long press support
 * Replaces the complex pointer handling logic with a clean, reusable hook
 */
export function usePointerInteraction({ 
  onSingleTap, 
  onLongPress, 
  disabled = false,
  longPressDelay = 300 
}) {
  const [glowingButton, setGlowingButton] = useState(null)
  const longPressTimer = useRef(null)
  const pointerStartTime = useRef(null)
  const longPressExecuted = useRef(false)
  const currentPointerId = useRef(null)

  const clearGlow = useCallback(() => {
    setTimeout(() => setGlowingButton(null), 150)
  }, [])

  const handlePointerDown = useCallback((e, change) => {
    if (disabled) return
    
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    currentPointerId.current = e.pointerId
    
    // Set visual feedback
    const buttonType = change > 0 ? 'plus' : 'minus'
    setGlowingButton(buttonType)
    
    // Reset state
    longPressExecuted.current = false
    pointerStartTime.current = Date.now()
    
    // Start long press timer
    longPressTimer.current = setTimeout(() => {
      if (currentPointerId.current === e.pointerId) {
        longPressExecuted.current = true
        onLongPress?.(change)
        clearGlow()
      }
    }, longPressDelay)
  }, [disabled, onLongPress, longPressDelay, clearGlow])

  const handlePointerUp = useCallback((e, change) => {
    if (disabled || currentPointerId.current !== e.pointerId) return
    
    clearTimeout(longPressTimer.current)
    currentPointerId.current = null
    
    // Execute single tap if long press wasn't triggered
    if (!longPressExecuted.current) {
      const duration = Date.now() - (pointerStartTime.current || 0)
      if (duration < longPressDelay && duration > 50) {
        onSingleTap?.(change)
      }
    }
    
    clearGlow()
    
    // Reset after delay
    setTimeout(() => {
      longPressExecuted.current = false
      pointerStartTime.current = null
    }, 100)
  }, [disabled, onSingleTap, longPressDelay, clearGlow])

  const handlePointerCancel = useCallback((e) => {
    if (currentPointerId.current === e.pointerId) {
      clearTimeout(longPressTimer.current)
      currentPointerId.current = null
      longPressExecuted.current = false
      pointerStartTime.current = null
      clearGlow()
    }
  }, [clearGlow])

  return {
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    glowingButton
  }
}
