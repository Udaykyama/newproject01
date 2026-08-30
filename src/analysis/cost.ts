import type { CostRates } from '../config.js';
import type { Observation, RunRecord } from '../db/store.js';
import { FAILING_STATUSES, type DurationSource, type RunnerOs } from '../types.js';
import { testKey } from './identity.js';

/**
 * CI cost attribution.
 *
 * Two numbers make this product worth paying for:
 *
 *  1. What did this pull request cost in CI? Teams have no per-PR visibility,
 *     so nobody notices the change that quietly doubled the build.
 *  2. How much of that spend was wasted re-running flaky tests? That figure
 *     turns the flake list from an engineering annoyance into a budget line,
 *     which is the argument that gets the tool bought.
 *
 * The waste figure is computed conservatively on purpose — see
 * {@link flakeInducedWaste}. An ROI claim that survives scrutiny is worth more
 * than a bigger one that does not.
 */

const MS_PER_MINUTE = 60_000;

export interface RunCost {
  readonly externalId: string;
  readonly workflowName: string;
  readonly runAttempt: number;
  readonly runnerOs: RunnerOs;
  readonly billableMinutes: number;
  readonly usd: number;
  /** Attempt > 1: this run is a re-execution of work already paid for. */
  readonly isRetry: boolean;
  /** How the underlying duration was measured. */
  readonly durationSource: DurationSource;
  /** True when the price came from per-job rows rather than a run total. */
  readonly pricedPerJob: boolean;
}

export interface WorkflowCost {
  readonly workflowName: string;
  readonly runCount: number;
  readonly billableMinutes: number;
  readonly usd: number;
}

export interface CostSummary {
  readonly runCount: number;
  readonly billableMinutes: number;
  readonly usd: number;
  readonly retryCount: number;
  /** Upper bound on waste: everything spent on re-runs, whatever the cause. */
  readonly retryUsd: number;
  readonly byWorkflow: readonly WorkflowCost[];
  readonly confidence: CostConfidence;
}

/**
 * How much the dollar figure can be trusted.
 *
 * An estimate labelled as an estimate survives a procurement conversation; one
 * that is not labelled does not survive the first time someone checks it
 * against their invoice.
 */
export interface CostConfidence {
  /** The weakest provenance among the priced runs. */
  readonly weakestSource: DurationSource;
  /** Runs priced from per-job rows — these reproduce the invoice. */
  readonly pricedPerJob: number;
  /** Runs priced from wall-clock time, which under-reports parallel jobs. */
  readonly wallClockRuns: number;
  /** Runs priced from a duration the uploading client asserted. */
  readonly reportedRuns: number;
  /** True when every run was priced from per-job billing data. */
  readonly exact: boolean;
}

export interface BaselineComparison {
  readonly currentUsd: number;
  readonly baselineUsd: number;
  readonly deltaUsd: number;
  /** Null when there is no baseline to compare against yet. */
  readonly deltaPct: number | null;
}

export interface FlakeWaste {
  /** Cost of re-runs attributable solely to flaky tests. */
  readonly usd: number;
  readonly billableMinutes: number;
  /** Number of re-run attempts judged flake-induced. */
  readonly runCount: number;
}

function rateFor(os: RunnerOs, rates: CostRates): number {
  switch (os) {
    case 'windows':
      return rates.windows;
    case 'macos':
      return rates.macos;
    case 'linux':
      return rates.linux;
  }
}

/** GitHub bills whole minutes, rounded up, and it rounds up per job. */
function billableMinutesFor(durationMs: number): number {
  return Math.max(1, Math.ceil(Math.max(0, durationMs) / MS_PER_MINUTE));
}

/**
 * Price a single run.
 *
 * When per-job rows are available each job is priced at its own OS rate and
 * rounded up independently, which is exactly how the invoice is computed: a run
 * with one 30-second macOS job and one 30-second Linux job costs a full minute
 * of each, not two minutes of whichever ran longer. Rates differ by 10× across
 * runner families, so collapsing them is the single largest error available to
 * make here.
 *
 * Without job rows the run total is used, which under-reports runs with many
 * parallel jobs. {@link CostSummary.confidence} reports when that happened.
 */
