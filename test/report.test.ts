import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { Store } from '../src/db/store.js';
import { buildPullRequestReport, buildRepoReport, windowStart } from '../src/analysis/report.js';
import { loadConfig } from '../src/config.js';
import type { RunIngestPayload, TestResult } from '../src/types.js';

/**
 * The report layer is where detection, cost and operator decisions meet. Its
 * job is to show a reviewer what changed, which means a test somebody already
 * quarantined must be visible but must not be mixed in with new findings.
 */

const REPO = { owner: 'acme', name: 'widgets' };
const CONFIG = loadConfig({ FLAKE_MIN_RUNS: '2' });

/** Recent, because detection is time-bounded. */
function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function result(name: string, status: TestResult['status']): TestResult {
  return { suite: 'Suite', name, status, durationMs: 100, failureMessage: null };
}

function payload(
  overrides: Partial<RunIngestPayload['run']>,
  results: TestResult[],
): RunIngestPayload {
  return {
    repo: REPO,
    run: {
      externalId: 'run-1',
      workflowName: 'ci',
      runAttempt: 1,
      commitSha: 'abc1234',
      branch: 'main',
      pullRequestNumber: null,
      runnerOs: 'linux',
      durationMs: 600_000,
      durationSource: 'jobs',
      conclusion: 'success',
      startedAt: isoMinutesAgo(60),
      ...overrides,
    },
    results,
  };
}

describe('windowStart', () => {
  it('returns no bound when the window is disabled', () => {
    expect(windowStart(0)).toBeNull();
    expect(windowStart(-1)).toBeNull();
  });

  it('returns the timestamp that many days back', () => {
    const now = new Date('2026-04-01T00:00:00.000Z');
    expect(windowStart(30, now)).toBe('2026-03-02T00:00:00.000Z');
  });
});

describe('reports', () => {
  let store: Store;
  let repoId: number;

  beforeEach(() => {
    store = new Store(openDatabase(':memory:'));

    // 'wobbly' contradicts itself on one commit: proof of non-determinism.
    store.recordRun(
      payload({ externalId: 'pr-1', runAttempt: 1, branch: 'feature', pullRequestNumber: 7 }, [
        result('wobbly', 'failed'),
        result('steady', 'passed'),
      ]),
    );
    store.recordRun(
      payload({ externalId: 'pr-1', runAttempt: 2, branch: 'feature', pullRequestNumber: 7 }, [
        result('wobbly', 'passed'),
        result('steady', 'passed'),
      ]),
    );

    repoId = store.findRepo(REPO)!;
  });

  it('marks a detected flake as quarantined once an operator handles it', () => {
    expect(buildRepoReport(store, repoId, REPO, CONFIG).assessments.find((a) => a.name === 'wobbly')?.quarantined).toBe(
      false,
    );

    store.quarantine(repoId, 'Suite', 'wobbly', 'ENG-1');

    const after = buildRepoReport(store, repoId, REPO, CONFIG);
    expect(after.assessments.find((a) => a.name === 'wobbly')?.quarantined).toBe(true);
  });

  it('drops a quarantine that has expired rather than hiding the test forever', () => {
    store.quarantine(repoId, 'Suite', 'wobbly', null, 'octocat', '2000-01-01T00:00:00.000Z');

    expect(buildRepoReport(store, repoId, REPO, CONFIG).quarantined).toEqual([]);
  });

  it('still charges waste to a quarantined test, because it still burns minutes', () => {
    const before = buildPullRequestReport(store, repoId, REPO, 7, 'main', CONFIG);
    expect(before.waste.runCount).toBe(1);

    store.quarantine(repoId, 'Suite', 'wobbly', 'ENG-1');

    // A quarantine stops a test failing the build; it does not stop it costing
    // money, and that number is the argument for deleting it.
    const after = buildPullRequestReport(store, repoId, REPO, 7, 'main', CONFIG);
    expect(after.waste.runCount).toBe(1);
    expect(after.waste.usd).toBeCloseTo(before.waste.usd, 6);
    expect(after.flakes.find((flake) => flake.name === 'wobbly')?.quarantined).toBe(true);
  });

  it('ignores evidence older than the detection window', () => {
    const stale = new Store(openDatabase(':memory:'));
    stale.recordRun(
      payload({ externalId: 'old-1', runAttempt: 1, startedAt: '2000-01-01T00:00:00.000Z' }, [
        result('wobbly', 'failed'),
      ]),
    );
    stale.recordRun(
      payload({ externalId: 'old-2', runAttempt: 1, startedAt: '2000-01-02T00:00:00.000Z' }, [
        result('wobbly', 'passed'),
      ]),
    );

    const staleRepoId = stale.findRepo(REPO)!;
    expect(buildRepoReport(stale, staleRepoId, REPO, CONFIG).assessments).toEqual([]);
  });
});
