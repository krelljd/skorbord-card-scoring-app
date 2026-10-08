import { useConnection } from '../contexts/ConnectionContext.jsx'

// Small dot plus a tiny label. The label carries the meaning, so color is not the only cue.
const Status = ({ tone, label, pulse = false }) => (
  <span className={`connection-indicator connection-${tone}`} role="status">
    <i className={`connection-dot ${pulse ? 'connection-pulse' : ''}`} aria-hidden="true" />
    <span className="pc-label font-semibold">{label}</span>
  </span>
)

const ConnectionStatus = () => {
  const { isConnected, connectionError, isReconnecting, connectionAttempts } = useConnection()

  if (isConnected && !connectionError) return <Status tone="ok" label="Online" />
  if (isReconnecting) return <Status tone="warn" label="Reconnecting" pulse />
  if (connectionAttempts > 0 && connectionAttempts < 3) return <Status tone="warn" label="Connecting" pulse />
  if (connectionError) return <Status tone="bad" label="Connection error" />
  return <Status tone="bad" label="Offline" />
}

export default ConnectionStatus
