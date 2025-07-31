// Modern DaisyUI theme colors for consistent player assignment
const PLAYER_COLORS = [
  'primary',    // Blue - Default primary color
  'secondary',  // Purple - Default secondary color  
  'accent',     // Green - Default accent color
  'info',       // Cyan - Information color
  'success',    // Green variant - Success color
  'warning',    // Yellow - Warning color
  'error',      // Red - Error color
  'neutral'     // Gray - Neutral color
];

/**
 * Modern semantic color mapping using DaisyUI system
 * Get consistent player color based on player ID with semantic meaning
 * @param {string|number} playerId - The unique player identifier
 * @returns {string} DaisyUI semantic color name
 */
export const getPlayerColor = (playerId) => {
  // Convert to string and extract numeric value for consistent hashing
  const numericId = parseInt(playerId.toString().replace(/\D/g, '') || '0');
  const colorIndex = numericId % PLAYER_COLORS.length;
  return PLAYER_COLORS[colorIndex];
};

/**
 * Get player color by name (fallback when player object is not available)
 * @param {string} playerName - The player's name
 * @param {Array} [players] - Optional array of player objects with id and name
 * @returns {string} DaisyUI color name
 */
export const getPlayerColorByName = (playerName, players = null) => {
  // If players array is provided, try to find the player and use their ID
  if (players && Array.isArray(players)) {
    const player = players.find(p => p.name === playerName);
    if (player) {
      return getPlayerColor(player.id);
    }
  }
  
  // Fallback: use the player name itself as the identifier for consistent coloring
  return getPlayerColor(playerName);
};

/**
 * Modern semantic color class generation using DaisyUI
 * @param {string|number} playerId - The unique player identifier
 * @param {string} type - Type of styling ('text', 'bg', 'badge', 'border', 'btn')
 * @returns {string} DaisyUI CSS class string
 */
export const getPlayerColorClasses = (playerId, type = 'text') => {
  const color = getPlayerColor(playerId);
  
  switch (type) {
    case 'text':
      return `text-${color}`;
    case 'bg':
      return `bg-${color}`;
    case 'badge':
      return `badge-${color}`;
    case 'border':
      return `border-${color}`;
    case 'btn':
      return `btn-${color}`;
    default:
      return `text-${color}`;
  }
};

/**
 * Modern semantic color class generation by name using DaisyUI
 * @param {string} playerName - The player's name
 * @param {Array} [players] - Optional array of player objects with id and name
 * @param {string} type - Type of styling ('text', 'bg', 'badge', 'border', 'btn')
 * @returns {string} DaisyUI CSS class string
 */
export const getPlayerColorClassesByName = (playerName, players = null, type = 'text') => {
  const color = getPlayerColorByName(playerName, players);
  
  switch (type) {
    case 'text':
      return `text-${color}`;
    case 'bg':
      return `bg-${color}`;
    case 'badge':
      return `badge-${color}`;
    case 'border':
      return `border-${color}`;
    case 'btn':
      return `btn-${color}`;
    default:
      return `text-${color}`;
  }
};

/**
 * Modern safe function to get text color class using semantic DaisyUI colors
 * Returns semantic fallback class if color is not available
 * @param {Object} player - Player object with color property
 * @returns {string} DaisyUI CSS class string
 */
export const getPlayerTextColorClass = (player) => {
  if (!player || !player.color) {
    return 'text-base-content'; // DaisyUI semantic text color
  }
  
  // Modern DaisyUI semantic color mapping
  const colorClassMap = {
    'primary': 'text-primary',
    'secondary': 'text-secondary',
    'accent': 'text-accent',
    'info': 'text-info',
    'success': 'text-success',
    'warning': 'text-warning',
    'error': 'text-error',
    'neutral': 'text-neutral'
  };
  
  return colorClassMap[player.color] || 'text-base-content';
};

