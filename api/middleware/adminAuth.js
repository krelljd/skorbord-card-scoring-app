import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { ForbiddenError } from './errorHandler.js';

/**
 * Gates a route behind the shared ADMIN_PIN env var. Fails closed (503) if
 * ADMIN_PIN isn't configured; otherwise does a timing-safe comparison of
 * the X-Admin-Pin header against it.
 */
export function requireAdminPin(req, res, next) {
  const configuredPin = process.env.ADMIN_PIN;
  if (!configuredPin) {
    res.status(503).json({ success: false, error: 'Admin features not configured' });
    return;
  }

  const suppliedPin = req.headers['x-admin-pin'];
  if (typeof suppliedPin !== 'string' || !pinsMatch(suppliedPin, configuredPin)) {
    next(new ForbiddenError('Invalid admin PIN'));
    return;
  }

  next();
}

function pinsMatch(supplied, configured) {
  const suppliedBuf = Buffer.from(supplied);
  const configuredBuf = Buffer.from(configured);
  if (suppliedBuf.length !== configuredBuf.length) {
    // Still run a timing-safe compare of matching length so a length
    // mismatch doesn't short-circuit faster than a content mismatch.
    crypto.timingSafeEqual(suppliedBuf, Buffer.alloc(suppliedBuf.length));
    return false;
  }
  return crypto.timingSafeEqual(suppliedBuf, configuredBuf);
}

/**
 * Rate limiter for PIN-gated admin endpoints, to blunt brute-forcing a
 * short PIN. Not covered by automated tests (same as the app's existing
 * global rate limiter in index.js) since express-rate-limit's internals
 * need a real HTTP request; verified manually per the tasks that use it.
 */
export const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many admin attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});
