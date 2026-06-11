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

  const createSocket = (socketUrl) => {
    console.log('🔌 Creating socket connection to:', socketUrl)
    return io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      upgrade: true,
      rememberUpgrade: false,
      auth: { sqid } // required by the server socket auth middleware
    })
  }

  useEffect(() => {
    if (!sqid) return

    const socketUrl = process.env.NODE_ENV === 'production' ? __API_URL__ : 'http://localhost:2525'
    const newSocket = createSocket(socketUrl)

    newSocket.on('connect', () => {
      console.log('✅ Socket connected:', newSocket.id)
      newSocket.emit('join-sqid', sqid)
      setIsConnected(true)
      setConnectionError(null)
      setIsReconnecting(false)
      setConnectionAttempts(0)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      setIsConnected(false)
      // socket.io auto-reconnects unless the server explicitly disconnected us.
      if (reason === 'io server disconnect') {
        newSocket.connect()
      }
    })

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      setIsConnected(false)
      setConnectionError('Unable to connect to server')
    })

    newSocket.io.on('reconnect_attempt', (attempt) => {
      console.log('Socket reconnect attempt:', attempt)
      setIsReconnecting(true)
      setConnectionAttempts(attempt)
    })

    newSocket.io.on('reconnect', (attempt) => {
      console.log('Socket reconnected after', attempt, 'attempts')
      setIsReconnecting(false)
      setConnectionError(null)
    })

    newSocket.io.on('reconnect_failed', () => {
      console.error('Socket reconnect failed')
      setConnectionError('Unable to reconnect')
      setIsReconnecting(false)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
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
