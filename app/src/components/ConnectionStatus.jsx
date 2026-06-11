import { useConnection } from '../contexts/ConnectionContext.jsx'

const ConnectionStatus = () => {
  const { isConnected, connectionError, isReconnecting, connectionAttempts } = useConnection()

  if (isConnected && !connectionError) {
    return (
      <div className="connection-indicator badge-success flex items-center">
      <svg
        className="w-5 h-5 mr-1 text-green-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13a10 10 0 0114 0M8.5 16.5a5.5 5.5 0 017 0M12 20h.01"
        />
      </svg>
      </div>
    )
  }

  if (isReconnecting) {
    return (
      <div className="connection-indicator text-sm badge-warning">
        🔄 Reconnecting...
      </div>
    )
  }

  if (connectionAttempts > 0 && connectionAttempts < 3) {
    return (
      <div className="connection-indicator text-sm badge-warning">
        🔄 Connecting (attempt {connectionAttempts})...
      </div>
    )
  }

  if (connectionError) {
    return (
      <div className="connection-indicator text-sm connection-disconnected">
        ⚠ Connection Error
      </div>
    )
  }

  return (
    <div className="connection-indicator text-sm connection-disconnected badge-error">
      ❌ Disconnected
    </div>
  )
}

export default ConnectionStatus