export function priceRun(run: RunRecord, rates: CostRates): RunCost {
  const pricedPerJob = run.jobs.length > 0;

  let billableMinutes = 0;
  let usd = 0;

  if (pricedPerJob) {
    for (const job of run.jobs) {
      const minutes = billableMinutesFor(job.durationMs);
      billableMinutes += minutes;
      usd += minutes * rateFor(job.runnerOs, rates);
    }
  } else {
    billableMinutes = billableMinutesFor(run.durationMs);
    usd = billableMinutes * rateFor(run.runnerOs, rates);
  }

  return {
    externalId: run.externalId,
    workflowName: run.workflowName,
    runAttempt: run.runAttempt,
    runnerOs: run.runnerOs,
    billableMinutes,
    usd,
    isRetry: run.runAttempt > 1,
    durationSource: run.durationSource,
    pricedPerJob,
  };
}

/** Weakest provenance wins: a summary is only as good as its worst input. */
function summariseConfidence(costs: readonly RunCost[]): CostConfidence {
  let wallClockRuns = 0;
  let reportedRuns = 0;
  let pricedPerJob = 0;

  for (const cost of costs) {
    if (cost.pricedPerJob) pricedPerJob += 1;
    if (cost.durationSource === 'wallclock') wallClockRuns += 1;
    if (cost.durationSource === 'reported') reportedRuns += 1;
  }

  const weakestSource: DurationSource = reportedRuns > 0 ? 'reported' : wallClockRuns > 0 ? 'wallclock' : 'jobs';

  return {
    weakestSource,
    pricedPerJob,
    wallClockRuns,
    reportedRuns,
    exact: costs.length > 0 && pricedPerJob === costs.length,
  };
}

export function summariseCosts(runs: readonly RunRecord[], rates: CostRates): CostSummary {
  const costs = runs.map((run) => priceRun(run, rates));
  const byWorkflow = new Map<string, { runCount: number; billableMinutes: number; usd: number }>();

  let billableMinutes = 0;
  let usd = 0;
  let retryCount = 0;
  let retryUsd = 0;

  for (const cost of costs) {
    billableMinutes += cost.billableMinutes;
    usd += cost.usd;
    if (cost.isRetry) {
      retryCount += 1;
      retryUsd += cost.usd;
    }

    const entry = byWorkflow.get(cost.workflowName) ?? { runCount: 0, billableMinutes: 0, usd: 0 };
    entry.runCount += 1;
    entry.billableMinutes += cost.billableMinutes;
    entry.usd += cost.usd;
    byWorkflow.set(cost.workflowName, entry);
  }

  return {
    runCount: costs.length,
    billableMinutes,
    usd,
    retryCount,
    retryUsd,
    byWorkflow: [...byWorkflow.entries()]
      .map(([workflowName, entry]) => ({ workflowName, ...entry }))
      .sort((a, b) => b.usd - a.usd),
    confidence: summariseConfidence(costs),
  };
}

/**
 * Median cost of a single run.
 *
 * Median rather than mean because CI durations are heavily right-skewed: one
 * timed-out six-hour run would drag an average far above what a typical build
 * actually costs.
 */
export function medianRunCostUsd(runs: readonly RunRecord[], rates: CostRates): number {
  if (runs.length === 0) return 0;

  const sorted = runs.map((run) => priceRun(run, rates).usd).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function groupByWorkflow(runs: readonly RunRecord[]): Map<string, RunRecord[]> {
  const groups = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const bucket = groups.get(run.workflowName);
    if (bucket) {
      bucket.push(run);
    } else {
      groups.set(run.workflowName, [run]);
    }
  }
  return groups;
}

