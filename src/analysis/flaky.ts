import { FAILING_STATUSES, type FlakeAssessment, type FlakeVerdict } from '../types.js';
import type { Observation } from '../db/store.js';
import type { FlakeTuning } from '../config.js';

/**
 * Flake detection.
 *
 * The commercial claim of this product is *noise reduction*: a list of every
 * test that ever failed is worthless, because most failures are real. So we
 * separate three populations that naive tooling conflates:
 *
 *  - genuinely non-deterministic tests (the thing worth quarantining),
 *  - tests that are simply broken and fail every time,
 *  - tests that failed because the code under test regressed.
 *
 * The strongest available evidence is a *contradiction*: the same test, at the
 * same commit, both passing and failing. The code did not change between those
 * two observations, so the test itself must be non-deterministic. That is a
 * proof, not a heuristic, and it is why re-run data is worth ingesting.
 *
 * Where no contradiction exists we fall back to statistics over the test's
 * recent history, and we mark the verdict as merely *suspected* so a human can
 * tell the difference.
 */

export interface TestHistory {
  readonly suite: string;
  readonly name: string;
  readonly observations: readonly Observation[];
}

const IDENTITY_SEPARATOR = '\u0000';

function identityKey(suite: string, name: string): string {
  return `${suite}${IDENTITY_SEPARATOR}${name}`;
}

/** Group raw observations by test identity, chronologically within each test. */
export function groupByTest(observations: readonly Observation[]): TestHistory[] {
  const groups = new Map<string, Observation[]>();

  for (const observation of observations) {
    const key = identityKey(observation.suite, observation.name);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(observation);
    } else {
      groups.set(key, [observation]);
    }
  }

  const histories: TestHistory[] = [];
  for (const bucket of groups.values()) {
    const sorted = [...bucket].sort((a, b) => {
      const byTime = a.startedAt.localeCompare(b.startedAt);
      return byTime !== 0 ? byTime : a.runAttempt - b.runAttempt;
    });
    const first = sorted[0];
    if (!first) continue;
    histories.push({ suite: first.suite, name: first.name, observations: sorted });
  }

  return histories;
}

/**
 * Wilson score interval lower bound.
 *
 * Preferred over the naive ratio because it is honest about small samples:
 * 1 failure in 2 runs should not be reported as a 50% failure rate with the
 * same authority as 50 failures in 100 runs.
 */
export function wilsonLowerBound(successes: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;

  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);

  return Math.max(0, (centre - margin) / denominator);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

interface Signals {
  readonly totalRuns: number;
  readonly failures: number;
  readonly distinctCommits: number;
  readonly contradictoryCommits: number;
  readonly flipRate: number;
  readonly totalDurationMs: number;
  readonly lastSeenAt: string;
}

function extractSignals(observations: readonly Observation[]): Signals {
  // Skipped tests tell us nothing about determinism and would dilute every
  // ratio, so they are excluded from the statistics (but still counted in the
  // wall-clock total, since they cost time to enumerate).
  const graded = observations.filter((o) => o.status !== 'skipped');

  const perCommit = new Map<string, { passed: boolean; failed: boolean }>();
  let failures = 0;
  let transitions = 0;
  let previousFailed: boolean | null = null;

  for (const observation of graded) {
    const failed = FAILING_STATUSES.has(observation.status);
    if (failed) failures += 1;

    if (previousFailed !== null && previousFailed !== failed) transitions += 1;
    previousFailed = failed;

    const entry = perCommit.get(observation.commitSha) ?? { passed: false, failed: false };
    if (failed) {
      entry.failed = true;
    } else {
      entry.passed = true;
    }
    perCommit.set(observation.commitSha, entry);
  }

  let contradictoryCommits = 0;
  for (const entry of perCommit.values()) {
    if (entry.passed && entry.failed) contradictoryCommits += 1;
  }

  const totalRuns = graded.length;
  const totalDurationMs = observations.reduce((sum, o) => sum + o.durationMs, 0);
  const lastSeenAt = observations.reduce(
    (latest, o) => (o.startedAt > latest ? o.startedAt : latest),
    observations[0]?.startedAt ?? '',
  );

  return {
    totalRuns,
    failures,
    distinctCommits: perCommit.size,
    contradictoryCommits,
    flipRate: totalRuns > 1 ? transitions / (totalRuns - 1) : 0,
    totalDurationMs,
    lastSeenAt,
  };
}

/**
 * Score how likely a test is non-deterministic, in [0, 1].
 *
 * Confirmed contradictions are floored at 0.6 and suspected flakes capped just
 * below it, so a confirmed flake always outranks any statistical guess and the
 * ranked list can be read top-down with confidence.
 */
function scoreFlakiness(signals: Signals, tuning: FlakeTuning): number {
  if (signals.totalRuns === 0) return 0;

  if (signals.contradictoryCommits > 0) {
    const ratio = signals.distinctCommits > 0 ? signals.contradictoryCommits / signals.distinctCommits : 1;
    return clamp01(0.6 + 0.4 * ratio);
  }

  const failureRate = signals.failures / signals.totalRuns;
  // Peaks at a 50/50 split and falls to zero for always-pass or always-fail.
  const balance = 1 - Math.abs(2 * failureRate - 1);
  // Small samples are discounted rather than trusted at face value.
  const sampleWeight = Math.min(1, signals.totalRuns / tuning.minRuns);
  const statistical = (0.5 * signals.flipRate + 0.5 * balance) * sampleWeight;

  return clamp01(Math.min(0.59, statistical));
}

function decideVerdict(signals: Signals, tuning: FlakeTuning): FlakeVerdict {
  if (signals.contradictoryCommits > 0) return 'flaky_confirmed';

  const mixed = signals.failures > 0 && signals.failures < signals.totalRuns;
  if (mixed && signals.totalRuns >= tuning.minRuns && signals.flipRate >= tuning.flipRateThreshold) {
    return 'flaky_suspected';
  }

  if (signals.totalRuns >= 2 && signals.failures === signals.totalRuns) {
    return 'consistently_failing';
  }

  return 'stable';
}

export function assessTest(history: TestHistory, tuning: FlakeTuning): FlakeAssessment {
  const signals = extractSignals(history.observations);

  return {
    suite: history.suite,
    name: history.name,
    verdict: decideVerdict(signals, tuning),
    score: scoreFlakiness(signals, tuning),
    totalRuns: signals.totalRuns,
    failures: signals.failures,
    contradictoryCommits: signals.contradictoryCommits,
    flipRate: signals.flipRate,
    failureRateLowerBound: wilsonLowerBound(signals.failures, signals.totalRuns),
    totalDurationMs: signals.totalDurationMs,
    lastSeenAt: signals.lastSeenAt,
  };
}

/** Assess every test present in the observation set, worst offenders first. */
export function assessAll(observations: readonly Observation[], tuning: FlakeTuning): FlakeAssessment[] {
  return groupByTest(observations)
    .map((history) => assessTest(history, tuning))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.failures !== a.failures) return b.failures - a.failures;
      const bySuite = a.suite.localeCompare(b.suite);
      return bySuite !== 0 ? bySuite : a.name.localeCompare(b.name);
    });
}

export function isFlaky(assessment: FlakeAssessment): boolean {
  return assessment.verdict === 'flaky_confirmed' || assessment.verdict === 'flaky_suspected';
}

/** Only the tests worth acting on — the output the PR comment is built from. */
export function flakyOnly(assessments: readonly FlakeAssessment[]): FlakeAssessment[] {
  return assessments.filter(isFlaky);
}
