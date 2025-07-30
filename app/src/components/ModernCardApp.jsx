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
    <div className="mobile-container slide-in-bottom">
      {/* Header with navigation - fixed at top */}
      <div className="navbar bg-base-200 rounded-lg mb-2">
        <div className="navbar-start">
          {/* Mobile dropdown menu */}
          <div className="dropdown">
            <div tabIndex={0} role="button" className="btn btn-ghost lg:hidden">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="2" 
                  d="M4 6h16M4 12h8m-8 6h16" 
                />
              </svg>
            </div>
            <ul 
              tabIndex={0} 
              className="menu menu-sm dropdown-content bg-base-100 text-base-content rounded-box z-[1] mt-3 w-52 p-2 shadow"
            >
              <li>
                <button 
                  onClick={() => setCurrentView('setup')}
                  className={currentView === 'setup' ? 'active' : ''}
                >
                  Setup
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setCurrentView('playing')}
                  className={currentView === 'playing' ? 'active' : ''}
                  disabled={!gameManager.game}
                >
                  Game
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setCurrentView('rivalry-stats')}
                  className={currentView === 'rivalry-stats' ? 'active' : ''}
                >
                  Stats
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setCurrentView('admin')}
                  className={currentView === 'admin' ? 'active' : ''}
                >
                  Admin
                </button>
              </li>
            </ul>
          </div>
          
          {/* Brand/Logo */}
          <button className="btn btn-ghost text-xl font-bold">Skorbord</button>
        </div>
        
        {/* Desktop horizontal menu */}
        <div className="navbar-center hidden lg:flex">
          <ul className="menu menu-horizontal px-1">
            <li>
              <button 
                onClick={() => setCurrentView('setup')}
                className={currentView === 'setup' ? 'active' : ''}
              >
                Setup
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('playing')}
                className={currentView === 'playing' ? 'active' : ''}
                disabled={!gameManager.game}
              >
                Game
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('rivalry-stats')}
                className={currentView === 'rivalry-stats' ? 'active' : ''}
              >
                Stats
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('admin')}
                className={currentView === 'admin' ? 'active' : ''}
              >
                Admin
              </button>
            </li>
          </ul>
        </div>
        
        {/* Right side */}
        <div className="navbar-end">
          <ConnectionStatus />
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={hideToast} />

      {/* Error Display (if any persist) */}
      {(legacyError || gameManager.error) && (
        <div className="alert alert-error shadow-lg mb-4">
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

      {/* Main Content wrapper with proper flex properties */}
      <div className="flex-1">
        {/* Main content based on current view */}
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
      </div>
    </div>
  )
}

export default ModernCardApp
