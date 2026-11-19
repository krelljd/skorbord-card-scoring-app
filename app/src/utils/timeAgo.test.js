import { describe, it, expect } from 'vitest'
import { timeAgo } from './timeAgo.js'

const now = new Date('2026-06-30T12:00:00Z')

describe('timeAgo', () => {
  it('reads naturally across ranges', () => {
    expect(timeAgo('2026-06-30T11:59:00Z', now)).toBe('Just now')
    expect(timeAgo('2026-06-30T11:30:00Z', now)).toBe('30 minutes ago')
    expect(timeAgo('2026-06-30T11:00:00Z', now)).toBe('1 hour ago')
    expect(timeAgo('2026-06-30T10:00:00Z', now)).toBe('2 hours ago')
    expect(timeAgo('2026-06-29T10:00:00Z', now)).toBe('Yesterday')
    expect(timeAgo('2026-06-27T10:00:00Z', now)).toBe('3 days ago')
  })
  it('returns nothing for a bad date', () => {
    expect(timeAgo('nope', now)).toBe('')
  })
})
