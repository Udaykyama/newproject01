import { describe, expect, it } from 'vitest';
import {
  compareToBaseline,
  flakeInducedWaste,
  medianRunCostUsd,
  priceRun,
  summariseCosts,
} from '../src/analysis/cost.js';
import { testKey } from '../src/analysis/identity.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import type { Observation, RunRecord } from '../src/db/store.js';
import type { RunnerOs, TestStatus } from '../src/types.js';

const RATES = DEFAULT_CONFIG.rates;
const MINUTE = 60_000;

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    externalId: 'run-1',
    workflowName: 'ci',
    runAttempt: 1,
    runnerOs: 'linux' as RunnerOs,
    durationMs: 10 * MINUTE,
    durationSource: 'jobs',
    jobs: [],
    conclusion: 'success',
    commitSha: 'sha-1',
    branch: 'main',
    pullRequestNumber: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    runExternalId: 'run-1',
    suite: 'Suite',
    name: 'test',
    status: 'failed' as TestStatus,
    commitSha: 'sha-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 1000,
    runAttempt: 1,
    branch: 'main',
    pullRequestNumber: 7,
    ...overrides,
  };
}

describe('priceRun', () => {
  it('rounds partial minutes up, matching how GitHub bills', () => {
    const cost = priceRun(run({ durationMs: 61_000 }), RATES);

    expect(cost.billableMinutes).toBe(2);
    expect(cost.usd).toBeCloseTo(0.016, 6);
  });

  it('bills a minimum of one minute for a near-instant run', () => {
    expect(priceRun(run({ durationMs: 500 }), RATES).billableMinutes).toBe(1);
  });

  it('applies the per-OS rate', () => {
    const minutes = 10;
    expect(priceRun(run({ runnerOs: 'linux' }), RATES).usd).toBeCloseTo(minutes * RATES.linux, 6);
    expect(priceRun(run({ runnerOs: 'windows' }), RATES).usd).toBeCloseTo(minutes * RATES.windows, 6);
    expect(priceRun(run({ runnerOs: 'macos' }), RATES).usd).toBeCloseTo(minutes * RATES.macos, 6);
  });

  it('flags attempts beyond the first as retries', () => {
    expect(priceRun(run({ runAttempt: 1 }), RATES).isRetry).toBe(false);
    expect(priceRun(run({ runAttempt: 2 }), RATES).isRetry).toBe(true);
  });

  it('treats a negative duration as one billable minute rather than a credit', () => {
    expect(priceRun(run({ durationMs: -5000 }), RATES).usd).toBeGreaterThan(0);
  });

  it('prices each job at its own OS rate instead of collapsing to one', () => {
    // Collapsing this run to macOS would price it at 20 × the macOS rate;
    // collapsing to Linux would be 10× too cheap. Neither matches the invoice.
    const cost = priceRun(
      run({
        runnerOs: 'macos',
        durationMs: 20 * MINUTE,
        jobs: [
          { externalId: 'j1', name: 'build', runnerOs: 'linux', durationMs: 10 * MINUTE },
          { externalId: 'j2', name: 'e2e', runnerOs: 'macos', durationMs: 10 * MINUTE },
        ],
      }),
      RATES,
    );

    expect(cost.pricedPerJob).toBe(true);
    expect(cost.billableMinutes).toBe(20);
    expect(cost.usd).toBeCloseTo(10 * RATES.linux + 10 * RATES.macos, 6);
  });

  it('rounds each job up separately, as the provider does', () => {
    const cost = priceRun(
      run({
        durationMs: 60_000,
        jobs: [
          { externalId: 'j1', name: 'a', runnerOs: 'linux', durationMs: 30_000 },
          { externalId: 'j2', name: 'b', runnerOs: 'linux', durationMs: 30_000 },
        ],
      }),
      RATES,
    );

    expect(cost.billableMinutes).toBe(2);
  });

  it('falls back to the run total when no job rows were captured', () => {
    expect(priceRun(run({ jobs: [] }), RATES).pricedPerJob).toBe(false);
  });
});

