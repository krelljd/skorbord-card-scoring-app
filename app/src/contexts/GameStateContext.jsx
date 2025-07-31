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
      // Always start tally from the incoming change
      newTallies[playerId] = change
      return { ...state, scoreTallies: newTallies }
    }
    case 'SCORE_TALLY_ACCUMULATE': {
      // Accumulate tally for local actions
      const { playerId, change } = action.payload
      const prevTallyObj = state.scoreTallies[playerId]
      const prevTotal = prevTallyObj && typeof prevTallyObj.total === 'number' ? prevTallyObj.total : 0
      return {
        ...state,
        scoreTallies: {
          ...state.scoreTallies,
          [playerId]: {
            total: prevTotal + change,
            timestamp: Date.now()
          }
        }
      }
    }
    case 'SCORE_TALLY_CLEARED': {
      const { [action.payload.playerId]: removed, ...remainingTallies } = state.scoreTallies
      return { ...state, scoreTallies: remainingTallies }
    }
    case 'SCORE_TALLIES_CLEARED': {
      return { ...state, scoreTallies: {} }
    }
    case 'SCORE_TALLY_SET': {
      // Set tally for remote events (do not accumulate)
      const { playerId, change } = action.payload
      return {
        ...state,
        scoreTallies: {
          ...state.scoreTallies,
          [playerId]: {
            total: change,
            timestamp: Date.now()
          }
        }
      }
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
  
  const updateScore = useCallback((playerId, change) => {
    dispatch({ type: 'SCORE_UPDATED', payload: { playerId, change } })
  }, [dispatch])
  
  const setLoading = useCallback((loading) => {
    dispatch({ type: 'LOADING_SET', payload: loading })
  }, [dispatch])
  
  const setError = useCallback((error) => {
    dispatch({ type: 'ERROR_SET', payload: error })
  }, [dispatch])
  
  const clearAllTallies = useCallback(() => {
    // Clear all tallies from state - timers are managed in useGameManager
    dispatch({ type: 'SCORE_TALLIES_CLEARED' })
  }, [dispatch])
  
  return { updateScore, setLoading, setError, clearAllTallies }
}
