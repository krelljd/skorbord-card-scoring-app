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


/**
 * Modern CardApp component
 * - Modern architecture with context-based state management
 * - Code splitting for admin views
 * - Error boundaries for reliability
 * - Performance optimizations with memoization
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
  
  // App state - simplified with modern state management
  const [currentView, setCurrentView] = useState('setup') // setup, playing, rivalry-stats, admin
  const [adminTab, setAdminTab] = useState('game-types')
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

  return (
    <ErrorBoundary>
      <ToastProvider>
        <GameStateProvider sqid={sqid}>
          <div className="mobile-container-modern">
            {/* Header with connection status and navigation */}
            <header className="mb-2 flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h1 className="text-xl font-extrabold tracking-tight">Skorbord</h1>
                <ConnectionStatus />
              </div>

              {/* Navigation - Always visible */}
              <nav className="grid grid-cols-4 gap-1 rounded-box bg-base-200 p-1" aria-label="Sections">
                {[
                  ['playing', 'Current'],
                  ['setup', 'New game'],
                  ['rivalry-stats', 'Stats'],
                  ['admin', 'Admin'],
                ].map(([view, label]) => (
                  <button
                    key={view}
                    type="button"
                    className={`btn btn-sm min-h-11 border-0 px-1 text-xs whitespace-nowrap shadow-none ${currentView === view ? 'btn-primary' : 'btn-ghost'}`}
                    aria-current={currentView === view ? 'page' : undefined}
                    onClick={() => { if (view === 'admin') setAdminTab('game-types'); setCurrentView(view) }}
                  >
                    {label}
                  </button>
                ))}
              </nav>
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
                  onManage={() => { setAdminTab('rivalries'); setCurrentView('admin') }}
                />
              )}

              {currentView === 'admin' && (
                <LazyAdminPanel 
                  sqid={sqid} 
                  gameTypes={gameTypes}
                  setGameTypes={setGameTypes}
                  backToSetup={() => setCurrentView('setup')}
                  rivalries={rivalries}
                  setRivalries={setRivalries}
                  initialTab={adminTab}
                />
              )}
            </main>
          </div>
        </GameStateProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

// Memoize the entire app to prevent unnecessary re-renders
export default memo(ModernCardApp)
