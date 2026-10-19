import { describe, it, expect } from 'vitest'
import { matchPlayerName, sortPlayersForChips, sortGameTypesForChips } from './playerMatch.js'

const players = [{ id: '1', name: 'Jason', games_played: 9 }, { id: '2', name: 'Sam', games_played: 3 }, { id: '3', name: 'Maya', games_played: 9 }]

describe('matchPlayerName', () => {
  it('finds the same name ignoring case and spacing', () => {
    expect(matchPlayerName('  jASON ', players).exact.id).toBe('1')
  })
  it('suggests a close name', () => {
    expect(matchPlayerName('jay', players).near).toBeNull()
    expect(matchPlayerName('Jaso', players).near.id).toBe('1')
    expect(matchPlayerName('Mayaa', players).near.id).toBe('3')
  })
  it('has no match for a new name or empty input', () => {
    expect(matchPlayerName('Priya', players)).toEqual({ exact: null, near: null })
    expect(matchPlayerName('', players)).toEqual({ exact: null, near: null })
  })
})

describe('sorting', () => {
  it('puts the most played players first', () => {
    expect(sortPlayersForChips(players).map((p) => p.name)).toEqual(['Jason', 'Maya', 'Sam'])
  })
  it('puts favorites first', () => {
    const types = [{ id: 'a' }, { id: 'b', is_favorited: 1 }, { id: 'c' }]
    expect(sortGameTypesForChips(types).map((g) => g.id)).toEqual(['b', 'a', 'c'])
  })
})
