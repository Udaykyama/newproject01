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

/**
 * Where a run's duration measurement came from.
 *
 * The same run is written by two independent producers — the CI job that
 * uploads its JUnit report, and the `workflow_run.completed` webhook — and they
 * do not measure equally well. Recording the provenance lets the store keep the
 * better measurement when they disagree, and lets the report say how much
 * confidence the resulting dollar figure deserves.
 */
export type DurationSource =
  /** Summed per-job billing data from the provider. Matches the invoice. */
  | 'jobs'
  /** The run's wall-clock span. Under-reports runs with parallel jobs. */
  | 'wallclock'
  /** Supplied by the uploading client, which cannot observe the whole run. */
  | 'reported';

/** Higher wins when two observations of the same run disagree. */
export const DURATION_SOURCE_RANK: Readonly<Record<DurationSource, number>> = {
  jobs: 3,
  wallclock: 2,
  reported: 1,
};

export const DURATION_SOURCES: readonly DurationSource[] = ['jobs', 'wallclock', 'reported'];

/**
 * Placeholders used when a producer genuinely does not know a value.
 *
 * Named so the merge can recognise them: a real value from either producer must
 * always beat the other's placeholder.
 */
export const UNKNOWN_WORKFLOW = 'unknown workflow';
export const UNKNOWN_BRANCH = 'unknown';
export const UNKNOWN_CONCLUSION = 'unknown';

export interface RepoRef {
  readonly owner: string;
  readonly name: string;
}

/**
 * The run-level facts that two observations of the same run may disagree about.
 *
 * Split out from {@link RunMetadata} because the identity fields (repo, run id,
 * attempt) are what make the two observations the same run, and so are never
 * merged — only these are.
 */
export interface RunFacts {
  readonly workflowName: string;
  readonly branch: string;
  readonly pullRequestNumber: number | null;
  readonly runnerOs: RunnerOs;
  /** Duration of the run in milliseconds. */
  readonly durationMs: number;
  readonly durationSource: DurationSource;
  /** Overall run conclusion as reported by the provider. */
  readonly conclusion: string;
  /** ISO-8601 timestamp of when the run started. */
  readonly startedAt: string;
}

/** One CI execution that produced test results. */
export interface RunMetadata extends RunFacts {
  /** Provider-side identifier (GitHub Actions `workflow_run.id`). */
  readonly externalId: string;
  /** Re-run counter; attempt > 1 is a strong signal of flake-driven waste. */
  readonly runAttempt: number;
  readonly commitSha: string;
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

/**
 * One job within a run.
 *
 * The job — not the run — is the unit GitHub bills, and a single run's jobs can
 * span operating systems whose rates differ by 10×. Storing them individually is
 * what lets the invoice be reproduced instead of approximated.
 */
export interface JobRecord {
  /** Provider-side job id, so re-delivery does not duplicate the job. */
  readonly externalId: string;
  readonly name: string;
  readonly runnerOs: RunnerOs;
  readonly durationMs: number;
}

/** A run plus every test case it reported. */
export interface RunIngestPayload {
  readonly repo: RepoRef;
  readonly run: RunMetadata;
  readonly results: readonly TestResult[];
  /** Per-job billing rows, when the producer has them. */
  readonly jobs?: readonly JobRecord[];
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
