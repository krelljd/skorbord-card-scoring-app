import { useState, useEffect, useMemo } from 'react'
import { useLoading } from '../../hooks/useUIState.js'
import { useToast } from '../../hooks/useUIState.js'
import gameAPI from '../../services/gameAPI.js'
import { LoadingSpinner } from '../Loading.jsx'
import { matchPlayerName, sortPlayersForChips, sortGameTypesForChips } from '../../utils/playerMatch.js'
import { rematchDealer } from '../../utils/gameResult.js'

const MAX_PLAYERS = 8
const colorOf = (i) => `var(--pc-${i % 8})`

/**
 * Game setup: tap a game type, tap the players, choose who deals first, start.
 * "Same again" repeats the last game (same type, players and win condition) with the dealer alternated.
 * New names are matched against known players so one person keeps one set of stats.
 */
const GameSetup = ({
  sqid,
  gameTypes = [],
  players = [],
  onGameStart
}) => {
  const { error: showError } = useToast()
  const { loading: isLoading, withLoading } = useLoading()

  const typeChips = useMemo(() => sortGameTypesForChips(gameTypes), [gameTypes])
  const knownPlayers = useMemo(() => sortPlayersForChips(players), [players])

  const [showAllTypes, setShowAllTypes] = useState(false)
  const [gameType, setGameType] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [customType, setCustomType] = useState('win')
  const [customValue, setCustomValue] = useState(100)
  const [picked, setPicked] = useState([]) // [{ key, name, id? }] in seat order
  const [newPlayers, setNewPlayers] = useState([]) // names added this visit, not saved yet
  const [adding, setAdding] = useState(false)
  const [typed, setTyped] = useState('')
  const [dealerKey, setDealerKey] = useState('random')
  const [last, setLast] = useState(null) // { game, playerIds, dealerId } for Same again
  const [starting, setStarting] = useState(false)

  // Default to the first favorite (or the first game type) until the person chooses
  useEffect(() => {
    if (!gameType && typeChips.length) setGameType(typeChips[0].id)
  }, [typeChips, gameType])

  // Load the last game from the server, so Same again works on any phone using this link
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await gameAPI.request(`/api/${sqid}/games?limit=1`)
        const game = res?.data?.[0]
        if (!game || !Array.isArray(game.players) || game.players.length < 2) return
        const roundState = await gameAPI.getRounds(sqid, game.id).catch(() => null)
        const ids = game.players.map((p) => p.id)
        const firstDealer = (roundState?.rounds || []).filter((r) => !r.is_backfill).sort((a, b) => a.round_number - b.round_number)[0]?.dealer_id || game.dealer_id
        if (!cancelled) setLast({ game, players: game.players, dealerId: rematchDealer(ids, firstDealer) })
      } catch {
        // No history yet, or offline: the card just does not show
      }
    })()
    return () => { cancelled = true }
  }, [sqid])

  const selectedType = gameTypes.find((g) => g.id === gameType)
  const sameAgainType = last && gameTypes.find((g) => g.id === last.game.game_type_id)
  const typesShown = showAllTypes ? typeChips : typeChips.filter((g) => g.is_favorited || g.id === gameType)
  const hiddenCount = typeChips.length - typesShown.length

  const pool = [
    ...knownPlayers.map((p) => ({ key: p.id, id: p.id, name: p.name })),
    ...newPlayers.map((name) => ({ key: `new:${name.toLowerCase()}`, name }))
  ]
  const isPicked = (key) => picked.some((p) => p.key === key)
  const seat = (key) => picked.findIndex((p) => p.key === key)

  const toggle = (entry) => {
    if (isPicked(entry.key)) {
      setPicked(picked.filter((p) => p.key !== entry.key))
      if (dealerKey === entry.key) setDealerKey('random')
    } else if (picked.length < MAX_PLAYERS) {
      setPicked([...picked, entry])
    }
  }

  const match = matchPlayerName(typed, [...knownPlayers, ...newPlayers.map((name) => ({ name }))])

  const addTyped = () => {
    const name = typed.trim()
    if (!name) return
    // Same person as someone known: use that chip
    const known = knownPlayers.find((p) => p.name.trim().toLowerCase() === name.toLowerCase())
    const entry = known ? { key: known.id, id: known.id, name: known.name } : { key: `new:${name.toLowerCase()}`, name }
    if (!known && !newPlayers.some((n) => n.toLowerCase() === name.toLowerCase())) setNewPlayers([...newPlayers, name])
    if (!isPicked(entry.key) && picked.length < MAX_PLAYERS) setPicked([...picked, entry])
    setTyped('')
    setAdding(false)
  }

  const winCondition = (type, value) => ({
    win_condition_type: useCustom ? customType : (type?.is_win_condition ? 'win' : 'lose'),
    win_condition_value: useCustom ? parseInt(customValue) : (type?.is_win_condition ? type.win_condition : type?.loss_condition)
  })

  const canStart = Boolean(gameType) && picked.length >= 2 && (!useCustom || Number(customValue) > 0)

  const start = async (e) => {
    e?.preventDefault()
    if (!canStart) return
    try {
      await withLoading(async () => {
        // Save new names first, so the game and the first dealer can use real player ids
        const ids = []
        for (const p of picked) {
          if (p.id) { ids.push(p.id); continue }
          try {
            const res = await gameAPI.request(`/api/${sqid}/players`, { method: 'POST', body: JSON.stringify({ name: p.name }) })
            ids.push(res.data.id)
          } catch (err) {
            if (err.status !== 409) throw err
            const all = await gameAPI.getPlayers(sqid)
            const found = all.find((x) => x.name.trim().toLowerCase() === p.name.toLowerCase())
            if (!found) throw err
            ids.push(found.id)
          }
        }
        const dealerIndex = picked.findIndex((p) => p.key === dealerKey)
        const game = await gameAPI.createGame(sqid, {
          game_type_id: gameType,
          player_ids: ids,
          ...winCondition(selectedType),
          ...(dealerIndex >= 0 ? { dealer_id: ids[dealerIndex] } : {})
        })
        onGameStart?.(game)
      })
    } catch (error) {
      showError(`Failed to create game: ${error.message}`)
    }
  }

  const sameAgain = async () => {
    setStarting(true)
    try {
      const g = last.game
      const game = await gameAPI.createGame(sqid, {
        game_type_id: g.game_type_id,
        player_ids: last.players.map((p) => p.id),
        win_condition_type: g.win_condition_type,
        win_condition_value: g.win_condition_value,
        dealer_id: last.dealerId
      })
      onGameStart?.(game)
    } catch (error) {
      showError(`Failed to create game: ${error.message}`)
      setStarting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 space-y-4">
        <LoadingSpinner size="lg" />
        <p className="text-base-content/70">Starting game...</p>
      </div>
    )
  }

  const dealerName = last?.players.find((p) => p.id === last.dealerId)?.name

  return (
    <form onSubmit={start} className="space-y-4">
      <h1 className="text-2xl font-bold">New game</h1>

      {last && sameAgainType && (
        <div className="su-again" style={{ '--c': colorOf(0) }}>
          <div className="min-w-0 flex-1">
            <div className="su-again-title">Same again</div>
            <div className="text-sm truncate">{last.game.game_type_name} · {last.players.map((p) => p.name).join(', ')}</div>
            {dealerName && <div className="text-sm opacity-80">{dealerName} deals first</div>}
          </div>
          <button type="button" className="su-again-go" onClick={sameAgain} disabled={starting}>
            {starting ? 'Starting…' : 'Start'}
          </button>
        </div>
      )}

      <section className="su-sec" aria-labelledby="su-game">
        <h2 id="su-game" className="pc-label">Game</h2>
        <div className="su-chips" role="radiogroup" aria-label="Game type">
          {typesShown.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={g.id === gameType}
              className={`su-chip ${g.id === gameType ? 'su-chip-on' : ''}`}
              style={{ '--c': colorOf(0) }}
              onClick={() => setGameType(g.id)}
            >
              {g.name}
            </button>
          ))}
          {hiddenCount > 0 && (
            <button type="button" className="su-chip su-chip-add" onClick={() => setShowAllTypes(true)}>
              All games…
            </button>
          )}
        </div>
        {selectedType && !useCustom && (
          <p className="su-hint">
            {selectedType.is_win_condition ? 'First to' : 'Lose at'} {selectedType.is_win_condition ? selectedType.win_condition : selectedType.loss_condition}
            {' · '}
            <button type="button" className="underline" onClick={() => setUseCustom(true)}>Custom score</button>
          </p>
        )}
        {useCustom && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label="Condition type"
              className="select select-bordered select-sm"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
            >
              <option value="win">First to reach</option>
              <option value="lose">First to go below</option>
            </select>
            <input
              aria-label="Points"
              type="number"
              min="1"
              inputMode="numeric"
              className="input input-bordered input-sm w-24"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUseCustom(false)}>Use default</button>
          </div>
        )}
      </section>

      <section className="su-sec" aria-labelledby="su-players">
        <h2 id="su-players" className="pc-label">Players · tap to pick</h2>
        <div className="su-chips">
          {pool.map((p, i) => {
            const on = isPicked(p.key)
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                className={`su-chip ${on ? 'su-chip-on' : ''}`}
                style={{ '--c': colorOf(on ? seat(p.key) : i) }}
                onClick={() => toggle(p)}
              >
                <i className="su-dot" aria-hidden="true">{on ? seat(p.key) + 1 : p.name.trim().charAt(0).toUpperCase()}</i>
                {p.name}
              </button>
            )
          })}
          {!adding && (
            <button type="button" className="su-chip su-chip-add" onClick={() => setAdding(true)} disabled={picked.length >= MAX_PLAYERS}>
              + New player
            </button>
          )}
        </div>

        {adding && (
          <div className="mt-2">
            <div className="flex gap-2">
              <input
                id="su-new-name"
                type="text"
                autoFocus
                autoCapitalize="words"
                autoComplete="off"
                placeholder="Player name"
                className="input input-bordered flex-1"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped() } }}
              />
              <button type="button" className="btn btn-primary" onClick={addTyped} disabled={!typed.trim()}>Add</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setTyped('') }}>Cancel</button>
            </div>
            {match.exact && <p className="su-warn">{match.exact.name} already plays here. Adding picks that player.</p>}
            {match.near && <p className="su-warn">Did you mean {match.near.name}? Tap that chip to keep their stats together.</p>}
          </div>
        )}

        <p className="su-hint">
          {picked.length < 2 ? 'Pick at least 2 players.' : `${picked.length} players. Seat order is the order you tapped.`}
        </p>
      </section>

      {picked.length >= 2 && (
        <section className="su-sec" aria-labelledby="su-dealer">
          <h2 id="su-dealer" className="pc-label">First dealer</h2>
          <div className="su-seg" role="radiogroup" aria-label="First dealer">
            {[{ key: 'random', name: 'Random' }, ...picked].map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={dealerKey === p.key}
                className={dealerKey === p.key ? 'su-seg-on' : ''}
                onClick={() => setDealerKey(p.key)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <button type="submit" className="btn btn-primary btn-block min-h-12" disabled={!canStart}>
        Start game
      </button>
    </form>
  )
}

export default GameSetup
