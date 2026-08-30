/**
 * Domain types shared across ingestion, analysis and reporting.
 *
 * These deliberately mirror what CI systems actually emit (JUnit XML plus
 * workflow metadata) rather than any single provider's API shape, so a second
 * provider can be added without reworking the core.
 */

/** Outcome of a single test execution. */
export type TestStatus = 'passed' | 'failed' | 'error' | 'skipped';

/** Statuses that count as a negative signal when scoring flakiness. */
export const FAILING_STATUSES: ReadonlySet<TestStatus> = new Set<TestStatus>(['failed', 'error']);

/** Runner families we know how to price. */
export type RunnerOs = 'linux' | 'windows' | 'macos';

export interface RepoRef {
  readonly owner: string;
  readonly name: string;
}

/** One CI execution that produced test results. */
export interface RunMetadata {
  /** Provider-side identifier (GitHub Actions `workflow_run.id`). */
  readonly externalId: string;
  readonly workflowName: string;
  /** Re-run counter; attempt > 1 is a strong signal of flake-driven waste. */
  readonly runAttempt: number;
  readonly commitSha: string;
  readonly branch: string;
  readonly pullRequestNumber: number | null;
  readonly runnerOs: RunnerOs;
  /** Wall-clock duration of the run in milliseconds. */
  readonly durationMs: number;
  /** Overall run conclusion as reported by the provider. */
  readonly conclusion: string;
  /** ISO-8601 timestamp of when the run started. */
  readonly startedAt: string;
}

/** A single test case observation belonging to a run. */
export interface TestResult {
  /** Test suite / file name. */
  readonly suite: string;
  /** Fully-qualified test name, stable across runs. */
  readonly name: string;
  readonly status: TestStatus;
  readonly durationMs: number;
  readonly failureMessage: string | null;
}

/** A run plus every test case it reported. */
export interface RunIngestPayload {
  readonly repo: RepoRef;
  readonly run: RunMetadata;
  readonly results: readonly TestResult[];
}

/** How confident we are that a test is genuinely non-deterministic. */
export type FlakeVerdict =
  /** Same commit, contradictory outcomes — non-determinism is proven. */
  | 'flaky_confirmed'
  /** Outcome flips too often across history to be a real regression. */
  | 'flaky_suspected'
  /** Failing every time it runs: broken, not flaky. */
  | 'consistently_failing'
  | 'stable';

export interface FlakeAssessment {
  readonly suite: string;
  readonly name: string;
  readonly verdict: FlakeVerdict;
  /** 0-1. Higher means more likely non-deterministic. */
  readonly score: number;
  readonly totalRuns: number;
  readonly failures: number;
  /** Distinct commits where the test both passed and failed. */
  readonly contradictoryCommits: number;
  /** Share of consecutive observations whose outcome changed (0-1). */
  readonly flipRate: number;
  /** Wilson lower bound on the failure rate — a pessimistic impact estimate. */
  readonly failureRateLowerBound: number;
  /** Cumulative wall-clock time spent on this test in the window. */
  readonly totalDurationMs: number;
  readonly lastSeenAt: string;
}
