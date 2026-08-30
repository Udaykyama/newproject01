import type { Config } from '../config.js';
import type { QuarantineEntry, RunRecord, Store } from '../db/store.js';
import type { FlakeAssessment, RepoRef } from '../types.js';
import { assessAll, flakyOnly } from './flaky.js';
import {
  compareToBaseline,
  flakeInducedWaste,
  summariseCosts,
  testKey,
  type BaselineComparison,
  type CostSummary,
  type FlakeWaste,
} from './cost.js';

/** How many recent base-branch runs form the cost baseline. */
const BASELINE_SAMPLE_SIZE = 20;

export interface PullRequestReport {
  readonly repo: RepoRef;
  readonly pullRequestNumber: number;
  readonly baseBranch: string;
  readonly cost: CostSummary;
  readonly baseline: BaselineComparison;
  /** Flaky tests that actually ran in this PR — not the whole repo backlog. */
  readonly flakes: readonly FlakeAssessment[];
  readonly waste: FlakeWaste;
  readonly quarantined: readonly QuarantineEntry[];
  readonly generatedAt: string;
}

export interface RepoReport {
  readonly repo: RepoRef;
  readonly assessments: readonly FlakeAssessment[];
  readonly quarantined: readonly QuarantineEntry[];
  readonly generatedAt: string;
}

/**
 * Repo-wide flake assessment.
 *
 * Detection always runs against the repository's whole recent history, never
 * against a single PR: three observations from one branch cannot distinguish
 * non-determinism from a real regression.
 */
export function buildRepoReport(store: Store, repoId: number, repo: RepoRef, config: Config): RepoReport {
  const observations = store.recentObservations(repoId, config.flake.windowSize);

  return {
    repo,
    assessments: assessAll(observations, config.flake),
    quarantined: store.listQuarantined(repoId),
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
  const baselineRuns = store.runsForBranch(repoId, baseBranch, BASELINE_SAMPLE_SIZE);

  const repoFlakes = flakyOnly(assessAll(store.recentObservations(repoId, config.flake.windowSize), config.flake));
  const flakyKeys = new Set(repoFlakes.map((flake) => testKey(flake.suite, flake.name)));

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
    flakes,
    waste: flakeInducedWaste(prRuns, prObservations, flakyKeys, config.rates),
    quarantined: store.listQuarantined(repoId),
    generatedAt: new Date().toISOString(),
  };
}
