import React, { useState } from 'react'
import { getPlayerTextColorClassByName } from '../utils/playerColors'
import RivalryStatsDetail from './RivalryStatsDetail.jsx'

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
            {rivalries.map(rivalry => {
              // Fallback logic for player names in rivalry list
              const listPlayerNames = Array.isArray(rivalry.player_names) && rivalry.player_names.length > 0
                ? rivalry.player_names
                : (Array.isArray(rivalry.players) && rivalry.players.length > 0
                  ? rivalry.players.map(p => p.name)
                  : ['Unknown Players']);
              return (
                <div 
                  key={rivalry.id}
                  className="card bg-base-200 p-4 cursor-pointer hover:bg-base-300 transition-colors"
                  onClick={() => selectRivalry(rivalry)}
                >
                  <div className="flex flex-col gap-2">
                    <h3 className="font-semibold text-lg">
                      {listPlayerNames.map((playerName, index) => {
                        const colorClass = getPlayerTextColorClassByName(playerName, localPlayers);
                        return (
                          <span key={index}>
                            <span className={colorClass}>
                              {playerName}
                            </span>
                            {index < listPlayerNames.length - 1 && ' vs '}
                          </span>
                        );
                      })}
                    </h3>
                    {/* Show all game types played by this rivalry */}
                    {Array.isArray(rivalry.game_types) && rivalry.game_types.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {rivalry.game_types.map(gt => (
                          <span key={gt.id} className="badge badge-outline badge-info">
                            {gt.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
      )}
    </div>
  )
}

export default RivalryStats
