import { describe, it, expect } from 'vitest'
import { shouldApplyRemoteTally } from './scoreSync.js'

describe('shouldApplyRemoteTally', () => {
  it('shows the tally for an event from another client', () => {
    const data = { playerId: 'p1', change: 2, originSocketId: 'other' }
    expect(shouldApplyRemoteTally(data, 'me')).toBe(true)
  })

  it('suppresses the tally for the acting client (own origin)', () => {
    const data = { playerId: 'p1', change: 2, originSocketId: 'me' }
    expect(shouldApplyRemoteTally(data, 'me')).toBe(false)
  })

  it('suppresses when there is no single-player tally (playerId null)', () => {
    const data = { playerId: null, change: null, originSocketId: 'other' }
    expect(shouldApplyRemoteTally(data, 'me')).toBe(false)
  })
})
