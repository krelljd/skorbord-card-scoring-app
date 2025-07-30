import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useConnection } from '../contexts/ConnectionContext.jsx'
import { useGameManager } from '../hooks/useGameManager.js'
import { useToast } from '../hooks/useUIState.js'
import { parseError, logError } from '../utils/errorUtils.js'
import GameSetup from './GameSetup.jsx'
import ConnectionStatus from './ConnectionStatus.jsx'
import GamePlay from './GamePlay.jsx'
import RivalryStats from './RivalryStats.jsx'
import AdminPanel from './AdminPanel.jsx'
import { ToastContainer } from './Toast.jsx'
import { LoadingOverlay } from './Loading.jsx'

/**
 * Modern CardApp component that integrates new state management alongside existing functionality
 * Phase 1: Both old and new systems work together for gradual migration
 */
const ModernCardApp = () => {
  const { sqid } = useParams()
  const { socket, isConnected } = useConnection()
  
  // Legacy state (keeping for backwards compatibility during Phase 1)
  const [currentView, setCurrentView] = useState('setup')
  const [players, setPlayers] = useState([])
  const [gameTypes, setGameTypes] = useState([])
  const [rivalries, setRivalries] = useState([])
  const [legacyError, setLegacyError] = useState(null)
  const [legacyLoading, setLegacyLoading] = useState(true)

  // Modern state management
  const gameManager = useGameManager(sqid)
  const { toasts, showToast, hideToast, error: showError, success: showSuccess } = useToast()

  // Combined loading state
  const isLoading = legacyLoading || gameManager.loading

  // Combined error handling
  useEffect(() => {
    if (gameManager.error) {
      const errorMessage = parseError(gameManager.error).message
      showError(errorMessage)
      logError(gameManager.error, { component: 'CardApp', sqid })
    }
  }, [gameManager.error, showError, sqid])

  useEffect(() => {
    if (legacyError) {
      showError(legacyError)
    }
  }, [legacyError, showError])

  // Use relative paths since we have Vite proxy configured
  const API_URL = ''

  // Initialize data when socket connects
  useEffect(() => {
    if (socket && isConnected && sqid) {
      setLegacyLoading(true)
      setLegacyError(null)

      // Join the sqid room (now required for all connections)
      socket.emit('join-sqid', sqid)
      
      // Load initial data (legacy approach for non-game data)
      loadInitialData()

      // Socket event listeners for real-time updates
      socket.on('game_updated', handleGameUpdate)
      socket.on('game_started', handleGameStarted)
      socket.on('dealer_changed', handleDealerChanged)
      socket.on('player_updated', handlePlayerUpdate)
      socket.on('rivalry_updated', handleRivalryUpdate)
      socket.on('error', handleSocketError)

      return () => {
        socket.off('game_updated', handleGameUpdate)
        socket.off('game_started', handleGameStarted)
        socket.off('player_updated', handlePlayerUpdate)
        socket.off('rivalry_updated', handleRivalryUpdate)
        socket.off('error', handleSocketError)
      }
    }
  }, [socket, isConnected, sqid])

  const loadInitialData = async () => {
    try {
      // Load players, game types, and rivalries (not covered by gameManager yet)
      const [playersData, gameTypesData, rivalriesData] = await Promise.all([
        fetch(`${API_URL}/api/players`).then(res => res.json()),
        fetch(`${API_URL}/api/game-types`).then(res => res.json()),
        fetch(`${API_URL}/api/sqids/${sqid}/rivalries`).then(res => res.json())
      ])

      // Handle API response structure safely
      setPlayers(Array.isArray(playersData) ? playersData : (playersData?.data || []))
      setGameTypes(Array.isArray(gameTypesData) ? gameTypesData : (gameTypesData?.data || []))
      setRivalries(Array.isArray(rivalriesData) ? rivalriesData : (rivalriesData?.data || []))

      // Show current game if it exists (gameManager handles this)
      if (gameManager.game) {
        setCurrentView('playing')
      }
    } catch (error) {
      console.error('Failed to load initial data:', error)
      setLegacyError('Failed to load application data')
    } finally {
      setLegacyLoading(false)
    }
  }

  // Legacy event handlers (keeping for backwards compatibility)
  const handleGameUpdate = (data) => {
    console.log('Game updated:', data)
    // Game updates are now handled by gameManager
    showSuccess('Game updated')
  }

  const handleGameStarted = (data) => {
    console.log('Game started:', data)
    setCurrentView('playing')
    showSuccess('Game started!')
  }

  const handleDealerChanged = (data) => {
    console.log('Dealer changed:', data)
    showSuccess(`Dealer changed to ${data.playerName}`)
  }

  const handlePlayerUpdate = (data) => {
    console.log('Player updated:', data)
    // Refresh players list
    loadInitialData()
  }

  const handleRivalryUpdate = (data) => {
    console.log('Rivalry updated:', data)
    // Refresh rivalries
    loadInitialData()
  }

  const handleSocketError = (error) => {
    console.error('Socket error:', error)
    setLegacyError(error.message || 'Connection error')
  }

  // Modern game event handlers
  const handleGameCreated = (game) => {
    // Game creation is now handled by gameManager
    setCurrentView('playing')
    showSuccess('Game created successfully!')
  }

  const handleGameFinalized = () => {
    showSuccess('Game finalized!')
    setCurrentView('rivalry-stats')
  }

  // Error clearing
  const clearErrors = () => {
    setLegacyError(null)
    gameManager.clearError()
  }

  // Render loading state
  if (isLoading) {
    return <LoadingOverlay message="Loading Skorbord..." />
  }

  // Render main app
  return (
    <div className="min-h-screen bg-base-100">
      {/* Connection Status */}
      <ConnectionStatus />
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={hideToast} />

      {/* Error Display (if any persist) */}
      {(legacyError || gameManager.error) && (
        <div className="alert alert-error shadow-lg m-4">
          <div>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{legacyError || gameManager.error}</span>
          </div>
          <div className="flex-none">
            <button className="btn btn-sm btn-ghost" onClick={clearErrors}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {currentView === 'setup' && (
          <GameSetup
            players={players}
            gameTypes={gameTypes}
            onGameCreated={handleGameCreated}
            onPlayerAdded={() => loadInitialData()}
            sqid={sqid}
          />
        )}

        {currentView === 'playing' && gameManager.game && (
          <GamePlay
            game={gameManager.game}
            gameStats={gameManager.gameStats}
            onGameFinalized={handleGameFinalized}
            onBackToSetup={() => setCurrentView('setup')}
            sqid={sqid}
            // Pass modern game manager methods
            gameManager={gameManager}
          />
        )}

        {currentView === 'rivalry-stats' && (
          <RivalryStats
            rivalries={rivalries}
            onBackToSetup={() => setCurrentView('setup')}
            sqid={sqid}
          />
        )}

        {currentView === 'admin' && (
          <AdminPanel
            onBackToSetup={() => setCurrentView('setup')}
            sqid={sqid}
          />
        )}
      </main>

      {/* Navigation */}
      <nav className="btm-nav btm-nav-lg bg-base-200 border-t border-base-300">
        <button 
          className={currentView === 'setup' ? 'active' : ''}
          onClick={() => setCurrentView('setup')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="btm-nav-label">Setup</span>
        </button>

        <button 
          className={currentView === 'playing' ? 'active' : ''}
          onClick={() => setCurrentView('playing')}
          disabled={!gameManager.game}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.5a2.5 2.5 0 110 5H9" />
          </svg>
          <span className="btm-nav-label">Game</span>
        </button>

        <button 
          className={currentView === 'rivalry-stats' ? 'active' : ''}
          onClick={() => setCurrentView('rivalry-stats')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="btm-nav-label">Stats</span>
        </button>

        <button 
          className={currentView === 'admin' ? 'active' : ''}
          onClick={() => setCurrentView('admin')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="btm-nav-label">Admin</span>
        </button>
      </nav>
    </div>
  )
}

export default ModernCardApp
