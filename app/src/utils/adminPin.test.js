import { describe, it, expect, beforeEach } from 'vitest'
import { getStoredAdminPin, setStoredAdminPin, clearStoredAdminPin } from './adminPin.js'

describe('adminPin storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('returns null when no pin is stored for a sqid', () => {
    expect(getStoredAdminPin('abcd')).toBeNull()
  })

  it('stores and retrieves a pin scoped to a sqid', () => {
    setStoredAdminPin('abcd', '1234')
    expect(getStoredAdminPin('abcd')).toBe('1234')
    expect(getStoredAdminPin('other')).toBeNull()
  })

  it('clears a stored pin', () => {
    setStoredAdminPin('abcd', '1234')
    clearStoredAdminPin('abcd')
    expect(getStoredAdminPin('abcd')).toBeNull()
  })
})
