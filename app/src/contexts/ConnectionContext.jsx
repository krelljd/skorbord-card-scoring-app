import { createContext, useContext, useState, useEffect } from 'react'
import { io } from 'socket.io-client'

const ConnectionContext = createContext()

export const useConnection = () => {
  const context = useContext(ConnectionContext)
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider')
  }
  return context
}


export const ConnectionProvider = ({ children, sqid }) => {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [connectionAttempts, setConnectionAttempts] = useState(0)

  const createSocket = (socketUrl, options = {}) => {
    console.log('🔌 Creating socket connection to:', socketUrl)
    return io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timeout: 20000,
      retries: 5,
      ackTimeout: 10000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: 10,
      upgrade: true,
      rememberUpgrade: false,
      ...options
    })
  }

  useEffect(() => {
    if (!sqid) return
    
    let newSocket = null
    
    const tryConnection = (attemptNumber = 0) => {
      if (attemptNumber >= 2) {
        console.error('❌ All connection attempts failed')
        setConnectionError('Unable to connect to server')
        setIsReconnecting(false)
        return
      }
      
      // First try: Use Vite proxy (development) or production URL
      // Second try: Direct connection to API server
      let socketUrl
      let options = {}
      
      if (attemptNumber === 0) {
        socketUrl = process.env.NODE_ENV === 'production' ? __API_URL__ : '/'
        console.log('🔌 Attempt', attemptNumber + 1, '- Connecting via proxy/production URL:', socketUrl)
      } else {
        socketUrl = process.env.NODE_ENV === 'production' ? __API_URL__ : 'http://localhost:2525'
        console.log('🔌 Attempt', attemptNumber + 1, '- Direct connection to API server:', socketUrl)
        options = {
          reconnection: false, // Don't auto-reconnect on direct connection
          timeout: 10000 // Shorter timeout for direct connection
        }
      }
      
      newSocket = createSocket(socketUrl, options)
      setConnectionAttempts(attemptNumber + 1)
      
      // Join sqid room after connect
      newSocket.on('connect', () => {
        console.log('✅ Socket connected:', newSocket.id)
        newSocket.emit('join-sqid', sqid)
        setIsConnected(true)
        setConnectionError(null)
        setIsReconnecting(false)
        setConnectionAttempts(0)
      })

      newSocket.on('disconnect', (reason, details) => {
        console.log('Socket disconnected:', reason, details)
        setIsConnected(false)
        if (reason === 'io server disconnect') {
          // Server disconnected, need to reconnect manually
          newSocket.connect()
        }
      })

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error (attempt', attemptNumber + 1, '):', error)
        setIsConnected(false)
        
        // Clean up current socket before trying next attempt
        newSocket.close()
        
        // Try next connection method
        setTimeout(() => {
          tryConnection(attemptNumber + 1)
        }, 1000)
      })

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('Socket reconnected after', attemptNumber, 'attempts')
        setIsReconnecting(false)
        setConnectionError(null)
      })

      newSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log('Socket reconnect attempt:', attemptNumber)
        setIsReconnecting(true)
      })

      newSocket.on('reconnect_error', (error) => {
        console.error('Socket reconnect error:', error)
        setConnectionError('Reconnection failed')
      })

      newSocket.on('reconnect_failed', () => {
        console.error('Socket reconnect failed')
        setConnectionError('Unable to reconnect')
        setIsReconnecting(false)
      })

      setSocket(newSocket)
    }
    
    // Start connection attempts
    tryConnection()

    // Cleanup on unmount
    return () => {
      if (newSocket) {
        newSocket.close()
      }
    }
  }, [sqid])

  const value = {
    socket,
    isConnected,
    connectionError,
    isReconnecting,
    connectionAttempts
  }

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  )
}
