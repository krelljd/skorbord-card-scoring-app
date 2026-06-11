import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import gameAPI from './gameAPI.js'

describe('updatePlayerScore', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] })
    }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs to the passed gameId without a preceding getActiveGame and includes socketId', async () => {
    await gameAPI.updatePlayerScore('abcd', 'game-1', 'player-1', 3, 'sock-9')

    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/abcd/games/game-1/stats')
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.socketId).toBe('sock-9')
    expect(body.stats).toEqual([{ player_id: 'player-1', score: 3 }])
  })
})
