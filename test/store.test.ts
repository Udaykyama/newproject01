import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { Store } from '../src/db/store.js';
import type { RunIngestPayload, TestResult } from '../src/types.js';

const REPO = { owner: 'acme', name: 'widgets' };

function payload(overrides: Partial<RunIngestPayload['run']> = {}, results: TestResult[] = []): RunIngestPayload {
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
      durationMs: 60_000,
      conclusion: 'success',
      startedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    },
    results,
  };
}

function test(name: string, status: TestResult['status'] = 'passed'): TestResult {
  return { suite: 'Suite', name, status, durationMs: 100, failureMessage: null };
}

describe('Store', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(openDatabase(':memory:'));
  });

  it('creates a repository once and reuses its id', () => {
    const first = store.upsertRepo(REPO);
    const second = store.upsertRepo(REPO);

    expect(first).toBe(second);
    expect(store.findRepo(REPO)).toBe(first);
  });

  it('returns null for a repository it has never seen', () => {
    expect(store.findRepo({ owner: 'nobody', name: 'nothing' })).toBeNull();
  });

  it('records a run and its results', () => {
    const outcome = store.recordRun(payload({}, [test('a'), test('b', 'failed')]));
    expect(outcome.inserted).toBe(true);

    const repoId = store.findRepo(REPO)!;
    expect(store.recentObservations(repoId, 50)).toHaveLength(2);
  });

  it('ignores a re-delivered run so cost is never double-counted', () => {
    store.recordRun(payload({}, [test('a')]));
    const second = store.recordRun(payload({}, [test('a')]));

    const repoId = store.findRepo(REPO)!;

    expect(second.inserted).toBe(false);
    expect(store.recentObservations(repoId, 50)).toHaveLength(1);
    expect(store.runsForBranch(repoId, 'main', 10)).toHaveLength(1);
  });

  it('treats a different attempt of the same run as a distinct record', () => {
    store.recordRun(payload({ runAttempt: 1 }, [test('a', 'failed')]));
    const retry = store.recordRun(payload({ runAttempt: 2 }, [test('a', 'passed')]));

    expect(retry.inserted).toBe(true);
    expect(store.runsForBranch(store.findRepo(REPO)!, 'main', 10)).toHaveLength(2);
  });

  it('keeps repositories isolated from each other', () => {
    store.recordRun(payload({}, [test('a')]));
    store.recordRun({
      ...payload({ externalId: 'other-run' }, [test('b')]),
      repo: { owner: 'acme', name: 'gadgets' },
    });

    const widgets = store.findRepo(REPO)!;
    const observations = store.recentObservations(widgets, 50);

    expect(observations).toHaveLength(1);
    expect(observations[0]?.name).toBe('a');
  });

  it('applies the history window per test, not globally', () => {
    // "chatty" runs 5 times, "rare" once. A global limit of 3 would hide
    // "rare" entirely.
    for (let i = 0; i < 5; i += 1) {
      store.recordRun(
        payload(
          { externalId: `run-${i}`, commitSha: `sha${i}`, startedAt: `2026-01-0${i + 1}T00:00:00.000Z` },
          i === 0 ? [test('chatty'), test('rare')] : [test('chatty')],
        ),
      );
    }

    const observations = store.recentObservations(store.findRepo(REPO)!, 3);
    const names = observations.map((o) => o.name);

    expect(names.filter((name) => name === 'chatty')).toHaveLength(3);
    expect(names.filter((name) => name === 'rare')).toHaveLength(1);
  });

  it('returns observations in chronological order', () => {
    store.recordRun(payload({ externalId: 'b', startedAt: '2026-02-01T00:00:00.000Z' }, [test('a')]));
    store.recordRun(payload({ externalId: 'a', startedAt: '2026-01-01T00:00:00.000Z' }, [test('a')]));

    const observations = store.recentObservations(store.findRepo(REPO)!, 50);
    expect(observations.map((o) => o.startedAt)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    ]);
  });

  it('scopes pull request queries to that pull request', () => {
    store.recordRun(payload({ externalId: 'pr-run', pullRequestNumber: 42, branch: 'feature' }, [test('a')]));
    store.recordRun(payload({ externalId: 'main-run' }, [test('b')]));

    const repoId = store.findRepo(REPO)!;

    expect(store.runsForPullRequest(repoId, 42)).toHaveLength(1);
    expect(store.observationsForPullRequest(repoId, 42).map((o) => o.name)).toEqual(['a']);
    expect(store.runsForPullRequest(repoId, 99)).toHaveLength(0);
  });

  it('carries the run id onto observations so re-runs can be traced', () => {
    store.recordRun(payload({ externalId: 'traced', pullRequestNumber: 7 }, [test('a')]));

    const [observation] = store.observationsForPullRequest(store.findRepo(REPO)!, 7);
    expect(observation?.runExternalId).toBe('traced');
    expect(observation?.runAttempt).toBe(1);
  });

  it('returns branch runs newest first, limited', () => {
    for (let i = 0; i < 5; i += 1) {
      store.recordRun(payload({ externalId: `r${i}`, startedAt: `2026-01-0${i + 1}T00:00:00.000Z` }));
    }

    const runs = store.runsForBranch(store.findRepo(REPO)!, 'main', 2);

    expect(runs).toHaveLength(2);
    expect(runs[0]?.startedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('stores a run with no test results, as webhooks do', () => {
    const outcome = store.recordRun(payload({}, []));

    expect(outcome.inserted).toBe(true);
    expect(store.recentObservations(store.findRepo(REPO)!, 50)).toHaveLength(0);
  });

  describe('quarantine', () => {
    it('adds, lists and removes entries', () => {
      const repoId = store.upsertRepo(REPO);

      store.quarantine(repoId, 'Suite', 'flaky', 'tracked in ENG-1');
      expect(store.listQuarantined(repoId)).toEqual([
        expect.objectContaining({ suite: 'Suite', name: 'flaky', reason: 'tracked in ENG-1' }),
      ]);

      expect(store.removeQuarantine(repoId, 'Suite', 'flaky')).toBe(true);
      expect(store.listQuarantined(repoId)).toEqual([]);
    });

    it('updates the reason instead of duplicating on re-quarantine', () => {
      const repoId = store.upsertRepo(REPO);

      store.quarantine(repoId, 'Suite', 'flaky', 'first');
      store.quarantine(repoId, 'Suite', 'flaky', 'second');

      const entries = store.listQuarantined(repoId);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.reason).toBe('second');
    });

    it('reports removal of an entry that was never there', () => {
      expect(store.removeQuarantine(store.upsertRepo(REPO), 'Suite', 'ghost')).toBe(false);
    });
  });
});
