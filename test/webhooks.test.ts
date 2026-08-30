import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { Store } from '../src/db/store.js';
import { createServer } from '../src/server.js';
import type { AppContext } from '../src/context.js';

/**
 * Webhook route coverage.
 *
 * Signature verification is the security boundary of the whole service: a
 * forged delivery could poison a repository's flake statistics and cost
 * ledger, so its accept/reject behaviour is asserted directly.
 */

const SECRET = 'webhook-secret-for-tests';

let server: Server;
let baseUrl: string;
let store: Store;

beforeAll(async () => {
  store = new Store(openDatabase(':memory:'));

  const context: AppContext = {
    config: loadConfig({ GITHUB_WEBHOOK_SECRET: SECRET }),
    store,
    github: null,
  };

  const app = createServer(context);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function sign(payload: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(payload).digest('hex')}`;
}

function workflowRunPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: 'completed',
    workflow_run: {
      id: 12345,
      name: 'ci',
      run_attempt: 1,
      head_sha: 'abc1234def',
      head_branch: 'feature',
      conclusion: 'failure',
      run_started_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:10:00Z',
      pull_requests: [{ number: 5, base: { ref: 'main' } }],
      ...overrides,
    },
    repository: {
      name: 'widgets',
      default_branch: 'main',
      owner: { login: 'acme' },
    },
  });
}

async function deliver(
  payload: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}/webhooks/github`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-delivery': 'delivery-1',
      'x-github-event': 'workflow_run',
      'x-hub-signature-256': sign(payload),
      ...headers,
    },
    body: payload,
  });
}

describe('POST /webhooks/github', () => {
  it('rejects a delivery whose signature does not match', async () => {
    const response = await deliver(workflowRunPayload(), {
      'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
    });

    expect(response.status).toBe(400);
    // A forged delivery must never be stored.
    expect(store.findRepo({ owner: 'acme', name: 'widgets' })).toBeNull();
  });

  it('rejects a delivery with a signature for different content', async () => {
    const response = await deliver(workflowRunPayload(), {
      'x-hub-signature-256': sign('{"tampered":true}'),
    });

    expect(response.status).toBe(400);
  });

  it('rejects a delivery missing the GitHub headers', async () => {
    const payload = workflowRunPayload();
    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });

    expect(response.status).toBe(400);
  });

  it('accepts a correctly signed delivery and records the run', async () => {
    const response = await deliver(workflowRunPayload());

    expect(response.status).toBe(202);

    const repoId = store.findRepo({ owner: 'acme', name: 'widgets' });
    expect(repoId).not.toBeNull();

    const runs = store.runsForPullRequest(repoId!, 5);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      externalId: '12345',
      workflowName: 'ci',
      runAttempt: 1,
      branch: 'feature',
      conclusion: 'failure',
    });
    // Falls back to wall-clock time when no App credentials allow a job lookup.
    expect(runs[0]?.durationMs).toBe(10 * 60_000);
  });

  it('ignores a re-delivered event rather than double-counting it', async () => {
    await deliver(workflowRunPayload());

    const repoId = store.findRepo({ owner: 'acme', name: 'widgets' })!;
    expect(store.runsForPullRequest(repoId, 5)).toHaveLength(1);
  });

  it('records a run that belongs to no pull request', async () => {
    const payload = workflowRunPayload({ id: 777, pull_requests: [], head_branch: 'main' });
    const response = await deliver(payload);

    expect(response.status).toBe(202);

    const repoId = store.findRepo({ owner: 'acme', name: 'widgets' })!;
    const mainRuns = store.runsForBranch(repoId, 'main', 10);
    expect(mainRuns.map((run) => run.externalId)).toContain('777');
  });

  it('treats a second attempt as a separate run', async () => {
    const payload = workflowRunPayload({ run_attempt: 2 });
    const response = await deliver(payload);

    expect(response.status).toBe(202);

    const repoId = store.findRepo({ owner: 'acme', name: 'widgets' })!;
    const attempts = store.runsForPullRequest(repoId, 5).map((run) => run.runAttempt);
    expect(attempts.sort()).toEqual([1, 2]);
  });

  it('acknowledges events it has no handler for', async () => {
    const payload = JSON.stringify({ action: 'opened' });
    const response = await deliver(payload, { 'x-github-event': 'issues' });

    expect(response.status).toBe(202);
  });
});