describe('summariseCosts', () => {
  const summary = summariseCosts(
    [
      run({ externalId: 'a', workflowName: 'ci', durationMs: 10 * MINUTE }),
      run({ externalId: 'a', workflowName: 'ci', durationMs: 10 * MINUTE, runAttempt: 2 }),
      run({ externalId: 'b', workflowName: 'lint', durationMs: 2 * MINUTE }),
    ],
    RATES,
  );

  it('totals runs, minutes and dollars', () => {
    expect(summary.runCount).toBe(3);
    expect(summary.billableMinutes).toBe(22);
    expect(summary.usd).toBeCloseTo(22 * RATES.linux, 6);
  });

  it('separates re-run spend as an upper bound on waste', () => {
    expect(summary.retryCount).toBe(1);
    expect(summary.retryUsd).toBeCloseTo(10 * RATES.linux, 6);
  });

  it('breaks cost down by workflow, most expensive first', () => {
    expect(summary.byWorkflow.map((entry) => entry.workflowName)).toEqual(['ci', 'lint']);
    expect(summary.byWorkflow[0]?.runCount).toBe(2);
  });

  it('returns zeroes for an empty run list', () => {
    expect(summariseCosts([], RATES)).toMatchObject({ runCount: 0, usd: 0, billableMinutes: 0 });
  });

  describe('confidence', () => {
    const withJobs = run({
      durationSource: 'jobs',
      jobs: [{ externalId: 'j1', name: 'build', runnerOs: 'linux', durationMs: MINUTE }],
    });

    it('is exact only when every run was priced from job rows', () => {
      expect(summariseCosts([withJobs], RATES).confidence.exact).toBe(true);
      expect(summariseCosts([withJobs, run()], RATES).confidence.exact).toBe(false);
    });

    it('reports the weakest provenance in the sample', () => {
      const mixed = summariseCosts([withJobs, run({ durationSource: 'wallclock' })], RATES);
      expect(mixed.confidence.weakestSource).toBe('wallclock');
      expect(mixed.confidence.wallClockRuns).toBe(1);

      const weakest = summariseCosts(
        [withJobs, run({ durationSource: 'wallclock' }), run({ durationSource: 'reported' })],
        RATES,
      );
      expect(weakest.confidence.weakestSource).toBe('reported');
      expect(weakest.confidence.reportedRuns).toBe(1);
    });

    it('is not exact with no runs at all — there is nothing to be confident about', () => {
      expect(summariseCosts([], RATES).confidence.exact).toBe(false);
    });
  });
});

describe('medianRunCostUsd', () => {
  it('resists a single pathological outlier', () => {
    const runs = [
      run({ durationMs: 5 * MINUTE }),
      run({ durationMs: 5 * MINUTE }),
      run({ durationMs: 600 * MINUTE }),
    ];

    // The mean would be ~203 minutes; the median stays at the typical build.
    expect(medianRunCostUsd(runs, RATES)).toBeCloseTo(5 * RATES.linux, 6);
  });

  it('averages the middle pair for an even sample', () => {
    const runs = [run({ durationMs: 2 * MINUTE }), run({ durationMs: 4 * MINUTE })];
    expect(medianRunCostUsd(runs, RATES)).toBeCloseTo(3 * RATES.linux, 6);
  });

  it('is zero with no history', () => {
    expect(medianRunCostUsd([], RATES)).toBe(0);
  });
});

