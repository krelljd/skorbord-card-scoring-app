import { Component } from 'react'

/**
 * Error Boundary component following React best practices
 * Catches JavaScript errors anywhere in the child component tree
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console and any error reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    })

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // Custom error UI using DaisyUI components
      return (
        <div className="min-h-screen bg-base-100 flex items-center justify-center p-4">
          <div className="card w-full max-w-md bg-error text-error-content shadow-xl">
            <div className="card-body text-center">
              <h2 className="card-title justify-center">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Something went wrong
              </h2>
              <p className="text-sm opacity-80 mb-4">
                We encountered an unexpected error. Please refresh the page to try again.
              </p>
              
              {process.env.NODE_ENV === 'development' && (
                <div className="collapse collapse-arrow bg-base-200 text-base-content">
                  <input type="checkbox" /> 
                  <div className="collapse-title text-sm font-medium">
                    View error details
                  </div>
                  <div className="collapse-content text-xs">
                    <pre className="whitespace-pre-wrap break-words">
                      {this.state.error && this.state.error.toString()}
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                </div>
              )}
              
              <div className="card-actions justify-center mt-4">
                <button 
                  className="btn btn-primary"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </button>
                <button 
                  className="btn btn-ghost"
                  onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
