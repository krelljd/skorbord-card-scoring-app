import { useState, useRef, useCallback } from 'react'

/**
 * Modern hook for handling pointer interactions with long press support
 * Enhanced for iOS Safari compatibility and touch event reliability
 */
export function usePointerInteraction({ 
  onSingleTap, 
  onLongPress, 
  disabled = false,
  longPressDelay = 500 // Increased from 300ms for better reliability
}) {
  const [glowingButton, setGlowingButton] = useState(null)
  const longPressTimer = useRef(null)
  const pointerStartTime = useRef(null)
  const longPressExecuted = useRef(false)
  const currentPointerId = useRef(null)
  const startPosition = useRef({ x: 0, y: 0 }) // Track initial position
  const moveThreshold = 10 // pixels - maximum movement before canceling

  const clearGlow = useCallback(() => {
    setTimeout(() => setGlowingButton(null), 150)
  }, [])

  const cleanup = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    currentPointerId.current = null
    longPressExecuted.current = false
    pointerStartTime.current = null
    startPosition.current = { x: 0, y: 0 }
    clearGlow()
  }, [clearGlow])

  const handlePointerDown = useCallback((e, change) => {
    if (disabled) return
    
    // Prevent default to avoid iOS Safari issues
    e.preventDefault()
    e.stopPropagation()
    
    // Capture the pointer for this element
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch (err) {
      console.debug('Pointer capture not supported:', err.message)
    }
    
    currentPointerId.current = e.pointerId
    
    // Store initial position for movement detection
    startPosition.current = { x: e.clientX, y: e.clientY }
    
    // Set visual feedback
    const buttonType = change > 0 ? 'plus' : 'minus'
    setGlowingButton(buttonType)
    
    // Reset state
    longPressExecuted.current = false
    pointerStartTime.current = Date.now()
    
    // Start long press timer
    longPressTimer.current = setTimeout(() => {
      if (currentPointerId.current === e.pointerId && !longPressExecuted.current) {
        longPressExecuted.current = true
        onLongPress?.(change)
        
        // Provide haptic feedback on supported devices
        if (navigator.vibrate) {
          navigator.vibrate([50, 100, 50])
        }
        
        clearGlow()
      }
    }, longPressDelay)
  }, [disabled, onLongPress, longPressDelay, clearGlow])

  const handlePointerMove = useCallback((e) => {
    if (disabled || currentPointerId.current !== e.pointerId) return
    
    // Check if pointer moved too much (drag detection)
    const deltaX = Math.abs(e.clientX - startPosition.current.x)
    const deltaY = Math.abs(e.clientY - startPosition.current.y)
    
    if (deltaX > moveThreshold || deltaY > moveThreshold) {
      // Cancel the interaction if user is dragging
      cleanup()
    }
  }, [disabled, cleanup, moveThreshold])

  const handlePointerUp = useCallback((e, change) => {
    if (disabled || currentPointerId.current !== e.pointerId) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const wasLongPress = longPressExecuted.current
    const duration = Date.now() - (pointerStartTime.current || 0)
    
    // Clean up timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    
    // Execute single tap if long press wasn't triggered and within time bounds
    if (!wasLongPress && duration >= 50 && duration < longPressDelay) {
      onSingleTap?.(change)
      
      // Provide light haptic feedback for single tap
      if (navigator.vibrate) {
        navigator.vibrate(30)
      }
    }
    
    cleanup()
  }, [disabled, onSingleTap, longPressDelay, cleanup])

  const handlePointerCancel = useCallback((e) => {
    if (currentPointerId.current === e.pointerId) {
      cleanup()
    }
  }, [cleanup])

  // Also handle pointer leave as a form of cancellation
  const handlePointerLeave = useCallback((e) => {
    if (currentPointerId.current === e.pointerId) {
      cleanup()
    }
  }, [cleanup])

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    glowingButton
  }
}
