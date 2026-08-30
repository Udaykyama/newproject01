import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppContext } from '../context.js';
import type { ApiTokenScope } from '../db/store.js';
import type { RepoRef } from '../types.js';
import { isValidRepoName } from './validate.js';

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

/** SHA-256 of a token, hex encoded — the only form ever persisted. */
export function tokenDigest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Mint a read token.
 *
 * 32 bytes from the CSPRNG, so the digest stored in the database is not worth
 * attacking and the token is not worth guessing. The prefix exists so a leaked
 * string is recognisable in a log or a secret scanner.
 */
export function generateApiToken(): string {
  return `cilg_${randomBytes(32).toString('base64url')}`;
}

/** True when a token scoped to `scope` may read `repo`. */
export function scopeAllows(scope: ApiTokenScope, repo: RepoRef): boolean {
  // GitHub treats owner and repository names case-insensitively, and the same
  // repository must not resolve differently depending on how it was typed.
  const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
  if (!same(scope.owner, repo.owner)) return false;
  // A null repository scope is the whole owner — what an organisation-wide
  // App installation grants.
  return scope.name === null || same(scope.name, repo.name);
}

/**
 * Guard a read endpoint with a repository-scoped token.
 *
 * Row-level scoping is enforced here rather than in the query layer because
 * every read endpoint is already addressed by `:owner/:repo`: a token that does
 * not cover the path cannot reach the data behind it.
 *
 * When `REQUIRE_READ_AUTH` is off the guard is a no-op, which keeps a
 * single-tenant self-hosted instance token-free. That default is only safe
 * while one instance serves one tenant.
 */
export function requireReadAccess(context: AppContext) {
  const { config, store } = context;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.reads.requireAuth) {
      next();
      return;
    }

    const presented = extractBearer(req.get('authorization'));
    if (!presented) {
      res.status(401).json({ error: 'a read token is required' });
      return;
    }

    const owner = typeof req.params.owner === 'string' ? req.params.owner : '';
    const name = typeof req.params.repo === 'string' ? req.params.repo : '';
    if (!isValidRepoName(owner) || !isValidRepoName(name)) {
      res.status(400).json({ error: 'invalid repository owner or name' });
      return;
    }

    // The ingest token already writes any repository on this instance, so
    // withholding read access from it would protect nothing.
    if (config.ingestToken && secureCompare(presented, config.ingestToken)) {
      next();
      return;
    }

    const token = store.findApiTokenByDigest(tokenDigest(presented));
    if (!token) {
      res.status(401).json({ error: 'invalid or revoked read token' });
      return;
    }

    if (!scopeAllows(token.scope, { owner, name })) {
      // Decided purely from the token's own scope and the caller's own path,
      // so this never discloses whether the repository exists here.
      res.status(403).json({ error: `token is not scoped to ${owner}/${name}` });
      return;
    }

    next();
  };
}
