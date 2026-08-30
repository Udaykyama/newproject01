import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { Store } from '../src/db/store.js';
import { createServer } from '../src/server.js';
import type { AppContext } from '../src/context.js';

/**
 * Security behaviour of the HTTP surface: response hardening, credential
 * parsing, and the rate limits that keep the shared secrets from being
 * brute-forced.
 */

const TOKEN = 'test-ingest-token';
const INGEST_LIMIT = 4;

/** Built by concatenation so the literal never resembles a real credential. */
function authHeader(token: string): Record<string, string> {
  return { authorization: ['Bearer', token].join(' ') };
}

/**
 * Each suite gets its own server: rate limit counters live per app instance,
 * so a shared one would let earlier tests exhaust a later test's budget.
 */
async function startServer(env: Record<string, string> = {}): Promise<{ url: string; server: Server }> {
  const context: AppContext = {
    config: loadConfig({ INGEST_TOKEN: TOKEN, ...env }),
    store: new Store(openDatabase(':memory:')),
    github: null,
  };

  const server = await new Promise<Server>((resolve) => {
    const listener = createServer(context).listen(0, () => resolve(listener));
  });

  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function post(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(`${url}/v1/ingest/junit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{}',
  });
}

let baseUrl: string;
let server: Server;

beforeAll(async () => {
  ({ url: baseUrl, server } = await startServer());
});

afterAll(async () => {
  await stopServer(server);
});

function ingest(headers: Record<string, string>): Promise<Response> {
  return post(baseUrl, headers);
}

describe('response hardening', () => {
  it('sends nosniff so untrusted test names cannot be sniffed as HTML', async () => {
    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('does not advertise the server framework', async () => {
    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.headers.get('x-powered-by')).toBeNull();
  });
});

describe('bearer token parsing', () => {
  it('accepts the scheme case-insensitively', async () => {
    const response = await ingest({ authorization: ['bearer', TOKEN].join(' ') });

    expect(response.status).not.toBe(401);
  });

  it('tolerates surrounding and repeated whitespace', async () => {
    const response = await ingest({ authorization: ['  Bearer', '', '', TOKEN, ' '].join(' ') });

    expect(response.status).not.toBe(401);
  });

  it('rejects a scheme with no token', async () => {
    const response = await ingest({ authorization: ['Bearer', '   '].join(' ') });

    expect(response.status).toBe(401);
  });

  it('rejects an unrelated scheme', async () => {
    const response = await ingest({ authorization: ['Basic', TOKEN].join(' ') });

    expect(response.status).toBe(401);
  });

  it('parses a pathological all-whitespace header without stalling', async () => {
    // Regression test for the backtracking `/^Bearer\s+(.+)$/` this replaced:
    // the header is attacker-controlled, so parsing must stay linear.
    const header = ['Bearer', ' '.repeat(50_000)].join(' ');
    const started = performance.now();

    const response = await ingest({ authorization: header });

    expect(response.status).toBe(401);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe('rate limiting', () => {
  let strictUrl: string;
  let strictServer: Server;

  beforeAll(async () => {
    ({ url: strictUrl, server: strictServer } = await startServer({
      RATE_LIMIT_INGEST_PER_MIN: String(INGEST_LIMIT),
    }));
  });

  afterAll(async () => {
    await stopServer(strictServer);
  });

  it('throttles repeated unauthenticated attempts on the ingest endpoint', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < INGEST_LIMIT + 2; attempt += 1) {
      const response = await post(strictUrl, authHeader('wrong-token'));
      statuses.push(response.status);
    }

    // The limiter runs ahead of authentication, so guesses are throttled
    // rather than merely rejected one by one.
    expect(statuses.slice(0, INGEST_LIMIT)).toEqual(Array(INGEST_LIMIT).fill(401));
    expect(statuses.slice(INGEST_LIMIT)).toEqual([429, 429]);
  });

  it('explains the refusal as JSON and advertises the limit', async () => {
    const response = await post(strictUrl, authHeader('wrong-token'));

    expect(response.status).toBe(429);
    expect(response.headers.get('ratelimit-policy')).toContain(String(INGEST_LIMIT));
    await expect(response.json()).resolves.toEqual({ error: 'too many requests, slow down' });
  });

  it('leaves unauthenticated read endpoints unthrottled', async () => {
    // Reads carry no secret to guess; throttling them would only break
    // dashboards that poll.
    const statuses = await Promise.all(
      Array.from({ length: INGEST_LIMIT + 4 }, async () => {
        const response = await fetch(`${strictUrl}/v1/repos/acme/widgets/flaky`);
        return response.status;
      }),
    );

    expect(statuses.every((status) => status !== 429)).toBe(true);
  });
});
