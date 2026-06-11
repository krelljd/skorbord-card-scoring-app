/**
 * Modern WebSocket service using async/await patterns
 * Works alongside existing ConnectionContext for backwards compatibility
 */

class SocketService {
  constructor() {
    this.socket = null
    this.eventListeners = new Map()
    this.connectionPromise = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
  }

  /**
   * Connect to WebSocket server
   * @param {string} sqid - Game identifier
   * @param {object} options - Connection options
   * @returns {Promise<Socket>} - Connected socket instance
   */
  async connect(sqid, options = {}) {
    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = this._createConnection(sqid, options)
    return this.connectionPromise
  }

  async _createConnection(sqid, options) {
    try {
      const { io } = await import('socket.io-client')
      
      const socketUrl = this._getSocketUrl()
      console.log('🔌 Connecting to WebSocket:', socketUrl)

      this.socket = io(socketUrl, {
        path: '/socket.io',
        query: { sqid },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 5000,
        upgrade: true,
        rememberUpgrade: false,
        ...options
      })

      await this._setupEventListeners()
      await this._waitForConnection()

      this.reconnectAttempts = 0
      return this.socket
    } catch (error) {
      this.connectionPromise = null
      throw new Error(`Failed to connect to WebSocket: ${error.message}`)
    }
  }

  _getSocketUrl() {
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location
      const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
      return `${wsProtocol}//${hostname}:${port || (protocol === 'https:' ? 443 : 80)}`
    }
    return process.env.VITE_SOCKET_URL || 'ws://localhost:2424'
  }

  async _setupEventListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected')
      this._emit('connection:status', { connected: true })
    })

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason)
      this._emit('connection:status', { connected: false, reason })
    })

    this.socket.on('connect_error', (error) => {
      console.error('🔥 WebSocket connection error:', error)
      this._emit('connection:error', { error: error.message })
    })

    this.socket.on('reconnect', (attempt) => {
      console.log(`🔄 WebSocket reconnected on attempt ${attempt}`)
      this._emit('connection:status', { connected: true, reconnected: true })
    })

    this.socket.on('reconnect_error', (error) => {
      console.error('🔥 WebSocket reconnection error:', error)
      this._emit('connection:error', { error: error.message, reconnecting: true })
    })
  }

  async _waitForConnection() {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not initialized'))
        return
      }

      if (this.socket.connected) {
        resolve()
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, 10000)

      this.socket.once('connect', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.socket.once('connect_error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  /**
   * Emit event to server
   * @param {string} event - Event name
   * @param {any} data - Event data
   * @returns {Promise<any>} - Server response
   */
  async emit(event, data) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected')
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to ${event}`))
      }, 10000)

      this.socket.emit(event, data, (response) => {
        clearTimeout(timeout)
        if (response?.error) {
          reject(new Error(response.error))
        } else {
          resolve(response)
        }
      })
    })
  }

  /**
   * Listen for server events
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * @returns {Function} - Cleanup function
   */
  on(event, callback) {
    if (!this.socket) {
      console.warn(`Cannot listen for ${event}: socket not connected`)
      return () => {}
    }

    this.socket.on(event, callback)
    
    // Return cleanup function
    return () => {
      this.socket?.off(event, callback)
    }
  }

  /**
   * Listen for service events (connection status, etc.)
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * @returns {Function} - Cleanup function
   */
  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event).add(callback)

    // Return cleanup function
    return () => {
      const listeners = this.eventListeners.get(event)
      if (listeners) {
        listeners.delete(callback)
      }
    }
  }

  _emit(event, data) {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error)
        }
      })
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.connectionPromise = null
    this.eventListeners.clear()
  }

  /**
   * Get connection status
   */
  get connected() {
    return this.socket?.connected || false
  }

  /**
   * Get socket instance (for backwards compatibility)
   */
  get socketInstance() {
    return this.socket
  }
}

// Create singleton instance
const socketService = new SocketService()

export default socketService
