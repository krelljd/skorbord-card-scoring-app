import { useState, useCallback, useEffect } from 'react'

/**
 * Hook for managing UI state with local storage persistence
 */
export function useUIState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const updateState = useCallback((newState) => {
    setState(newState)
    try {
      localStorage.setItem(key, JSON.stringify(newState))
    } catch (error) {
      console.warn('Failed to persist UI state:', error)
    }
  }, [key])

  return [state, updateState]
}

/**
 * Hook for managing toast notifications
 */
export function useToast() {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now()
    const toast = { id, message, type, duration }
    
    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }

    return id
  }, [])

  const hideToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearToasts = useCallback(() => {
    setToasts([])
  }, [])

  return {
    toasts,
    showToast,
    hideToast,
    clearToasts,
    // Convenience methods
    success: (message, duration) => showToast(message, 'success', duration),
    error: (message, duration) => showToast(message, 'error', duration),
    warning: (message, duration) => showToast(message, 'warning', duration),
    info: (message, duration) => showToast(message, 'info', duration)
  }
}

/**
 * Hook for managing loading states with automatic timeout
 */
export function useLoading(timeoutMs = 30000) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const startLoading = useCallback(() => {
    setLoading(true)
    setError(null)
  }, [])

  const stopLoading = useCallback(() => {
    setLoading(false)
  }, [])

  const setLoadingError = useCallback((err) => {
    setLoading(false)
    setError(err)
  }, [])

  // Auto-timeout for loading states
  useEffect(() => {
    if (!loading || timeoutMs <= 0) return

    const timeout = setTimeout(() => {
      setLoading(false)
      setError(new Error('Operation timed out'))
    }, timeoutMs)

    return () => clearTimeout(timeout)
  }, [loading, timeoutMs])

  return {
    loading,
    error,
    startLoading,
    stopLoading,
    setError: setLoadingError,
    clearError: () => setError(null)
  }
}

/**
 * Hook for managing form state with validation
 */
export function useForm(initialValues = {}, validationRules = {}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouchedFields] = useState({})

  const setValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }
  }, [errors])

  const setTouched = useCallback((name) => {
    setTouchedFields(prev => ({ ...prev, [name]: true }))
  }, [])

  const validate = useCallback(() => {
    const newErrors = {}
    
    Object.keys(validationRules).forEach(field => {
      const rule = validationRules[field]
      const value = values[field]
      
      if (typeof rule === 'function') {
        const error = rule(value, values)
        if (error) newErrors[field] = error
      } else if (rule.required && (!value || value.toString().trim() === '')) {
        newErrors[field] = rule.message || `${field} is required`
      }
    })
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [values, validationRules])

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouchedFields({})
  }, [initialValues])

  const handleSubmit = useCallback((onSubmit) => {
    return (e) => {
      e.preventDefault()
      if (validate()) {
        onSubmit(values)
      }
    }
  }, [values, validate])

  return {
    values,
    errors,
    touched,
    setValue,
    setTouched,
    validate,
    reset,
    handleSubmit,
    isValid: Object.keys(errors).length === 0
  }
}

/**
 * Hook for managing modal state
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  return {
    isOpen,
    open,
    close,
    toggle
  }
}

/**
 * Hook for debouncing values
 */
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
