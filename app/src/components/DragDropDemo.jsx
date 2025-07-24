import React, { useState } from 'react'

const DragDropDemo = () => {
  const [players, setPlayers] = useState([
    { id: 1, name: 'Alice', color: 'primary' },
    { id: 2, name: 'Bob', color: 'secondary' },
    { id: 3, name: 'Charlie', color: 'accent' },
    { id: 4, name: 'Diana', color: 'info' }
  ])

  const [isReorderMode, setIsReorderMode] = useState(false)

  // Simple reorder functions
  const moveUp = (index) => {
    if (index === 0) return // Already at top
    
    const newPlayers = [...players]
    const [movedPlayer] = newPlayers.splice(index, 1)
    newPlayers.splice(index - 1, 0, movedPlayer)
    setPlayers(newPlayers)
  }

  const moveDown = (index) => {
    if (index === players.length - 1) return // Already at bottom
    
    const newPlayers = [...players]
    const [movedPlayer] = newPlayers.splice(index, 1)
    newPlayers.splice(index + 1, 0, movedPlayer)
    setPlayers(newPlayers)
  }

  return (
    <div className="min-h-screen bg-base-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary mb-2">🎮 Reorder Demo</h1>
          <p className="text-base-content/70">
            Tap the reorder button to rearrange players
          </p>
        </div>

        {/* Reorder Mode Toggle */}
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setIsReorderMode(!isReorderMode)}
            className={`btn btn-primary gap-2 ${isReorderMode ? 'btn-active' : ''}`}
            style={{
              minHeight: '2.5rem',
              touchAction: 'manipulation'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
            {isReorderMode ? 'Done Reordering' : 'Reorder Players'}
          </button>
        </div>

        <div className="space-y-3">
          {players.map((player, index) => (
            <div
              key={player.id}
              className={`
                card card-compact bg-base-200 shadow-lg hover:shadow-xl transition-all duration-200
                ${isReorderMode ? 'flex-row items-center gap-2 p-2 bg-base-200/20' : ''}
              `}
            >
              {/* Reorder buttons - left side */}
              {isReorderMode && (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className={`btn btn-xs btn-primary ${
                      index === 0 ? 'btn-disabled opacity-30' : ''
                    }`}
                    style={{
                      minHeight: '1.75rem',
                      minWidth: '1.75rem',
                      touchAction: 'manipulation'
                    }}
                    title="Move up"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === players.length - 1}
                    className={`btn btn-xs btn-primary ${
                      index === players.length - 1 ? 'btn-disabled opacity-30' : ''
                    }`}
                    style={{
                      minHeight: '1.75rem',
                      minWidth: '1.75rem',
                      touchAction: 'manipulation'
                    }}
                    title="Move down"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Player card content */}
              <div className={`card-body ${isReorderMode ? 'flex-1 p-2' : ''}`}>
                <div className="card-title justify-center text-${player.color}">
                  <span className="mr-2">👤</span>
                  {player.name}
                  <span className="ml-2">🎯</span>
                </div>
                <div className="text-xs text-center text-base-content/50">
                  Player {index + 1}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-info/10 rounded-lg">
          <h3 className="font-semibold text-info mb-2">How to use:</h3>
          <ul className="text-sm space-y-1 text-base-content/70">
            <li>• Tap "Reorder Players" to enter reorder mode</li>
            <li>• Use up/down arrow buttons to move players</li>
            <li>• Tap "Done Reordering" to finish</li>
            <li>• Much more reliable than drag and drop on mobile</li>
          </ul>
        </div>

        <div className="mt-4 text-center">
          <button 
            className="btn btn-outline btn-sm"
            onClick={() => setPlayers([...players].reverse())}
          >
            🔄 Reverse Order
          </button>
        </div>
      </div>
    </div>
  )
}

export default DragDropDemo
