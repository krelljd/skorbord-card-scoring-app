/**
 * Modern error handling utilities for consistent error management
 */

/**
 * Standard error types for the application
 */
export const ErrorTypes = {
  NETWORK: 'NETWORK_ERROR',
  VALIDATION: 'VALIDATION_ERROR', 
  AUTH: 'AUTH_ERROR',
  NOT_FOUND: 'NOT_FOUND_ERROR',
  SERVER: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
}

/**
 * Enhanced error class with additional context
 */
export class AppError extends Error {
  constructor(message, type = ErrorTypes.UNKNOWN, originalError = null, context = {}) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.originalError = originalError
    this.context = context
    this.timestamp = new Date().toISOString()
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    }
  }
}

/**
 * Parse and standardize different types of errors
 */
export function parseError(error, context = {}) {
  // Already an AppError
  if (error instanceof AppError) {
    return error
  }

  // API Error from gameAPI service
  if (error.name === 'APIError') {
    let type = ErrorTypes.SERVER
    
    if (error.status === 404) type = ErrorTypes.NOT_FOUND
    else if (error.status === 401 || error.status === 403) type = ErrorTypes.AUTH
    else if (error.status >= 400 && error.status < 500) type = ErrorTypes.VALIDATION
    else if (error.status >= 500) type = ErrorTypes.SERVER
    
    return new AppError(error.message, type, error, { ...context, status: error.status })
  }

  // Network/fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new AppError(
      'Unable to connect to server. Please check your internet connection.',
      ErrorTypes.NETWORK,
      error,
      context
    )
  }

  // Generic JavaScript errors
  return new AppError(
    error.message || 'An unexpected error occurred',
    ErrorTypes.UNKNOWN,
    error,
    context
  )
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error) {
  const appError = parseError(error)
  
  switch (appError.type) {
    case ErrorTypes.NETWORK:
      return 'Connection problem. Please check your internet and try again.'
    
    case ErrorTypes.NOT_FOUND:
      return 'The requested resource was not found.'
    
    case ErrorTypes.AUTH:
      return 'You are not authorized to perform this action.'
    
    case ErrorTypes.VALIDATION:
      return appError.message || 'Please check your input and try again.'
    
    case ErrorTypes.SERVER:
      return 'Server error. Please try again in a moment.'
    
    default:
      return appError.message || 'Something went wrong. Please try again.'
  }
}

/**
 * Log error with context for debugging
 */
export function logError(error, context = {}) {
  const appError = parseError(error, context)
  
  console.error('App Error:', {
    message: appError.message,
    type: appError.type,
    context: appError.context,
    timestamp: appError.timestamp,
    originalError: appError.originalError,
    stack: appError.stack
  })

  // In production, you might want to send this to an error reporting service
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry, LogRocket, etc.
    // errorReportingService.captureException(appError)
  }
}

/**
 * Retry utility for failed operations
 */
export async function withRetry(
  operation, 
  maxAttempts = 3, 
  delay = 1000,
  backoff = true
) {
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      if (attempt === maxAttempts) {
        break
      }

      // Don't retry certain types of errors
      const appError = parseError(error)
      if (appError.type === ErrorTypes.AUTH || appError.type === ErrorTypes.NOT_FOUND) {
        break
      }

      // Calculate delay with optional exponential backoff
      const currentDelay = backoff ? delay * Math.pow(2, attempt - 1) : delay
      await new Promise(resolve => setTimeout(resolve, currentDelay))
    }
  }

  throw lastError
}

/**
 * Safe async operation wrapper
 */
export async function safeAsync(operation, fallback = null) {
  try {
    return await operation()
  } catch (error) {
    logError(error, { operation: operation.name })
    return fallback
  }
}
