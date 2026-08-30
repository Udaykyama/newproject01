import type { Config } from '../config.js';
import type { QuarantineEntry, RunRecord, Store } from '../db/store.js';
import type { FlakeAssessment, RepoRef } from '../types.js';
import { assessAll, flakyOnly } from './flaky.js';
import {
  compareToBaseline,
  flakeInducedWaste,
  summariseCosts,
  type BaselineComparison,
  type CostSummary,
  type FlakeWaste,
} from './cost.js';
import { testKey } from './identity.js';

/** How many recent base-branch runs form the cost baseline. */
const BASELINE_SAMPLE_SIZE = 20;

const MS_PER_DAY = 86_400_000;

/**
 * A flake assessment joined with whether an operator has already handled it.
 *
 * Detection cannot know about quarantines and should not: an automated verdict
 * must never silently overwrite a human decision. Joining the two here keeps
 * that separation while letting the report show a reviewer only what is new.
 */
export interface FlakeFinding extends FlakeAssessment {
  readonly quarantined: boolean;
}

export interface PullRequestReport {
  readonly repo: RepoRef;
  readonly pullRequestNumber: number;
  readonly baseBranch: string;
  readonly cost: CostSummary;
  readonly baseline: BaselineComparison;
  /** Flaky tests that actually ran in this PR — not the whole repo backlog. */
  readonly flakes: readonly FlakeFinding[];
  readonly waste: FlakeWaste;
  readonly quarantined: readonly QuarantineEntry[];
  readonly generatedAt: string;
}

export interface RepoReport {
  readonly repo: RepoRef;
  readonly assessments: readonly FlakeFinding[];
  readonly quarantined: readonly QuarantineEntry[];
  readonly generatedAt: string;
}

/**
 * The earliest run start still inside the detection window, or null for no
 * bound.
 *
 * Paired with the count-based window: a suite that runs twice a year would
 * otherwise keep a verdict alive on evidence from another era, and a flake list
 * describing a suite as it used to be is worse than no list at all.
 */
export function windowStart(windowDays: number, now: Date = new Date()): string | null {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  return new Date(now.getTime() - windowDays * MS_PER_DAY).toISOString();
}

function quarantineKeys(entries: readonly QuarantineEntry[]): Set<string> {
  return new Set(entries.map((entry) => testKey(entry.suite, entry.name)));
}

function markQuarantined(
  assessments: readonly FlakeAssessment[],
  quarantined: ReadonlySet<string>,
): FlakeFinding[] {
  return assessments.map((assessment) => ({
    ...assessment,
    quarantined: quarantined.has(testKey(assessment.suite, assessment.name)),
  }));
}

/**
 * Repo-wide flake assessment.
 *
 * Detection always runs against the repository's whole recent history, never
 * against a single PR: three observations from one branch cannot distinguish
 * non-determinism from a real regression.
 */
export function buildRepoReport(store: Store, repoId: number, repo: RepoRef, config: Config): RepoReport {
  const observations = store.recentObservations(
    repoId,
    config.flake.windowSize,
    windowStart(config.flake.windowDays),
  );
  const quarantined = store.listQuarantined(repoId);

  return {
    repo,
    assessments: markQuarantined(assessAll(observations, config.flake), quarantineKeys(quarantined)),
    quarantined,
    generatedAt: new Date().toISOString(),
  };
}

export function buildPullRequestReport(
  store: Store,
  repoId: number,
  repo: RepoRef,
  pullRequestNumber: number,
  baseBranch: string,
  config: Config,
): PullRequestReport {
  const prRuns: RunRecord[] = store.runsForPullRequest(repoId, pullRequestNumber);
  const prObservations = store.observationsForPullRequest(repoId, pullRequestNumber);
  // Retries are excluded from the baseline: a base branch that re-runs a lot
  // would otherwise inflate its own comparison and hide real regressions.
  const baselineRuns = store.runsForBranch(repoId, baseBranch, BASELINE_SAMPLE_SIZE, {
    excludeRetries: true,
  });

  const quarantined = store.listQuarantined(repoId);
  const quarantinedKeys = quarantineKeys(quarantined);

  const repoObservations = store.recentObservations(
    repoId,
    config.flake.windowSize,
    windowStart(config.flake.windowDays),
  );
  const repoFlakes = flakyOnly(assessAll(repoObservations, config.flake));

  // Waste is charged against quarantined tests too. A quarantine stops a test
  // failing the build; it does not stop it burning CI minutes, and that number
  // is the argument for finally deleting the test rather than skipping it
  // forever.
  const wasteKeys = new Set([...repoFlakes.map((flake) => testKey(flake.suite, flake.name)), ...quarantinedKeys]);

  // Narrow the repo-wide verdicts to tests this PR actually exercised, so the
  // comment stays about the change under review.
  const seenInPr = new Set(prObservations.map((o) => testKey(o.suite, o.name)));
  const flakes = repoFlakes.filter((flake) => seenInPr.has(testKey(flake.suite, flake.name)));

  return {
    repo,
    pullRequestNumber,
    baseBranch,
    cost: summariseCosts(prRuns, config.rates),
    baseline: compareToBaseline(prRuns, baselineRuns, config.rates),
    flakes: markQuarantined(flakes, quarantinedKeys),
    waste: flakeInducedWaste(prRuns, prObservations, wasteKeys, config.rates),
    quarantined,
    generatedAt: new Date().toISOString(),
  };
}
