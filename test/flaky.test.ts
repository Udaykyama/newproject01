import { describe, expect, it } from 'vitest';
import { assessAll, groupByTest, wilsonLowerBound } from '../src/analysis/flaky.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import type { Observation } from '../src/db/store.js';
import type { TestStatus } from '../src/types.js';

const TUNING = DEFAULT_CONFIG.flake;

let clock = 0;

/** Build an observation with a monotonically increasing timestamp. */
function observe(
  name: string,
  status: TestStatus,
  commitSha: string,
  overrides: Partial<Observation> = {},
): Observation {
  clock += 1;
  return {
    runExternalId: `run-${clock}`,
    suite: 'Suite',
    name,
    status,
    commitSha,
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString(),
    durationMs: 1000,
    runAttempt: 1,
    branch: 'main',
    pullRequestNumber: null,
    ...overrides,
  };
}

/** Turn a compact pass/fail string into a history over distinct commits. */
function history(name: string, pattern: string, sharedCommit = false): Observation[] {
  return [...pattern].map((char, index) =>
    observe(name, char === 'F' ? 'failed' : 'passed', sharedCommit ? 'sha-shared' : `sha-${index}`),
  );
}

describe('wilsonLowerBound', () => {
  it('is zero when nothing failed', () => {
    expect(wilsonLowerBound(0, 20)).toBe(0);
  });

  it('is zero for an empty sample', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('discounts small samples more heavily than large ones', () => {
    const small = wilsonLowerBound(1, 2);
    const large = wilsonLowerBound(50, 100);

    // Both observe a 50% failure rate, but only one of them is evidence.
    expect(small).toBeLessThan(large);
    expect(large).toBeGreaterThan(0.39);
  });

  it('never exceeds the observed rate', () => {
    expect(wilsonLowerBound(5, 10)).toBeLessThanOrEqual(0.5);
  });
});

describe('groupByTest', () => {
  it('orders each test chronologically regardless of input order', () => {
    const later = observe('a', 'passed', 'sha-2');
    const earlier = observe('a', 'failed', 'sha-1');

    const [group] = groupByTest([later, earlier]);

    expect(group?.observations.map((o) => o.startedAt)).toEqual(
      [earlier.startedAt, later.startedAt].sort(),
    );
  });

  it('keeps identically-named tests in different suites apart', () => {
    const groups = groupByTest([
      observe('same', 'passed', 'sha-1', { suite: 'A' }),
      observe('same', 'failed', 'sha-1', { suite: 'B' }),
    ]);

    expect(groups).toHaveLength(2);
  });
});

describe('flake detection', () => {
  it('confirms a flake when one commit both passed and failed', () => {
    const observations = [
      observe('checkout', 'passed', 'sha-1'),
      observe('checkout', 'failed', 'sha-1', { runAttempt: 2 }),
    ];

    const [assessment] = assessAll(observations, TUNING);

    expect(assessment?.verdict).toBe('flaky_confirmed');
    expect(assessment?.contradictoryCommits).toBe(1);
    // Confirmed flakes are floored at 0.6 so they always outrank guesses.
    expect(assessment?.score).toBeGreaterThanOrEqual(0.6);
  });

  it('suspects a flake when outcomes flip often across commits', () => {
    const [assessment] = assessAll(history('flappy', 'PFPFPFPF'), TUNING);

    expect(assessment?.verdict).toBe('flaky_suspected');
    expect(assessment?.flipRate).toBeCloseTo(1, 5);
    expect(assessment?.score).toBeLessThan(0.6);
  });

  it('calls an always-failing test broken, not flaky', () => {
    const [assessment] = assessAll(history('broken', 'FFFFFF'), TUNING);

    expect(assessment?.verdict).toBe('consistently_failing');
    expect(assessment?.score).toBe(0);
  });

  it('treats a clean history as stable', () => {
    const [assessment] = assessAll(history('solid', 'PPPPPP'), TUNING);

    expect(assessment?.verdict).toBe('stable');
    expect(assessment?.score).toBe(0);
  });

  it('does not label a genuine regression as flaky', () => {
    // Passed for a while, then broke and stayed broken: one transition only.
    const [assessment] = assessAll(history('regressed', 'PPPPPFFFFF'), TUNING);

    expect(assessment?.verdict).toBe('stable');
    expect(assessment?.flipRate).toBeLessThan(TUNING.flipRateThreshold);
  });

  it('withholds a statistical verdict until there is enough history', () => {
    const [assessment] = assessAll(history('new', 'PF'), TUNING);

    expect(assessment?.totalRuns).toBeLessThan(TUNING.minRuns);
    expect(assessment?.verdict).toBe('stable');
  });

  it('still confirms a flake from few runs when a commit contradicts itself', () => {
    // Proof beats sample size: the code did not change between these two.
    const [assessment] = assessAll(history('proven', 'PF', true), TUNING);
    expect(assessment?.verdict).toBe('flaky_confirmed');
  });

  it('ignores skipped runs when scoring', () => {
    const observations = [
      ...history('mixed', 'PFPFPF'),
      observe('mixed', 'skipped', 'sha-99'),
      observe('mixed', 'skipped', 'sha-98'),
    ];

    const [assessment] = assessAll(observations, TUNING);

    expect(assessment?.totalRuns).toBe(6);
  });

  it('ranks confirmed flakes above suspected ones', () => {
    const observations = [
      ...history('suspected', 'PFPFPFPF'),
      ...history('confirmed', 'PF', true),
    ];

    const ranked = assessAll(observations, TUNING);

    expect(ranked[0]?.name).toBe('confirmed');
    expect(ranked[1]?.name).toBe('suspected');
  });

  it('reports total wall-clock time so slow flakes can be prioritised', () => {
    const observations = history('slow', 'PFPF').map((o) => ({ ...o, durationMs: 5_000 }));
    const [assessment] = assessAll(observations, TUNING);

    expect(assessment?.totalDurationMs).toBe(20_000);
  });

  it('handles a single observation without dividing by zero', () => {
    const [assessment] = assessAll(history('once', 'F'), TUNING);

    expect(assessment?.flipRate).toBe(0);
    expect(assessment?.verdict).toBe('stable');
  });
});
