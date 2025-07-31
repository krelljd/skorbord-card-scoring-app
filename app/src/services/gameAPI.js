/**
 * Modern API service layer using async/await and proper error handling
 * Replaces inline fe  async updateScore(sqid, gameId, updates) {
    const response = await this.request(`/api/${sqid}/games/${gameId}/stats`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
    return response.data
  }

  // Simplified method for updating a single player's score
  async updatePlayerScore(sqid, playerId, change) {
    // Get active game first
    const game = await this.getActiveGame(sqid)
    if (!game?.id) {
      throw new Error('No active game found')
    }
    
    return this.updateScore(sqid, game.id, {
      player_id: playerId,
      score_change: change
    })
  }ls with reusable service methods
 */

class APIError extends Error {
  constructor(message, status, response) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.response = response
  }
}

class GameAPI {
  constructor(baseURL = '') {
    this.baseURL = baseURL
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new APIError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData
        )
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null
      }

      return await response.json()
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      throw new APIError(`Network error: ${error.message}`, 0, null)
    }
  }

  // Game management
  async getActiveGame(sqid) {
    const response = await this.request(`/api/${sqid}/games/active`)
    return response?.data || null
  }

  // Alias for getActiveGame for useGameManager compatibility
  async getGame(sqid) {
    return this.getActiveGame(sqid)
  }

  async createGame(sqid, gameData) {
    const response = await this.request(`/api/${sqid}/games`, {
      method: 'POST',
      body: JSON.stringify(gameData)
    })
    return response.data
  }

  async finalizeGame(sqid, gameId) {
    const response = await this.request(`/api/${sqid}/games/${gameId}/finalize`, {
      method: 'PUT'
    })
    return response.data
  }

  // Game stats management
  async getGameStats(sqid, gameId) {
    // If no gameId provided, try to get active game first
    if (!gameId) {
      const game = await this.getActiveGame(sqid)
      gameId = game?.id
    }
    
    if (!gameId) {
      return [] // No active game, return empty stats
    }
    
    const response = await this.request(`/api/${sqid}/games/${gameId}/stats`)
    return response?.data || []
  }

  // Simplified method for updating a single player's score
  async updatePlayerScore(sqid, playerId, change) {
    // Get active game first
    const game = await this.getActiveGame(sqid)
    if (!game?.id) {
      throw new Error('No active game found')
    }
    
    const response = await this.request(`/api/${sqid}/games/${game.id}/stats`, {
      method: 'POST',
      body: JSON.stringify({ 
        stats: [{
          player_id: playerId,
          score: change
        }]
      })
    })
    return response?.data
  }

  async updateScore(sqid, gameId, updates) {
    const response = await this.request(`/api/${sqid}/games/${gameId}/stats`, {
      method: 'POST',
      body: JSON.stringify(updates)
    })
    return response?.data
  }

  // Finalize game - fixed duplicate method definition
  async finalizeGame(sqid, gameId = null) {
    if (!gameId) {
      // If no gameId provided, find current game for sqid
      const gameData = await this.getActiveGame(sqid)
      gameId = gameData?.id
    }
    
    if (!gameId) {
      throw new Error('No active game found to finalize')
    }
    
    const response = await this.request(`/api/${sqid}/games/${gameId}/finalize`, {
      method: 'POST'
    })
    return response?.data
  }

  // Update player order
  async updatePlayerOrder(sqid, gameId, newOrder) {
    const response = await this.request(`/api/${sqid}/games/${gameId}/player-order`, {
      method: 'PUT',
      body: JSON.stringify({ order: newOrder })
    })
    return response?.data
  }

  // Set dealer (simplified method)
  async setDealer(sqid, playerId) {
    const gameData = await this.getGame(sqid)
    if (gameData?.id) {
      return this.updateDealer(sqid, gameData.id, playerId)
    }
    throw new Error('No active game found')
  }

  async updateDealer(sqid, gameId, dealerId) {
    const response = await this.request(`/api/${sqid}/games/${gameId}`, {
      method: 'PUT',
      body: JSON.stringify({ dealer_id: dealerId })
    })
    return response.data
  }

  // Players and rivalries
  async getPlayers(sqid) {
    const response = await this.request(`/api/${sqid}/players`)
    return response?.data || []
  }

  async getRivalries(sqid) {
    const response = await this.request(`/api/${sqid}/rivalries`)
    return response?.data || []
  }

  async getGameTypes(sqid) {
    const response = await this.request(`/api/game_types?sqid=${encodeURIComponent(sqid)}`)
    return response?.data || []
  }
}

// Create singleton instance
export const gameAPI = new GameAPI()

// Default export for convenience
export default gameAPI

// Hook for using API with error handling
import { useState, useCallback } from 'react'

export function useAPI() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const execute = useCallback(async (apiCall) => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await apiCall()
      return result
    } catch (error) {
      setError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { execute, loading, error, clearError }
}
