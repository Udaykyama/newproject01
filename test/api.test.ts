import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { Store } from '../src/db/store.js';
import { createServer } from '../src/server.js';
import type { AppContext } from '../src/context.js';

/**
 * End-to-end coverage over real HTTP: a CI job uploads JUnit reports, then the
 * flake and cost endpoints are read back. This is the path a customer actually
 * exercises on day one.
 */

const TOKEN = 'test-ingest-token';

/** Built by concatenation so the literal never resembles a real credential. */
function authHeader(token: string): Record<string, string> {
  return { authorization: ['Bearer', token].join(' ') };
}

let server: Server;
let baseUrl: string;

const config = loadConfig({ INGEST_TOKEN: TOKEN, FLAKE_MIN_RUNS: '4' });
const context: AppContext = {
  config,
  store: new Store(openDatabase(':memory:')),
  github: null,
};

beforeAll(async () => {
  const app = createServer(context);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function junit(cases: { name: string; failed?: boolean }[]): string {
  const body = cases
    .map(({ name, failed }) =>
      failed
        ? `<testcase classname="Suite" name="${name}" time="1.0"><failure message="boom"/></testcase>`
        : `<testcase classname="Suite" name="${name}" time="1.0"/>`,
    )
    .join('');
  return `<testsuite name="suite" tests="${cases.length}">${body}</testsuite>`;
}

async function ingest(body: unknown, token: string | null = TOKEN): Promise<Response> {
  return fetch(`${baseUrl}/v1/ingest/junit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? authHeader(token) : {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Runs are dated relative to now, not to a fixed literal: detection has a
 * time-bounded window, so a hard-coded date would quietly stop matching once
 * the calendar moved past it.
 */
const NOW = Date.now();

function recentIso(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function run(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalId: 'run-1',
    workflowName: 'ci',
    runAttempt: 1,
    commitSha: 'abc1234',
    branch: 'main',
    runnerOs: 'linux',
    durationMs: 600_000,
    conclusion: 'success',
    startedAt: recentIso(60),
    ...overrides,
  };
}

describe('GET /healthz', () => {
  it('reports readiness', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('POST /v1/ingest/junit', () => {
  it('rejects a request with no token', async () => {
    const response = await ingest({ repo: 'acme/widgets', run: run() }, null);
    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong token', async () => {
    const response = await ingest({ repo: 'acme/widgets', run: run() }, 'nope');
    expect(response.status).toBe(401);
  });

  it('rejects an unparseable repo slug', async () => {
    const response = await ingest({ repo: 'not-a-slug', run: run() });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: expect.arrayContaining([expect.stringContaining('owner/name')]),
    });
  });

  it('rejects a commit sha that is not hex', async () => {
    const response = await ingest({ repo: 'acme/widgets', run: run({ commitSha: 'zzz' }) });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown runner os', async () => {
    const response = await ingest({ repo: 'acme/widgets', run: run({ runnerOs: 'plan9' }) });
    expect(response.status).toBe(400);
  });

  it('rejects malformed JUnit XML rather than storing partial results', async () => {
    const response = await ingest({
      repo: 'acme/widgets',
      run: run(),
      junitXml: '<testsuite><testcase></testsuite>',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: expect.arrayContaining([expect.stringContaining('junitXml')]),
    });
  });

  it('accepts a JUnit upload and reports how many tests it stored', async () => {
    const response = await ingest({
      repo: 'acme/widgets',
      run: run({ externalId: 'first' }),
      junitXml: junit([{ name: 'alpha' }, { name: 'beta', failed: true }]),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ recorded: true, testsIngested: 2 });
  });

  it('is idempotent, so a retried upload does not double-count', async () => {
    const body = {
      repo: 'acme/widgets',
      run: run({ externalId: 'replayed' }),
      junitXml: junit([{ name: 'alpha' }]),
    };

    await ingest(body);
    const replay = await ingest(body);

    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ duplicate: true, testsIngested: 0 });
  });

  it('accepts pre-normalised results instead of XML', async () => {
    const response = await ingest({
      repo: 'acme/widgets',
      run: run({ externalId: 'structured' }),
      results: [{ suite: 'Suite', name: 'gamma', status: 'passed', durationMs: 5 }],
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ testsIngested: 1 });
  });
});

describe('flake and cost reporting', () => {
  const REPO = 'flaky/project';

  beforeAll(async () => {
    // A test that contradicts itself on one commit: proof of a flake.
    await ingest({
      repo: REPO,
      run: run({ externalId: 'pr-run', runAttempt: 1, commitSha: 'deadbee', branch: 'feature', pullRequestNumber: 7 }),
      junitXml: junit([{ name: 'wobbly', failed: true }, { name: 'steady' }]),
    });
    await ingest({
      repo: REPO,
      run: run({ externalId: 'pr-run', runAttempt: 2, commitSha: 'deadbee', branch: 'feature', pullRequestNumber: 7 }),
      junitXml: junit([{ name: 'wobbly' }, { name: 'steady' }]),
    });

    // Base-branch history so a cost baseline exists.
    for (let i = 0; i < 3; i += 1) {
      await ingest({
        repo: REPO,
        run: run({ externalId: `main-${i}`, commitSha: `abc000${i}`, durationMs: 600_000 }),
        junitXml: junit([{ name: 'steady' }]),
      });
    }
  });

  it('404s for a repository it has no data for', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/nobody/nothing/flaky`);
    expect(response.status).toBe(404);
  });

  it('rejects an invalid repository name', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/bad$owner/repo/flaky`);
    expect(response.status).toBe(400);
  });

  it('returns only flaky tests by default', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/flaky/project/flaky`);
    const body = (await response.json()) as { tests: { name: string; verdict: string }[] };

    expect(response.status).toBe(200);
    expect(body.tests.map((entry) => entry.name)).toEqual(['wobbly']);
    expect(body.tests[0]?.verdict).toBe('flaky_confirmed');
  });

  it('includes stable tests on request', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/flaky/project/flaky?includeStable=true`);
    const body = (await response.json()) as { tests: { name: string }[] };

    expect(body.tests.map((entry) => entry.name).sort()).toEqual(['steady', 'wobbly']);
  });

  it('builds a pull request report with cost, flakes and waste', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/flaky/project/pulls/7/report`);
    const body = (await response.json()) as {
      cost: { runCount: number; usd: number };
      flakes: { name: string }[];
      waste: { runCount: number; usd: number };
      baseline: { baselineUsd: number };
    };

    expect(response.status).toBe(200);
    expect(body.cost.runCount).toBe(2);
    // Two 10-minute Linux runs at $0.008/min.
    expect(body.cost.usd).toBeCloseTo(20 * 0.008, 6);
    expect(body.flakes.map((flake) => flake.name)).toEqual(['wobbly']);
    // The second attempt only re-ran because 'wobbly' failed.
    expect(body.waste.runCount).toBe(1);
    expect(body.baseline.baselineUsd).toBeGreaterThan(0);
  });

  it('renders the same report as markdown for a PR comment', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/flaky/project/pulls/7/report?format=markdown`);
    const body = await response.text();

    // Plain text, not text/markdown: the body carries test names from
    // untrusted CI reports and must never be rendered as a document.
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain('## CI Ledger');
    expect(body).toContain('wobbly');
  });

  it('rejects a non-numeric pull request number', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/flaky/project/pulls/abc/report`);
    expect(response.status).toBe(400);
  });

  it('accepts a valid base branch override', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/flaky/project/pulls/7/report?baseBranch=release/2.1`);
    expect(response.status).toBe(200);
  });

  it('rejects a base branch that is not a valid git ref', async () => {
    const response = await fetch(
      `${baseUrl}/v1/repos/flaky/project/pulls/7/report?baseBranch=${encodeURIComponent('<script>x</script>')}`,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'baseBranch must be a valid git branch name' });
  });

  it('rejects a repeated base branch parameter', async () => {
    // Express parses a repeated key as an array; it must not be trusted.
    const response = await fetch(`${baseUrl}/v1/repos/flaky/project/pulls/7/report?baseBranch=main&baseBranch=dev`);

    expect(response.status).toBe(400);
  });
});

describe('quarantine endpoints', () => {
  it('requires the ingest token', async () => {
    const response = await fetch(`${baseUrl}/v1/repos/acme/widgets/quarantine`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ suite: 'Suite', name: 'alpha' }),
    });

    expect(response.status).toBe(401);
  });

  it('quarantines a test and surfaces it in the flake report', async () => {
    const created = await fetch(`${baseUrl}/v1/repos/flaky/project/quarantine`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader(TOKEN) },
      body: JSON.stringify({ suite: 'Suite', name: 'wobbly', reason: 'ENG-1' }),
    });
    expect(created.status).toBe(201);

    const listed = await fetch(`${baseUrl}/v1/repos/flaky/project/flaky`);
    const body = (await listed.json()) as { quarantined: { name: string }[] };
    expect(body.quarantined.map((entry) => entry.name)).toEqual(['wobbly']);
  });

  it('removes a quarantine and 404s when it is already gone', async () => {
    const remove = async (): Promise<Response> =>
      fetch(`${baseUrl}/v1/repos/flaky/project/quarantine`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...authHeader(TOKEN) },
        body: JSON.stringify({ suite: 'Suite', name: 'wobbly' }),
      });

    expect((await remove()).status).toBe(200);
    expect((await remove()).status).toBe(404);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const response = await fetch(`${baseUrl}/nope`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});

describe('webhook endpoint', () => {
  it('is disabled when no webhook secret is configured', async () => {
    const response = await fetch(`${baseUrl}/webhooks/github`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(404);
  });
});
