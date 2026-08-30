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
      durationSource: 'reported',
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

  /**
   * The ingest endpoint and the workflow_run webhook write the *same* row: one
   * carries the test results, the other the duration GitHub actually billed.
   * Whichever arrives second used to be discarded, which pinned every run at
   * either zero duration or zero results depending on delivery order — and
   * therefore priced every pull request at the one-minute floor.
   */
  describe('merging the two producers of a run row', () => {
    it('takes the webhook duration when results were ingested first', () => {
      store.recordRun(payload({ durationMs: 0, durationSource: 'reported' }, [test('a')]));
      const second = store.recordRun(
        payload({ durationMs: 600_000, durationSource: 'jobs' }, []),
      );

      const repoId = store.findRepo(REPO)!;
      const [run] = store.runsForBranch(repoId, 'main', 10);

      expect(second.inserted).toBe(false);
      expect(second.resultsRecorded).toBe(0);
      expect(second.duplicateResults).toBe(false);
      expect(run?.durationMs).toBe(600_000);
      expect(run?.durationSource).toBe('jobs');
      expect(store.recentObservations(repoId, 50)).toHaveLength(1);
    });

    it('keeps the webhook duration when results are ingested second', () => {
      store.recordRun(payload({ durationMs: 600_000, durationSource: 'jobs' }, []));
      const second = store.recordRun(
        payload({ durationMs: 0, durationSource: 'reported' }, [test('a')]),
      );

      const repoId = store.findRepo(REPO)!;
      const [run] = store.runsForBranch(repoId, 'main', 10);

      expect(second.inserted).toBe(false);
      expect(second.resultsRecorded).toBe(1);
      expect(second.duplicateResults).toBe(false);
      expect(run?.durationMs).toBe(600_000);
      expect(run?.durationSource).toBe('jobs');
      expect(store.recentObservations(repoId, 50)).toHaveLength(1);
    });

    it('reports a true replay as a duplicate and stores nothing twice', () => {
      store.recordRun(payload({}, [test('a')]));
      const replay = store.recordRun(payload({}, [test('a')]));

      const repoId = store.findRepo(REPO)!;

      expect(replay.inserted).toBe(false);
      expect(replay.resultsRecorded).toBe(0);
      expect(replay.duplicateResults).toBe(true);
      expect(store.recentObservations(repoId, 50)).toHaveLength(1);
      expect(store.runsForBranch(repoId, 'main', 10)).toHaveLength(1);
    });

    it('never lets a zero duration overwrite a real measurement', () => {
      store.recordRun(payload({ durationMs: 600_000, durationSource: 'jobs' }, []));
      store.recordRun(payload({ durationMs: 0, durationSource: 'jobs' }, []));

      expect(store.runsForBranch(store.findRepo(REPO)!, 'main', 10)[0]?.durationMs).toBe(600_000);
    });

    it('keeps the earliest start so delivery order cannot reorder history', () => {
      store.recordRun(payload({ startedAt: '2026-01-01T00:10:00.000Z' }, []));
      store.recordRun(payload({ startedAt: '2026-01-01T00:00:00.000Z' }, []));

      expect(store.runsForBranch(store.findRepo(REPO)!, 'main', 10)[0]?.startedAt).toBe(
        '2026-01-01T00:00:00.000Z',
      );
    });

    it('does not let an inferred runner os clobber a job-derived one', () => {
      store.recordRun(payload({ runnerOs: 'macos', durationMs: 600_000, durationSource: 'jobs' }, []));
      store.recordRun(payload({ runnerOs: 'linux', durationMs: 300_000, durationSource: 'wallclock' }, []));

      expect(store.runsForBranch(store.findRepo(REPO)!, 'main', 10)[0]?.runnerOs).toBe('macos');
    });

    it('fills in facts the first producer did not know', () => {
      store.recordRun(payload({ workflowName: 'unknown workflow', pullRequestNumber: null }, []));
      store.recordRun(payload({ workflowName: 'ci', pullRequestNumber: 42 }, []));

      const [run] = store.runsForBranch(store.findRepo(REPO)!, 'main', 10);
      expect(run?.workflowName).toBe('ci');
      expect(run?.pullRequestNumber).toBe(42);
    });

    it('merges per-job billing rows without duplicating them', () => {
      const jobs = [
        { externalId: 'j1', name: 'build', runnerOs: 'linux' as const, durationMs: 120_000 },
        { externalId: 'j2', name: 'e2e', runnerOs: 'macos' as const, durationMs: 300_000 },
      ];

      store.recordRun({ ...payload({}, [test('a')]) });
      store.recordRun({ ...payload({ durationMs: 420_000, durationSource: 'jobs' }, []), jobs });
      store.recordRun({ ...payload({ durationMs: 420_000, durationSource: 'jobs' }, []), jobs });

      const [run] = store.runsForBranch(store.findRepo(REPO)!, 'main', 10);
      expect(run?.jobs).toHaveLength(2);
      expect(run?.jobs.map((job) => job.runnerOs).sort()).toEqual(['linux', 'macos']);
    });
  });

  it('excludes retries from the baseline sample when asked', () => {
    store.recordRun(payload({ runAttempt: 1 }, []));
    store.recordRun(payload({ runAttempt: 2 }, []));

    const repoId = store.findRepo(REPO)!;

    expect(store.runsForBranch(repoId, 'main', 10)).toHaveLength(2);
    expect(store.runsForBranch(repoId, 'main', 10, { excludeRetries: true })).toHaveLength(1);
  });

  it('bounds observations by time as well as by count', () => {
    store.recordRun(payload({ externalId: 'old', startedAt: '2020-01-01T00:00:00.000Z' }, [test('a')]));
    store.recordRun(payload({ externalId: 'new', startedAt: '2026-01-01T00:00:00.000Z' }, [test('a')]));

    const repoId = store.findRepo(REPO)!;

    expect(store.recentObservations(repoId, 50)).toHaveLength(2);
    expect(store.recentObservations(repoId, 50, '2025-01-01T00:00:00.000Z')).toHaveLength(1);
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

    it('records who quarantined a test and when it lapses', () => {
      const repoId = store.upsertRepo(REPO);

      store.quarantine(repoId, 'Suite', 'flaky', 'ENG-1', 'octocat', '2027-01-01T00:00:00.000Z');

      expect(store.listQuarantined(repoId)).toEqual([
        expect.objectContaining({ createdBy: 'octocat', expiresAt: '2027-01-01T00:00:00.000Z' }),
      ]);
    });

    it('stops listing an entry once it has expired', () => {
      const repoId = store.upsertRepo(REPO);

      store.quarantine(repoId, 'Suite', 'stale', null, 'octocat', '2026-01-01T00:00:00.000Z');

      expect(store.listQuarantined(repoId, '2025-12-31T00:00:00.000Z')).toHaveLength(1);
      expect(store.listQuarantined(repoId, '2026-01-02T00:00:00.000Z')).toHaveLength(0);
    });
  });
});
