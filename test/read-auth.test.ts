import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { Store } from '../src/db/store.js';
import { createServer } from '../src/server.js';
import { generateApiToken, scopeAllows, tokenDigest } from '../src/api/auth.js';
import type { AppContext } from '../src/context.js';

/**
 * Row-level scoping on the read endpoints.
 *
 * Test names, failure counts and CI spend are all readable from these routes,
 * so an instance serving more than one tenant must not answer them from a
 * token that does not cover the repository in the path. This is the blocker
 * the roadmap names for the hosted GitHub App.
 */

const INGEST_TOKEN = 'test-ingest-token';

/** Built by concatenation so the literal never resembles a real credential. */
function authHeader(token: string): Record<string, string> {
  return { authorization: ['Bearer', token].join(' ') };
}

const servers: Server[] = [];

async function startServer(env: Record<string, string> = {}): Promise<{ url: string; store: Store }> {
  const context: AppContext = {
    config: loadConfig({ INGEST_TOKEN, ...env }),
    store: new Store(openDatabase(':memory:')),
    github: null,
  };

  const server = await new Promise<Server>((resolve) => {
    const listener = createServer(context).listen(0, () => resolve(listener));
  });
  servers.push(server);

  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store: context.store };
}

/** Give the repository a row so a 404 can be told apart from a 403. */
function seed(store: Store, owner: string, name: string): void {
  store.upsertRepo({ owner, name });
}

async function readFlaky(url: string, slug: string, token?: string): Promise<Response> {
  return fetch(`${url}/v1/repos/${slug}/flaky`, {
    headers: token ? authHeader(token) : {},
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('scopeAllows', () => {
  it('matches owner and repository case-insensitively, as GitHub does', () => {
    expect(scopeAllows({ owner: 'Acme', name: 'Widgets' }, { owner: 'acme', name: 'widgets' })).toBe(true);
  });

  it('treats a null repository scope as every repository under the owner', () => {
    expect(scopeAllows({ owner: 'acme', name: null }, { owner: 'acme', name: 'anything' })).toBe(true);
  });

  it('never crosses an owner boundary', () => {
    expect(scopeAllows({ owner: 'acme', name: null }, { owner: 'other', name: 'widgets' })).toBe(false);
  });

  it('refuses a sibling repository under the same owner', () => {
    expect(scopeAllows({ owner: 'acme', name: 'widgets' }, { owner: 'acme', name: 'gadgets' })).toBe(false);
  });
});

describe('read tokens', () => {
  it('mints a distinct secret each time and stores only its digest', () => {
    const store = new Store(openDatabase(':memory:'));
    const first = generateApiToken();
    const second = generateApiToken();

    expect(first).not.toBe(second);

    const record = store.createApiToken(tokenDigest(first), { owner: 'acme', name: null }, 'install 1');
    expect(store.findApiTokenByDigest(tokenDigest(first))?.id).toBe(record.id);
    expect(store.findApiTokenByDigest(tokenDigest(second))).toBeNull();
  });

  it('stops resolving a revoked token but keeps it listed', () => {
    const store = new Store(openDatabase(':memory:'));
    const secret = generateApiToken();
    const record = store.createApiToken(tokenDigest(secret), { owner: 'acme', name: 'widgets' });

    expect(store.revokeApiToken(record.id)).toBe(true);
    expect(store.findApiTokenByDigest(tokenDigest(secret))).toBeNull();
    expect(store.hasApiTokens()).toBe(false);
    expect(store.revokeApiToken(record.id)).toBe(false);

    const listed = store.listApiTokens();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.revokedAt).not.toBeNull();
  });
});

describe('read endpoint authorisation', () => {
  it('stays open when REQUIRE_READ_AUTH is unset, so single-tenant self-hosting needs no token', async () => {
    const { url, store } = await startServer();
    seed(store, 'acme', 'widgets');

    expect((await readFlaky(url, 'acme/widgets')).status).toBe(200);
  });

  it('rejects an unauthenticated read once auth is required', async () => {
    const { url, store } = await startServer({ REQUIRE_READ_AUTH: 'true' });
    seed(store, 'acme', 'widgets');

    const response = await readFlaky(url, 'acme/widgets');
    expect(response.status).toBe(401);
  });

  it('serves a repository the token is scoped to', async () => {
    const { url, store } = await startServer({ REQUIRE_READ_AUTH: 'true' });
    seed(store, 'acme', 'widgets');

    const secret = generateApiToken();
    store.createApiToken(tokenDigest(secret), { owner: 'acme', name: 'widgets' });

    expect((await readFlaky(url, 'acme/widgets', secret)).status).toBe(200);
  });

  it('refuses another tenant even when that repository exists', async () => {
    const { url, store } = await startServer({ REQUIRE_READ_AUTH: 'true' });
    seed(store, 'acme', 'widgets');
    seed(store, 'other', 'secrets');

    const secret = generateApiToken();
    store.createApiToken(tokenDigest(secret), { owner: 'acme', name: null });

    const response = await readFlaky(url, 'other/secrets', secret);
    expect(response.status).toBe(403);
    // The verdict comes from the token's scope alone, so the body must not
    // disclose whether the other tenant's repository is present here.
    expect(await response.text()).not.toContain('no data');
  });

  it('scopes the pull request report as well as the flake list', async () => {
    const { url, store } = await startServer({ REQUIRE_READ_AUTH: 'true' });
    seed(store, 'other', 'secrets');

    const secret = generateApiToken();
    store.createApiToken(tokenDigest(secret), { owner: 'acme', name: 'widgets' });

    const response = await fetch(`${url}/v1/repos/other/secrets/pulls/1/report`, { headers: authHeader(secret) });
    expect(response.status).toBe(403);
  });

  it('rejects a revoked token', async () => {
    const { url, store } = await startServer({ REQUIRE_READ_AUTH: 'true' });
    seed(store, 'acme', 'widgets');

    const secret = generateApiToken();
    const record = store.createApiToken(tokenDigest(secret), { owner: 'acme', name: 'widgets' });
    store.revokeApiToken(record.id);

    expect((await readFlaky(url, 'acme/widgets', secret)).status).toBe(401);
  });

  it('accepts the ingest token, which can already write every repository here', async () => {
    const { url, store } = await startServer({ REQUIRE_READ_AUTH: 'true' });
    seed(store, 'acme', 'widgets');

    expect((await readFlaky(url, 'acme/widgets', INGEST_TOKEN)).status).toBe(200);
  });

  it('rate limits token guesses, so a read token cannot be brute-forced', async () => {
    const limit = 3;
    const { url, store } = await startServer({ REQUIRE_READ_AUTH: 'true', RATE_LIMIT_READ_PER_MIN: String(limit) });
    seed(store, 'acme', 'widgets');

    let last = 0;
    for (let attempt = 0; attempt <= limit; attempt += 1) {
      last = (await readFlaky(url, 'acme/widgets', `guess-${attempt}`)).status;
    }

    expect(last).toBe(429);
  });

  it('rejects an invalid repository name before consulting the token', async () => {
    const { url } = await startServer({ REQUIRE_READ_AUTH: 'true' });

    const response = await readFlaky(url, 'acme/not%20a%20repo', 'irrelevant');
    expect(response.status).toBe(400);
  });
});
