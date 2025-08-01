import { useState, useEffect, memo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useConnection } from '../contexts/ConnectionContext.jsx'
import { GameStateProvider } from '../contexts/GameStateContext.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { ToastProvider } from './Toast.jsx'
import { useAppData } from '../hooks/useAppData.js'

// Modern components
import GameSetup from './modern/GameSetup.jsx'
import GamePlay from './modern/GamePlay.jsx'
import ConnectionStatus from './ConnectionStatus.jsx'

// Lazy-loaded admin components for better performance
import { LazyAdminPanel, LazyRivalryStats } from './LazyComponents.jsx'

// Legacy components for fallback during migration
import LegacyGameSetup from './GameSetup.jsx'
import LegacyGamePlay from './GamePlay.jsx'
import RivalryStats from './RivalryStats.jsx'
import AdminPanel from './AdminPanel.jsx'

/**
 * Modern CardApp component with migration support
 * - Modern architecture with context-based state management
 * - Code splitting for admin views
 * - Error boundaries for reliability
 * - Performance optimizations with memoization
 * - Fallback to legacy components during migration
 */
const ModernCardApp = () => {
  const { sqid } = useParams()
  const [searchParams] = useSearchParams()
  const { isConnected } = useConnection()
  
  // Load app data (game types, players, rivalries)
  const { 
    gameTypes, 
    players, 
    rivalries, 
    setGameTypes, 
    setPlayers, 
    setRivalries,
    loading: dataLoading, 
    error: dataError 
  } = useAppData(sqid)
  
  // Check if we should use modern components (default to true for Phase 5)
  const useModern = true // Default to modern
  
  // App state - simplified with modern state management
  const [currentView, setCurrentView] = useState('setup') // setup, playing, rivalry-stats, admin
  const [loading, setLoading] = useState(true)

  // Initialize app when connection is ready and data is loaded
  useEffect(() => {
    const initializeApp = async () => {
      if (isConnected && sqid && !dataLoading) {
        try {
          // Check if there's an active game
          const activeGameRes = await fetch(`/api/${sqid}/games/active`)
          if (activeGameRes.ok) {
            const activeGameData = await activeGameRes.json()
            if (activeGameData.data && !activeGameData.data.finalized) {
              // Found an active game, navigate to playing view
              setCurrentView('playing')
              setLoading(false)
              return
            }
          }
        } catch (err) {
          console.warn('Failed to check for active game:', err)
          // Continue with normal initialization even if active game check fails
        }
        
        // No active game found, stay on setup view
        setLoading(false)
      }
    }

    initializeApp()
  }, [isConnected, sqid, dataLoading])

  // Render loading state
  if (loading || dataLoading) {
    return (
      <div className="mobile-container-modern">
        <div className="flex items-center justify-center min-h-96">
          <div className="loading loading-spinner loading-lg text-primary"></div>
          <span className="ml-2 text-base-content">
            {dataLoading ? 'Loading app data...' : 'Connecting...'}
          </span>
        </div>
      </div>
    )
  }

  // Render error state if no sqid or data error
  if (!sqid) {
    return (
      <div className="mobile-container-modern">
        <div className="alert alert-error">
          <span>Invalid game ID. Please check your URL.</span>
        </div>
      </div>
    )
  }

  if (dataError) {
    return (
      <div className="mobile-container-modern">
        <div className="alert alert-error">
          <span>Failed to load app data: {dataError}</span>
        </div>
      </div>
    )
  }

  // Modern component wrapper
  const ModernApp = () => (
    <ErrorBoundary>
      <ToastProvider>
        <GameStateProvider sqid={sqid}>
          <div className="mobile-container-modern">
            {/* Header with connection status and navigation */}
            <header className="card bg-base-100 shadow-lg mb-4">
              <div className="card-body p-4">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold text-base-content">
                    Skorbord
                  </h1>
                  <ConnectionStatus />
                </div>
                
                {/* Navigation - Always visible */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    className={`btn btn-sm ${currentView === 'playing' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setCurrentView('playing')}
                  >
                    Current
                  </button>
                  <button
                    className={`btn btn-sm ${currentView === 'setup' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setCurrentView('setup')}
                  >
                    New Game
                  </button>
                  
                  <button
                    className={`btn btn-sm ${currentView === 'rivalry-stats' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setCurrentView('rivalry-stats')}
                  >
                    Stats
                  </button>
                  <button
                    className={`btn btn-sm ${currentView === 'admin' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setCurrentView('admin')}
                  >
                    Admin
                  </button>
                </div>
              </div>
            </header>

            {/* Main content */}
            <main className="flex-1">
              {currentView === 'setup' && (
                <GameSetup 
                  sqid={sqid} 
                  gameTypes={gameTypes}
                  players={players}
                  rivalries={rivalries}
                  onGameStart={() => setCurrentView('playing')}
                />
              )}
              
              {currentView === 'playing' && (
                <GamePlay sqid={sqid} />
              )}
              
              {currentView === 'rivalry-stats' && (
                <LazyRivalryStats 
                  sqid={sqid} 
                  rivalries={rivalries}
                  players={players}
                  backToSetup={() => setCurrentView('setup')}
                />
              )}
              
              {currentView === 'admin' && (
                <LazyAdminPanel 
                  sqid={sqid} 
                  gameTypes={gameTypes}
                  setGameTypes={setGameTypes}
                  backToSetup={() => setCurrentView('setup')}
                />
              )}
            </main>
          </div>
        </GameStateProvider>
      </ToastProvider>
    </ErrorBoundary>
  )

  // Legacy component wrapper for fallback
  const LegacyApp = () => (
    <div className="mobile-container">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Skorbord Cards</h1>
        <ConnectionStatus />
      </div>
      
      {/* Legacy navigation */}
      {currentView !== 'setup' && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            className={`btn btn-sm ${currentView === 'playing' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setCurrentView('playing')}
          >
            Game
          </button>
          <button
            className={`btn btn-sm ${currentView === 'rivalry-stats' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setCurrentView('rivalry-stats')}
          >
            Stats
          </button>
          <button
            className={`btn btn-sm ${currentView === 'admin' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setCurrentView('admin')}
          >
            Admin
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setCurrentView('setup')}
          >
            New Game
          </button>
        </div>
      )}

      {/* Legacy content */}
      {currentView === 'setup' && (
        <LegacyGameSetup 
          sqid={sqid} 
          gameTypes={gameTypes}
          players={players}
          rivalries={rivalries}
          onGameStart={() => setCurrentView('playing')}
        />
      )}
      
      {currentView === 'playing' && (
        <LegacyGamePlay sqid={sqid} />
      )}
      
      {currentView === 'rivalry-stats' && (
        <RivalryStats 
          sqid={sqid} 
          rivalries={rivalries}
          players={players}
          backToSetup={() => setCurrentView('setup')}
        />
      )}
      
      {currentView === 'admin' && (
        <AdminPanel 
          sqid={sqid} 
          gameTypes={gameTypes}
          setGameTypes={setGameTypes}
          backToSetup={() => setCurrentView('setup')}
        />
      )}
    </div>
  )

  // Render modern or legacy based on param
  return useModern ? <ModernApp /> : <LegacyApp />
}

// Memoize the entire app to prevent unnecessary re-renders
export default memo(ModernCardApp)