/**
 * Compare this PR's spend against the typical cost of the same work on the base
 * branch.
 *
 * The comparison is made per workflow and then summed. A repo-wide median would
 * let an unrelated heavy job — a nightly build, a release pipeline — set the
 * bar for every pull request, so a PR that only ran the fast lint workflow
 * would look like a saving and a PR that doubled the test suite could hide
 * inside the noise.
 *
 * Workflows the PR ran that have no base-branch history contribute nothing to
 * the baseline: inventing a number for them would manufacture a delta out of
 * missing data. Callers can see this in {@link CostSummary.confidence}.
 */
export function compareToBaseline(
  prRuns: readonly RunRecord[],
  baselineRuns: readonly RunRecord[],
  rates: CostRates,
): BaselineComparison {
  const currentUsd = summariseCosts(prRuns, rates).usd;
  const baselineByWorkflow = groupByWorkflow(baselineRuns);

  // Scaled to the number of runs this PR triggered *of that workflow*, so a PR
  // that ran CI five times is not judged against a single baseline build.
  let baselineUsd = 0;
  for (const [workflowName, runs] of groupByWorkflow(prRuns)) {
    const history = baselineByWorkflow.get(workflowName);
    if (!history || history.length === 0) continue;
    baselineUsd += medianRunCostUsd(history, rates) * runs.length;
  }

  const deltaUsd = currentUsd - baselineUsd;

  return {
    currentUsd,
    baselineUsd,
    deltaUsd,
    deltaPct: baselineUsd > 0 ? (deltaUsd / baselineUsd) * 100 : null,
  };
}

/**
 * Cost of re-runs that only happened because a flaky test failed.
 *
 * A re-run attempt is counted as waste only when the attempt before it failed
 * *exclusively* on tests known to be flaky. If any genuine failure was present,
 * the re-run would have been necessary anyway, so charging it to flakiness
 * would overstate the savings.
 */
export function flakeInducedWaste(
  runs: readonly RunRecord[],
  observations: readonly Observation[],
  flakyTests: ReadonlySet<string>,
  rates: CostRates,
): FlakeWaste {
  const attemptKey = (externalId: string, attempt: number): string => `${externalId}#${attempt}`;

  // Which tests failed in each individual attempt.
  const failuresByAttempt = new Map<string, Set<string>>();
  for (const observation of observations) {
    if (!FAILING_STATUSES.has(observation.status)) continue;
    const key = attemptKey(observation.runExternalId, observation.runAttempt);
    const bucket = failuresByAttempt.get(key) ?? new Set<string>();
    bucket.add(testKey(observation.suite, observation.name));
    failuresByAttempt.set(key, bucket);
  }

  // Attempts recorded for each run, so we can find the one preceding a retry.
  const attemptsByRun = new Map<string, number[]>();
  for (const run of runs) {
    const bucket = attemptsByRun.get(run.externalId) ?? [];
    bucket.push(run.runAttempt);
    attemptsByRun.set(run.externalId, bucket);
  }
  for (const bucket of attemptsByRun.values()) bucket.sort((a, b) => a - b);

  let usd = 0;
  let billableMinutes = 0;
  let runCount = 0;

  for (const run of runs) {
    if (run.runAttempt <= 1) continue;

    const attempts = attemptsByRun.get(run.externalId) ?? [];
    const previousAttempt = attempts.filter((attempt) => attempt < run.runAttempt).pop();
    // Without the preceding attempt we cannot know why the re-run happened,
    // so we make no claim about it.
    if (previousAttempt === undefined) continue;

    const previousFailures = failuresByAttempt.get(attemptKey(run.externalId, previousAttempt));
    if (!previousFailures || previousFailures.size === 0) continue;

    const allFlaky = [...previousFailures].every((key) => flakyTests.has(key));
    if (!allFlaky) continue;

    const cost = priceRun(run, rates);
    usd += cost.usd;
    billableMinutes += cost.billableMinutes;
    runCount += 1;
  }

  return { usd, billableMinutes, runCount };
}
