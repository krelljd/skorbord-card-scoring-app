/**
 * Per-sqid token-bucket rate limiter for score writes. In-memory, suitable for
 * the single-process Pi deployment. The per-IP express-rate-limit still applies
 * globally; this adds a per-board cap so one sqid cannot be flooded.
 *
 * @param {{ capacity?: number, refillPerSec?: number }} [opts]
 */
export function createScoreRateLimiter({ capacity = 20, refillPerSec = 10 } = {}) {
  const buckets = new Map(); // sqid -> { tokens, last }

  function take(key, now = Date.now()) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, last: now };
      buckets.set(key, bucket);
    }
    // Refill based on elapsed time.
    const elapsedSec = Math.max(0, (now - bucket.last) / 1000);
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
    bucket.last = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  function middleware(req, res, next) {
    const key = req.params.sqid || 'unknown';
    if (take(key)) {
      return next();
    }
    return res.status(429).json({
      success: false,
      error: 'Too many score updates, slow down'
    });
  }

  return { take, middleware };
}
