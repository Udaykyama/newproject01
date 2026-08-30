import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Both sides are hashed first so the comparison is over fixed-length buffers,
 * which also avoids leaking the expected token's length.
 */
export function secureCompare(a: string, b: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Extract a bearer token from an Authorization header.
 *
 * Parsed by slicing rather than with a regular expression: a pattern such as
 * `/^Bearer\s+(.+)$/` backtracks polynomially on a header of many spaces,
 * which an unauthenticated caller fully controls.
 */
function extractBearer(header: string | undefined): string | null {
  if (!header) return null;

  const trimmed = header.trim();
  const prefix = 'bearer ';
  if (trimmed.length <= prefix.length) return null;
  if (trimmed.slice(0, prefix.length).toLowerCase() !== prefix) return null;

  const token = trimmed.slice(prefix.length).trim();
  return token === '' ? null : token;
}

/**
 * Guard the ingest endpoint with a shared bearer token.
 *
 * If no token is configured the endpoint is refused outright rather than left
 * open — an unauthenticated ingest endpoint would let anyone poison another
 * repository's flake statistics.
 */
export function requireIngestToken(expected: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected) {
      res.status(503).json({ error: 'ingest is disabled: INGEST_TOKEN is not configured' });
      return;
    }

    const presented = extractBearer(req.get('authorization'));
    if (!presented || !secureCompare(presented, expected)) {
      res.status(401).json({ error: 'invalid or missing ingest token' });
      return;
    }

    next();
  };
}
