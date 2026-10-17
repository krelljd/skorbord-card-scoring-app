import React, { useState } from 'react'
import RivalryStatsDetail from './RivalryStatsDetail.jsx'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * One rivalry in the list, in the Score History summary style: player rows with a big wins number,
 * the leader in their color and the rest muted. Colors follow list position, like the detail view.
 */
const RivalryCard = ({ rivalry, onOpen }) => {
  const players = Array.isArray(rivalry.players) && rivalry.players.length > 0
    ? rivalry.players
    : (Array.isArray(rivalry.player_names) && rivalry.player_names.length > 0
      ? rivalry.player_names.map((name, i) => ({ id: `${rivalry.id}-${i}`, name }))
      : [{ id: `${rivalry.id}-0`, name: 'Unknown Players' }])
  const rows = players.map((p, index) => ({ ...p, index, wins: Number(p.wins) || 0 }))
  const total = Number(rivalry.total_games) || 0
  const top = Math.max(...rows.map((r) => r.wins))
  const hasLeader = rows.length > 1 && top > 0 && rows.filter((r) => r.wins === top).length === 1
  const ordered = [...rows].sort((a, b) => b.wins - a.wins)
  const types = Array.isArray(rivalry.game_types) ? rivalry.game_types : []

  return (
    <button type="button" className="rh-summary rv-card text-left w-full" onClick={() => onOpen(rivalry)}>
      <div className="flex items-center">
        <span className="pc-label flex-1">{plural(total, 'game')}</span>
        <span className="pc-label">View stats ›</span>
      </div>
      {ordered.map((p) => {
        const lead = hasLeader && p.wins === top
        const share = total ? Math.min(100, Math.round((p.wins / total) * 100)) : 0
        return (
          <div key={p.id} className="flex flex-col gap-1.5" style={{ '--c': `var(--pc-${p.index % 8})` }}>
            <div className="flex items-center gap-2">
              <div className="pc-avatar rh-mini" aria-hidden="true">{(p.name || '?').trim().charAt(0).toUpperCase()}</div>
              <span className="flex-1 min-w-0 truncate font-bold">
                {p.name}
                {lead && <span className="pc-label ml-2" style={{ color: 'var(--c)' }}>Leads</span>}
              </span>
              <span className={`pc-score rv-wins ${lead ? '' : 'rv-wins-muted'}`}>{p.wins}</span>
              <span className="pc-label w-8">{p.wins === 1 ? 'win' : 'wins'}</span>
            </div>
            <div className="pc-track" role="img" aria-label={`${p.name} has won ${share}% of games`}><i style={{ width: `${share}%` }} /></div>
          </div>
        )
      })}
      {types.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {types.map((gt) => <span key={gt.id} className="rv-type">{gt.name}</span>)}
        </div>
      )}
    </button>
  )
}

const RivalryStats = ({ sqid, rivalries, players: globalPlayers, backToSetup, onManage }) => {
  const [selectedRivalry, setSelectedRivalry] = useState(null)
  const [rivalryDetails, setRivalryDetails] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [localPlayers, setLocalPlayers] = useState([])

  // Load players specifically for color information
  React.useEffect(() => {
    const loadPlayers = async () => {
      try {
        const response = await fetch(`/api/${sqid}/players`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            setLocalPlayers(data.data)
          }
        }
      } catch (err) {
        console.error('Failed to load players for colors:', err)
      }
    }
    if (sqid) {
      loadPlayers()
    }
  }, [sqid])

  const players = Array.isArray(rivalryDetails?.players) ? rivalryDetails.players : [];
  // Use game_type_stats for stats, fallback to game_types for listing
  const gameTypes = Array.isArray(rivalryDetails?.game_type_stats) && rivalryDetails.game_type_stats.length > 0
    ? rivalryDetails.game_type_stats.map(gt => ({
        id: gt.game_type_id,
        name: gt.game_type_name,
        ...gt
      }))
    : (Array.isArray(rivalryDetails?.game_types) ? rivalryDetails.game_types : []);

  // Function to handle rivalry selection
  const selectRivalry = async (rivalry) => {
    setSelectedRivalry(rivalry);
    setLoading(true);
    setError(null);
    try {
      // Fetch rivalry details from API
      const res = await fetch(`/api/${sqid}/rivalries/${rivalry.id}`);
      if (!res.ok) throw new Error('Failed to fetch rivalry details');
      const data = await res.json();
      if (!data.success || !data.data) throw new Error('Invalid API response');
      setRivalryDetails(data.data);
    } catch (err) {
      setError(err.message || 'Error fetching rivalry details');
      setRivalryDetails(null);
    } finally {
      setLoading(false);
    }
  }

  if (selectedRivalry && rivalryDetails) {
    // Robust fallback for missing/empty data
    if (!players.length || !gameTypes.length) {
      return (
        <div className="space-y-6">
          <div className="alert alert-warning">
            <span>No player or game type data available for this rivalry.</span>
          </div>
        </div>
      );
    }
    return (
      <RivalryStatsDetail
        details={rivalryDetails}
        players={players}
        gameTypes={gameTypes}
        error={error}
        loading={loading}
        backToSetup={backToSetup}
        onBack={() => {
          setSelectedRivalry(null)
          setRivalryDetails(null)
        }}
      />
    );
  }
  
  // Don't use detailPlayerNames here since we're not in a selected rivalry context
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          className="btn btn-ghost btn-sm"
          onClick={backToSetup}
        >
          ← Back
        </button>
        <h2 className="text-xl font-bold">Rivalry Stats</h2>
        <button
          className="btn btn-outline btn-sm ml-auto"
          onClick={onManage}
        >
          Manage
        </button>
      </div>
      {rivalries.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-lg font-semibold mb-2">No Rivalries Yet</p>
          <p className="opacity-75 mb-6">
            Play some games to start tracking rivalry statistics!
          </p>
          <button 
            className="btn btn-primary"
            onClick={backToSetup}
          >
            Start First Game
          </button>
        </div>
      ) : (
          <div className="space-y-3">
            {rivalries.map(rivalry => <RivalryCard key={rivalry.id} rivalry={rivalry} onOpen={selectRivalry} />)}
          </div>
      )}
    </div>
  )
}

export default RivalryStats
