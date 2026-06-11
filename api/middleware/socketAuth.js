import { isValidId } from '../utils/helpers.js';

/**
 * Socket.IO authentication middleware
 * Validates that the socket has access to the specified Sqid
 */
export function socketAuthMiddleware(socket, next) {
  if (typeof next !== 'function') {
    console.warn('socketAuthMiddleware called without next function. Skipping.');
    return;
  }
  try {
    const { sqid } = socket.handshake.auth;
    console.log('🔐 Socket auth check:', { sqid, socketId: socket.id });
    if (!sqid || !isValidId(sqid)) {
      console.error('❌ Invalid or missing Sqid:', sqid);
      next(new Error('Invalid or missing Sqid'));
      return;
    }
    // Store sqid in socket for later use
    socket.sqid = sqid;
    // Join the socket to the sqid room for targeted broadcasts
    socket.join(`/sqid/${sqid}`);
    console.log('✅ Socket authenticated successfully:', { sqid, socketId: socket.id });
    next();
    return;
  } catch (error) {
    console.error('❌ Socket auth error:', error);
    next(error);
    return;
  }
}

/**
 * Middleware to validate socket has access to a specific game
 */
export function validateSocketGameAccess(socket, gameId, callback) {
  if (!isValidId(gameId)) {
    return callback(new Error('Invalid game ID'));
  }
  
  // Additional validation can be added here
  // For now, we trust that the socket is already authenticated to the sqid
  callback();
}

/**
 * Rate limiting for socket events
 */
export function createSocketRateLimit(maxEvents = 10, windowMs = 60000) {
  const clients = new Map();
  
  return function(eventHandler) {
    return function(data, callback) {
      const clientId = this.id; // 'this' refers to the socket
      const now = Date.now();
      
      if (!clients.has(clientId)) {
        clients.set(clientId, { count: 1, resetTime: now + windowMs });
        return eventHandler.call(this, data, callback);
      }
      
      const client = clients.get(clientId);
      
      if (now > client.resetTime) {
        client.count = 1;
        client.resetTime = now + windowMs;
        return eventHandler.call(this, data, callback);
      }
      
      if (client.count >= maxEvents) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Rate limit exceeded' });
        }
        return;
      }
      
      client.count++;
      return eventHandler.call(this, data, callback);
    };
  };
}
