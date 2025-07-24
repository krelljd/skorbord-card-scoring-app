import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useConnection } from '../contexts/ConnectionContext.jsx'
import GameSetup from './GameSetup.jsx'
import ConnectionStatus from './ConnectionStatus.jsx'
import GamePlay from './GamePlay.jsx'
import RivalryStats from './RivalryStats.jsx'
import AdminPanel from './AdminPanel.jsx'

const CardApp = () => {
  const { sqid } = useParams()
  const { socket, isConnected } = useConnection()
  
  // App state
  const [currentView, setCurrentView] = useState('setup') // setup, playing, rivalry-stats, admin
  const [currentGame, setCurrentGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [gameTypes, setGameTypes] = useState([])
  const [rivalries, setRivalries] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Use relative paths since we have Vite proxy configured
  const API_URL = ''
  // Initialize data when socket connects
  useEffect(() => {
    if (socket && isConnected && sqid) {
      setLoading(true)
      setError(null)

      // Join the sqid room (now required for all connections)
      socket.emit('join-sqid', sqid)
      
      // Load initial data
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
        socket.emit('leave-sqid', sqid)
      }
    }
  }, [socket, isConnected, sqid])

  const loadInitialData = async () => {
    try {
      // Always fetch global game types, but include sqid for favorited status
      const [gameTypesRes, playersRes, rivalriesRes] = await Promise.all([
        fetch(`${API_URL}/api/game_types?sqid=${encodeURIComponent(sqid)}`),
        fetch(`${API_URL}/api/${sqid}/players`),
        fetch(`${API_URL}/api/${sqid}/rivalries`)
      ])

      // Accept 200 OK, 204 No Content, and 404 Not Found for players/rivalries as valid empty responses
      if (!gameTypesRes.ok) {
        throw new Error('Failed to load game types')
      }

      // Helper to parse empty responses
      const parseEmpty = async (res) => {
        if (res.status === 204 || res.status === 404) return { data: [] }
        if (!res.ok) throw new Error('Failed to load resource')
        return res.json()
      }

      const [gameTypesData, playersData, rivalriesData] = await Promise.all([
        gameTypesRes.json(),
        parseEmpty(playersRes),
        parseEmpty(rivalriesRes)
      ])

      // Removed duplicate declaration; see below for robust version

      // gameTypes is always global, but is_favorited is per sqid
      setGameTypes(gameTypesData.data || [])
      setPlayers(playersData.data || [])
      setRivalries(rivalriesData.data || [])

      // Check if there's an active game
      const activeGameRes = await fetch(`${API_URL}/api/${sqid}/games/active`)
      if (activeGameRes.ok) {
        const activeGameData = await activeGameRes.json()
        if (activeGameData.data) {
          setCurrentGame(activeGameData.data)
          setCurrentView('playing')
        }
      }
    } catch (err) {
      console.error('Failed to load initial data:', err)
      setError('Failed to load data. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  // Socket event handlers
  const handleGameUpdate = (gameData) => {
    // Update current game preserving metadata to prevent flashing
    setCurrentGame(prevGame => {
      if (!prevGame) return gameData
      return {
        ...prevGame,
        ...gameData,
        // Ensure critical display fields are preserved if missing from response
        game_type_name: gameData.game_type_name || prevGame.game_type_name,
        win_condition_type: gameData.win_condition_type || prevGame.win_condition_type,
        win_condition_value: gameData.win_condition_value !== undefined ? gameData.win_condition_value : prevGame.win_condition_value
      }
    })
    if (!gameData.finalized) {
      setCurrentView('playing')
    } else if (gameData.finalized) {
      // Game finished, show rivalry stats
      setCurrentView('rivalry-stats')
      // Reload rivalries to get updated stats
      loadRivalries()
    }
  }

  const handleGameStarted = (gameData) => {
    // When a game is started, we should reload the initial data to get the new game
    loadInitialData()
  }

  const handleDealerChanged = (data) => {
    // Update the current game's dealer_id when dealer changes
    if (data.game_id && currentGame && data.game_id === currentGame.id) {
      setCurrentGame(prevGame => ({
        ...prevGame,
        dealer_id: data.dealer_id
      }))
    }
  }

  const handlePlayerUpdate = (playerData) => {
    setPlayers(prev => {
      const index = prev.findIndex(p => p.id === playerData.id)
      if (index >= 0) {
        const updated = [...prev]
        updated[index] = playerData
        return updated
      } else {
        return [...prev, playerData]
      }
    })
  }

  const handleRivalryUpdate = (rivalryData) => {
    setRivalries(prev => {
      const index = prev.findIndex(r => r.id === rivalryData.id)
      if (index >= 0) {
        const updated = [...prev]
        updated[index] = rivalryData
        return updated
      } else {
        return [...prev, rivalryData]
      }
    })
  }

  const handleSocketError = (error) => {
    console.error('Socket error:', error)
    setError(error.message || 'A connection error occurred')
  }

  const loadRivalries = async () => {
    try {
      const response = await fetch(`/api/${sqid}/rivalries`)
      if (response.ok) {
        const data = await response.json()
        setRivalries(data.data || [])
      }
    } catch (err) {
      console.error('Failed to reload rivalries:', err)
    }
  }

  // Navigation functions
  const startNewGame = () => {
    setCurrentGame(null)
    setCurrentView('setup')
  }

  const viewCurrentGame = () => {
    if (currentGame) {
      setCurrentView('playing')
    }
  }

  const viewRivalryStats = () => {
    setCurrentView('rivalry-stats')
  }

  const openAdminPanel = () => {
    setCurrentView('admin')
  }

  const backToSetup = () => {
    setCurrentView('setup')
    setCurrentGame(null)
  }

  if (loading) {
    return (
      <div className="mobile-container">
        <div className="flex justify-center items-center min-h-screen">
          <div className="loading-state"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mobile-container">
        <div className="error-state">
          <div className="flex flex-col items-center">
            <svg className="w-8 h-8 mb-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-center">{error}</p>
            <button 
              className="btn btn-primary mt-4"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-container slide-in-bottom">
      {/* Header with navigation */}
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
              {currentGame && !currentGame.finalized && (
                <li>
                  <button 
                    onClick={viewCurrentGame}
                    className={currentView === 'playing' ? 'active' : ''}
                  >
                    Current Game
                  </button>
                </li>
              )}
              <li>
                <button 
                  onClick={startNewGame}
                  className={currentView === 'setup' ? 'active' : ''}
                >
                  New Game
                </button>
              </li>
              <li>
                <button 
                  onClick={viewRivalryStats}
                  className={currentView === 'rivalry-stats' ? 'active' : ''}
                >
                  Rivalry Stats
                </button>
              </li>
              <li>
                <button 
                  onClick={openAdminPanel}
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
            {currentGame && !currentGame.finalized && (
              <li>
                <button 
                  onClick={viewCurrentGame}
                  className={currentView === 'playing' ? 'active' : ''}
                >
                  Current Game
                </button>
              </li>
            )}
            <li>
              <button 
                onClick={startNewGame}
                className={currentView === 'setup' ? 'active' : ''}
              >
                New Game
              </button>
            </li>
            <li>
              <button 
                onClick={viewRivalryStats}
                className={currentView === 'rivalry-stats' ? 'active' : ''}
              >
                Rivalry Stats
              </button>
            </li>
            <li>
              <button 
                onClick={openAdminPanel}
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

      {/* Main content based on current view */}
      {currentView === 'setup' && (
        <GameSetup
          sqid={sqid}
          gameTypes={gameTypes}
          players={players}
          rivalries={rivalries}
          setCurrentGame={setCurrentGame}
          setCurrentView={setCurrentView}
          setPlayers={setPlayers}
          setRivalries={setRivalries}
        />
      )}
      
      {currentView === 'playing' && currentGame && (
        <GamePlay
          sqid={sqid}
          game={currentGame}
          setCurrentGame={setCurrentGame}
          setCurrentView={setCurrentView}
          onGameComplete={() => setCurrentView('rivalry-stats')}
          backToSetup={backToSetup}
        />
      )}
      
      {currentView === 'rivalry-stats' && (
        <RivalryStats
          sqid={sqid}
          rivalries={rivalries}
          players={players}
          backToSetup={backToSetup}
        />
      )}
      
      {currentView === 'admin' && (
        <AdminPanel
          sqid={sqid}
          gameTypes={gameTypes}
          setGameTypes={setGameTypes}
          backToSetup={backToSetup}
        />
      )}
    </div>
  )
}

export default CardApp
