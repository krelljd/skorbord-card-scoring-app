import { forwardRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import PlayerCard from './PlayerCard.jsx'

/**
 * Wrapper around PlayerCard that adds drag and drop functionality
 * Uses @dnd-kit/sortable for reordering
 */
const ReorderablePlayerCard = forwardRef(({ 
  player, 
  playerIndex, 
  isReorderMode = false,
  ...playerCardProps 
}, ref) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: player.id,
    disabled: !isReorderMode
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }

  // In reorder mode, disable scoring and show drag handle
  const modifiedProps = isReorderMode 
    ? { ...playerCardProps, disabled: true }
    : playerCardProps

  if (!isReorderMode) {
    // Normal mode - just render regular PlayerCard
    return (
      <PlayerCard
        ref={ref}
        player={player}
        playerIndex={playerIndex}
        {...playerCardProps}
      />
    )
  }

  // Reorder mode - wrap in draggable container
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${
        isOver ? 'ring-2 ring-primary ring-offset-2' : ''
      }`}
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${player.name}`}
    >
      {/* Drag Handle Overlay */}
      <div className="absolute top-2 right-2 z-10 bg-base-100/90 rounded-lg p-1 shadow-md">
        <div className="text-base-content/60 text-sm select-none">
          ⋮⋮
        </div>
      </div>

      {/* Visual feedback for drop zones */}
      {isOver && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg pointer-events-none" />
      )}

      {/* Player Card */}
      <PlayerCard
        ref={ref}
        player={player}
        playerIndex={playerIndex}
        {...modifiedProps}
      />

      {/* Reorder mode overlay to prevent clicks */}
      {isReorderMode && (
        <div className="absolute inset-0 bg-transparent cursor-grab active:cursor-grabbing" />
      )}
    </div>
  )
})

ReorderablePlayerCard.displayName = 'ReorderablePlayerCard'

export default ReorderablePlayerCard
