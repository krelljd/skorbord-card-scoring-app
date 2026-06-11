/**
 * Modern loading components using DaisyUI styles
 */

/**
 * Full-screen loading overlay
 */
export function LoadingOverlay({ message = 'Loading...' }) {
  return (
    <div className="fixed inset-0 bg-base-100/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="card bg-base-200 shadow-xl p-8">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-base-content font-medium">{message}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Inline loading spinner
 */
export function LoadingSpinner({ size = 'md', color = 'primary', className = '' }) {
  const sizeClass = {
    xs: 'loading-xs',
    sm: 'loading-sm', 
    md: 'loading-md',
    lg: 'loading-lg'
  }[size]

  return (
    <span className={`loading loading-spinner ${sizeClass} text-${color} ${className}`}></span>
  )
}

/**
 * Loading button with spinner
 */
export function LoadingButton({ loading, children, disabled, className = '', ...props }) {
  return (
    <button
      className={`btn ${className}`}
      disabled={loading || disabled}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  )
}

/**
 * Loading skeleton for cards/content
 */
export function LoadingSkeleton({ lines = 3, className = '' }) {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`bg-base-300 rounded h-4 mb-2 ${
            i === lines - 1 ? 'w-3/4' : 'w-full'
          }`}
        ></div>
      ))}
    </div>
  )
}

/**
 * Loading card placeholder
 */
export function LoadingCard({ className = '' }) {
  return (
    <div className={`card bg-base-200 shadow animate-pulse ${className}`}>
      <div className="card-body">
        <div className="h-6 bg-base-300 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-base-300 rounded w-full mb-2"></div>
        <div className="h-4 bg-base-300 rounded w-5/6 mb-2"></div>
        <div className="h-4 bg-base-300 rounded w-2/3"></div>
      </div>
    </div>
  )
}