/**
 * Modern safe function to get badge color class using semantic DaisyUI colors
 * Returns semantic fallback class if color is not available
 * @param {Object} player - Player object with color property
 * @returns {string} DaisyUI CSS class string
 */
export const getPlayerBadgeColorClass = (player) => {
  if (!player || !player.color) {
    return 'badge-neutral'; // DaisyUI semantic badge color
  }
  
  // Modern DaisyUI semantic badge color mapping
  const colorClassMap = {
    'primary': 'badge-primary',
    'secondary': 'badge-secondary',
    'accent': 'badge-accent',
    'info': 'badge-info',
    'success': 'badge-success',
    'warning': 'badge-warning',
    'error': 'badge-error',
    'neutral': 'badge-neutral'
  };
  
  return colorClassMap[player.color] || 'badge-neutral';
};

/**
 * Safe function to get ring color class for players using stored color
 * Returns fallback class if color is not available
 * @param {Object} player - Player object with color property
 * @returns {string} CSS class string
 */
export const getPlayerRingColorClass = (player) => {
  if (!player || !player.color) {
    return 'ring-neutral';
  }
  
  // Map DaisyUI colors to safe class names
  const colorClassMap = {
    'primary': 'ring-primary',
    'secondary': 'ring-secondary',
    'accent': 'ring-accent',
    'info': 'ring-info',
    'success': 'ring-success',
    'warning': 'ring-warning',
    'error': 'ring-error',
    'neutral': 'ring-neutral'
  };
  
  return colorClassMap[player.color] || 'ring-neutral';
};

/**
 * Safe function to get text color class by player name with fallback lookup
 * @param {string} playerName - The player's name
 * @param {Array} [players] - Optional array of player objects with id, name, and color
 * @returns {string} CSS class string
 */
export const getPlayerTextColorClassByName = (playerName, players = null) => {
  if (!playerName) {
    return 'text-base-content';
  }
  
  // If players array is provided, try to find the player and use their stored color
  if (players && Array.isArray(players)) {
    const player = players.find(p => p.name === playerName);
    if (player && player.color) {
      return getPlayerTextColorClass(player);
    }
  }
  
  // Fallback to algorithmic color based on name (for backward compatibility)
  const color = getPlayerColorByName(playerName, players);
  const colorClassMap = {
    'primary': 'text-primary',
    'secondary': 'text-secondary',
    'accent': 'text-accent',
    'info': 'text-info',
    'success': 'text-success',
    'warning': 'text-warning',
    'error': 'text-error',
    'neutral': 'text-neutral'
  };
  
  return colorClassMap[color] || 'text-base-content';
};

/**
 * Safe function to get badge color class by player ID (algorithmic fallback)
 * @param {string|number} playerId - The player's ID
 * @returns {string} CSS class string
 */
export const getPlayerBadgeColorClassById = (playerId) => {
  if (!playerId) {
    return 'badge-neutral';
  }
  
  // Use algorithmic color assignment as fallback
  const color = getPlayerColor(playerId);
  const colorClassMap = {
    'primary': 'badge-primary',
    'secondary': 'badge-secondary',
    'accent': 'badge-accent',
    'info': 'badge-info',
    'success': 'badge-success',
    'warning': 'badge-warning',
    'error': 'badge-error',
    'neutral': 'badge-neutral'
  };
  
  return colorClassMap[color] || 'badge-neutral';
};

/**
 * Get all available player colors
 * @returns {Array} Array of DaisyUI color names
 */
export const getAvailableColors = () => {
  return [...PLAYER_COLORS];
};

/**
 * Create a color mapping for an array of players
 * @param {Array} players - Array of player objects with id property
 * @returns {Object} Object mapping player IDs to colors
 */
export const createPlayerColorMap = (players) => {
  const colorMap = {};
  players.forEach(player => {
    colorMap[player.id] = getPlayerColor(player.id);
  });
  return colorMap;
};
