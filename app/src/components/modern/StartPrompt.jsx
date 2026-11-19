/**
 * Shown when Start is tapped while a game with scores is still in progress.
 * Keep playing goes back to that game; Park it keeps it under Unfinished games and starts the new one.
 */
const StartPrompt = ({ game, onKeep, onPark, onCancel }) => (
  <div className="modal modal-open modal-bottom sm:modal-middle z-50" role="dialog" aria-label="A game is in progress">
    <div className="modal-box">
      <h3 className="text-lg font-bold">A game is still in progress</h3>
      <p className="py-2 text-sm opacity-80">
        {game.game_type_name}, {game.players.map((p) => `${p.name} ${p.score}`).join(', ')}, round {game.current_round}.
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" className="btn btn-primary min-h-12" onClick={onKeep}>Keep playing that game</button>
        <button type="button" className="btn btn-outline btn-primary min-h-12" onClick={onPark}>Park it and start new</button>
        <p className="text-sm opacity-70">Parked games show under Unfinished games and can be resumed any time.</p>
        <button type="button" className="btn btn-ghost min-h-11" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  </div>
)

export default StartPrompt
