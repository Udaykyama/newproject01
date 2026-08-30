import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Rate limiting for the endpoints that perform authorisation.
 *
 * Both the webhook route (HMAC signature) and the ingest routes (bearer token)
 * validate a secret supplied by an unauthenticated caller, so without a limit
 * they are brute-forceable. Limits are per client IP and deliberately generous:
 * a busy installation can legitimately deliver a lot of traffic, and the goal
 * is to make guessing infeasible, not to shape normal load.
 */

const WINDOW_MS = 60_000;

function createLimiter(limit: number, message: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: message });
    },
  });
}

/** Guards HMAC signature verification on the webhook route. */
export function webhookRateLimiter(limit: number): RateLimitRequestHandler {
  return createLimiter(limit, 'too many webhook deliveries, slow down');
}

/** Guards bearer-token checks on the ingest and quarantine routes. */
export function ingestRateLimiter(limit: number): RateLimitRequestHandler {
  return createLimiter(limit, 'too many requests, slow down');
}

/**
 * Guards read-token checks once `REQUIRE_READ_AUTH` is on.
 *
 * A separate counter from the ingest limiter: read traffic and upload traffic
 * are unrelated, and letting either exhaust the other's budget would turn a
 * busy CI fleet into an outage for the dashboard, or vice versa.
 */
export function readRateLimiter(limit: number): RateLimitRequestHandler {
  return createLimiter(limit, 'too many requests, slow down');
}