describe('compareToBaseline', () => {
  it('scales the baseline by the number of PR runs so re-runs are not mistaken for bloat', () => {
    const prRuns = [run({ durationMs: 5 * MINUTE }), run({ durationMs: 5 * MINUTE, runAttempt: 2 })];
    const baselineRuns = [run({ durationMs: 5 * MINUTE }), run({ durationMs: 5 * MINUTE })];

    const comparison = compareToBaseline(prRuns, baselineRuns, RATES);

    expect(comparison.deltaUsd).toBeCloseTo(0, 6);
    expect(comparison.deltaPct).toBeCloseTo(0, 6);
  });

  it('reports a positive delta when the PR made CI more expensive', () => {
    const comparison = compareToBaseline(
      [run({ durationMs: 20 * MINUTE })],
      [run({ durationMs: 10 * MINUTE })],
      RATES,
    );

    expect(comparison.deltaUsd).toBeGreaterThan(0);
    expect(comparison.deltaPct).toBeCloseTo(100, 3);
  });

  it('reports a null percentage when there is no baseline yet', () => {
    expect(compareToBaseline([run()], [], RATES).deltaPct).toBeNull();
  });

  it('compares each workflow to its own history, not to the repo average', () => {
    // A nightly job that costs 100× a PR build must not inflate the baseline
    // for a PR that never triggers it.
    const prRuns = [run({ workflowName: 'ci', durationMs: 10 * MINUTE })];
    const baselineRuns = [
      run({ workflowName: 'ci', durationMs: 10 * MINUTE }),
      run({ workflowName: 'nightly', durationMs: 600 * MINUTE }),
    ];

    expect(compareToBaseline(prRuns, baselineRuns, RATES).deltaUsd).toBeCloseTo(0, 6);
  });

  it('sums the per-workflow baselines when a PR triggers several', () => {
    const prRuns = [
      run({ workflowName: 'ci', durationMs: 10 * MINUTE }),
      run({ workflowName: 'lint', durationMs: 2 * MINUTE }),
    ];
    const baselineRuns = [
      run({ workflowName: 'ci', durationMs: 10 * MINUTE }),
      run({ workflowName: 'lint', durationMs: 2 * MINUTE }),
    ];

    expect(compareToBaseline(prRuns, baselineRuns, RATES).deltaUsd).toBeCloseTo(0, 6);
  });

  it('contributes nothing for a workflow the base branch has never run', () => {
    const comparison = compareToBaseline(
      [run({ workflowName: 'brand-new', durationMs: 10 * MINUTE })],
      [run({ workflowName: 'ci', durationMs: 10 * MINUTE })],
      RATES,
    );

    expect(comparison.baselineUsd).toBe(0);
    expect(comparison.deltaPct).toBeNull();
  });
});

describe('flakeInducedWaste', () => {
  const flakyKey = testKey('Suite', 'flaky-test');
  const realKey = testKey('Suite', 'real-failure');

  const firstAttempt = run({ externalId: 'run-1', runAttempt: 1, durationMs: 10 * MINUTE });
  const secondAttempt = run({ externalId: 'run-1', runAttempt: 2, durationMs: 10 * MINUTE });

  it('charges a re-run to flakiness when the previous attempt failed only on flaky tests', () => {
    const waste = flakeInducedWaste(
      [firstAttempt, secondAttempt],
      [observation({ name: 'flaky-test', runAttempt: 1 })],
      new Set([flakyKey]),
      RATES,
    );

    expect(waste.runCount).toBe(1);
    expect(waste.billableMinutes).toBe(10);
    expect(waste.usd).toBeCloseTo(10 * RATES.linux, 6);
  });

  it('claims nothing when a genuine failure also required the re-run', () => {
    const waste = flakeInducedWaste(
      [firstAttempt, secondAttempt],
      [
        observation({ name: 'flaky-test', runAttempt: 1 }),
        observation({ name: 'real-failure', runAttempt: 1 }),
      ],
      new Set([flakyKey]),
      RATES,
    );

    expect(waste.runCount).toBe(0);
    expect(waste.usd).toBe(0);
  });

  it('ignores first attempts, which are never wasted work', () => {
    const waste = flakeInducedWaste(
      [firstAttempt],
      [observation({ name: 'flaky-test', runAttempt: 1 })],
      new Set([flakyKey]),
      RATES,
    );

    expect(waste.runCount).toBe(0);
  });

  it('makes no claim when the preceding attempt was never ingested', () => {
    const waste = flakeInducedWaste(
      [secondAttempt],
      [observation({ name: 'flaky-test', runAttempt: 1 })],
      new Set([flakyKey]),
      RATES,
    );

    expect(waste.runCount).toBe(0);
  });

  it('ignores re-runs of an attempt that had no failures at all', () => {
    const waste = flakeInducedWaste(
      [firstAttempt, secondAttempt],
      [observation({ name: 'flaky-test', runAttempt: 1, status: 'passed' })],
      new Set([flakyKey]),
      RATES,
    );

    expect(waste.runCount).toBe(0);
  });

  it('does not attribute failures from a different run to this one', () => {
    const waste = flakeInducedWaste(
      [firstAttempt, secondAttempt],
      [observation({ name: 'flaky-test', runExternalId: 'other-run', runAttempt: 1 })],
      new Set([flakyKey, realKey]),
      RATES,
    );

    expect(waste.runCount).toBe(0);
  });
});
