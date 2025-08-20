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
      className={`relative transition-all duration-200 ${
        isDragging ? 'cursor-grabbing scale-105 rotate-2' : 'cursor-grab'
      } ${isOver ? 'ring-2 ring-primary ring-offset-2 scale-102' : ''} ${
        isReorderMode ? 'touch-none shadow-lg border border-primary/20' : ''
      }`} // Enhanced iOS visual feedback
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${player.name}`}
      // iOS touch optimization
      onTouchStart={(e) => {
        // Prevent default iOS behaviors during reorder mode
        if (isReorderMode) {
          e.stopPropagation()
          // Add slight scale feedback for iOS (haptic-like)
          e.currentTarget.style.transform = 'scale(0.98)'
          setTimeout(() => {
            if (e.currentTarget) {
              e.currentTarget.style.transform = ''
            }
          }, 150)
        }
      }}
    >
      {/* Drag Handle Overlay - Enhanced for iOS */}
      <div className="absolute top-2 right-2 z-10 bg-base-100/95 rounded-lg p-2 shadow-lg min-w-[44px] min-h-[44px] flex items-center justify-center border border-primary/30 backdrop-blur-sm">
        <div className="text-primary text-lg select-none leading-none font-bold">
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
