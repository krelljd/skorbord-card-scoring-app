import { createContext, useContext, useReducer, useCallback, useRef } from 'react'

// Game state reducer following React best practices
function gameStateReducer(state, action) {
  switch (action.type) {
    case 'GAME_LOADED': {
      return {
        ...state,
        game: action.payload.game,
        gameStats: action.payload.stats || [],
        loading: false,
        error: null
      }
    }
    case 'SCORE_UPDATED': {
      const updatedStats = state.gameStats.map(stat => 
        stat.player_id === action.payload.playerId
          ? { ...stat, score: stat.score + action.payload.change }
          : stat
      )
      
      return {
        ...state,
        gameStats: updatedStats
      }
    }
    case 'WINNER_DETECTED': {
      return {
        ...state,
        winner: action.payload.winner
      }
    }
    case 'WINNER_CLEARED': {
      return {
        ...state,
        winner: null
      }
    }
    case 'SCORE_TALLY_ADDED': {
      const newTallies = { ...state.scoreTallies }
      const playerId = action.payload.playerId
      const change = action.payload.change
      
      newTallies[playerId] = {
        total: (newTallies[playerId]?.total || 0) + change,
        timestamp: Date.now()
      }
      
      return { ...state, scoreTallies: newTallies }
    }
    case 'SCORE_TALLY_CLEARED': {
      const { [action.payload.playerId]: removed, ...remainingTallies } = state.scoreTallies
      return { ...state, scoreTallies: remainingTallies }
    }
    case 'PLAYER_ORDER_UPDATED': {
      return {
        ...state,
        gameStats: action.payload.stats,
        glowingCards: new Set([action.payload.movedPlayerId])
      }
    }
    case 'GLOW_CLEARED': {
      const newGlowingCards = new Set(state.glowingCards)
      newGlowingCards.delete(action.payload.playerId)
      return { ...state, glowingCards: newGlowingCards }
    }
    case 'GAME_FINALIZED': {
      return {
        ...state,
        game: { ...state.game, finalized: true },
        winner: action.payload.winner
      }
    }
    case 'DEALER_SET': {
      return {
        ...state,
        game: state.game ? { ...state.game, dealer_id: action.payload.playerId } : state.game,
        dealer: action.payload.playerId
      }
    }
    case 'LOADING_SET': {
      return { ...state, loading: action.payload }
    }
    case 'ERROR_SET': {
      return { ...state, error: action.payload }
    }
    default: {
      throw new Error(`Unknown action: ${action.type}`)
    }
  }
}

const GameStateContext = createContext(null)
const GameDispatchContext = createContext(null)

export function GameStateProvider({ children, sqid }) {
  const [state, dispatch] = useReducer(gameStateReducer, {
    game: null,
    gameStats: [],
    scoreTallies: {},
    glowingCards: new Set(),
    winner: null,
    dealer: null,
    loading: false,
    error: null,
    isReorderMode: false,
    sqid: sqid || null  // Store sqid in state
  })

  return (
    <GameStateContext.Provider value={state}>
      <GameDispatchContext.Provider value={dispatch}>
        {children}
      </GameDispatchContext.Provider>
    </GameStateContext.Provider>
  )
}

export function useGameState() {
  const context = useContext(GameStateContext)
  if (!context) {
    throw new Error('useGameState must be used within a GameStateProvider')
  }
  return context
}

export function useGameDispatch() {
  const context = useContext(GameDispatchContext)
  if (!context) {
    throw new Error('useGameDispatch must be used within a GameStateProvider')
  }
  return context
}

// Custom hooks for common operations
export function useGameActions() {
  const dispatch = useGameDispatch()
  
  // Store timeout IDs for debounced tally clearing
  const tallyTimeouts = useRef({})
  
  const updateScore = useCallback((playerId, change) => {
    dispatch({ type: 'SCORE_UPDATED', payload: { playerId, change } })
    dispatch({ type: 'SCORE_TALLY_ADDED', payload: { playerId, change } })
    
    // Clear any existing timeout for this player
    if (tallyTimeouts.current[playerId]) {
      clearTimeout(tallyTimeouts.current[playerId])
    }
    
    // Set new timeout to clear tally after 3 seconds of no activity
    tallyTimeouts.current[playerId] = setTimeout(() => {
      dispatch({ type: 'SCORE_TALLY_CLEARED', payload: { playerId } })
      delete tallyTimeouts.current[playerId]
    }, 3000)
  }, [dispatch])
  
  const setLoading = useCallback((loading) => {
    dispatch({ type: 'LOADING_SET', payload: loading })
  }, [dispatch])
  
  const setError = useCallback((error) => {
    dispatch({ type: 'ERROR_SET', payload: error })
  }, [dispatch])
  
  return { updateScore, setLoading, setError }
}
