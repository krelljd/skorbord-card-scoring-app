import { isValidId, isValidScore } from '../utils/helpers.js';
import db from '../db/database.js';

// Simple rate limit stub (replace with real if needed)
const scoreUpdateRateLimit = (fn) => fn;

/**
 * Handle new socket connection
 */
export function handleConnection(io, socket) {
  // Join sqid room
  socket.on('join-sqid', (sqid) => {
    if (!isValidId(sqid)) {
      socket.emit('error', { error: 'Invalid sqid' });
      return;
    }
    socket.sqid = sqid;
    socket.join(`/sqid/${sqid}`);
    socket.emit('connected', {
      sqid,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
    console.log(`🔌 Socket joined Sqid: ${sqid} (${socket.id})`);
  });

  // Broadcast score updates to sqid room
  socket.on('update_score', async (data) => {
    if (!socket.sqid) return;
    io.to(`/sqid/${socket.sqid}`).emit('score_update', { ...data, timestamp: new Date().toISOString() });
  });

  // Broadcast player activity to sqid room
  socket.on('player_activity', (data) => {
    if (!socket.sqid) return;
    io.to(`/sqid/${socket.sqid}`).emit('player_activity', { ...data, timestamp: new Date().toISOString() });
  });

  // Broadcast show rivalry stats event to sqid room
  socket.on('show_rivalry_stats', (data) => {
    if (!socket.sqid) return;
    socket.to(`/sqid/${socket.sqid}`).emit('show_rivalry_stats', { ...data, timestamp: new Date().toISOString() });
  });

  // Clean up on disconnect
  socket.on('disconnect', (reason) => {
    if (socket.sqid) {
      console.log(`🔌 Socket disconnected: ${socket.sqid} (${socket.id}) - Reason: ${reason}`);
      io.to(`/sqid/${socket.sqid}`).emit('player_left', {
        type: 'player_left',
        sqidId: socket.sqid,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Broadcast to specific sqid
 */
export function broadcastToSquid(io, sqid, event, data) {
  io.to(`/sqid/${sqid}`).emit(event, {
    ...data,
    sqidId: sqid,
    timestamp: new Date().toISOString()
  });
}

/**
 * Broadcast to specific game
 */
export function broadcastToGame(io, gameId, event, data) {
  io.to(`/game/${gameId}`).emit(event, {
    ...data,
    gameId: gameId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get connected clients count for a sqid
 */
export async function getSquidClientCount(io, sqid) {
  try {
    const clients = await io.in(`/sqid/${sqid}`).allSockets();
    return clients.size;
  } catch (error) {
    console.error('Error getting client count:', error);
    return 0;
  }
}

/**
 * Send system message to sqid
 */
export function sendSystemMessage(io, sqid, message, type = 'info') {
  broadcastToSquid(io, sqid, 'system_message', {
    type: 'system_message',
    messageType: type,
    message: message
  });
}
