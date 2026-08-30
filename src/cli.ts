import { parseArgs } from 'node:util';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { Store } from './db/store.js';
import { parseJUnitXml } from './ingest/junit.js';
import { assessAll, flakyOnly } from './analysis/flaky.js';
import { buildPullRequestReport } from './analysis/report.js';
import { renderPullRequestComment } from './github/comment.js';
import { parseRepoSlug } from './api/validate.js';
import type { RunnerOs, TestResult } from './types.js';

/**
 * Local CLI.
 *
 * Lets a team try the product inside their own CI in minutes — no App install,
 * no hosted service, no data leaving their infrastructure. Removing that
 * adoption barrier is worth far more early on than any hosted feature.
 */

const USAGE = `ci-ledger — flaky test detection and CI cost attribution

Usage:
  ci-ledger ingest --repo <owner/name> --sha <commit> [options] <junit-path...>
  ci-ledger flaky  --repo <owner/name> [--all]
  ci-ledger report --repo <owner/name> --pr <number> [--base <branch>]

Ingest options:
  --repo      <owner/name>   Repository the run belongs to (required)
  --sha       <commit>       Commit sha under test (required)
  --run-id    <id>           CI run id; defaults to the commit sha
  --attempt   <n>            Run attempt number (default: 1)
  --workflow  <name>         Workflow name (default: "local")
  --branch    <name>         Branch name (default: "unknown")
  --pr        <number>       Pull request number, if any
  --runner    <os>           linux | windows | macos (default: linux)
  --duration  <ms>           Run duration in milliseconds (default: sum of tests)
  --started   <iso8601>      Run start time (default: now)
  --conclusion <text>        Run conclusion (default: derived from results)

Paths may be JUnit XML files or directories, which are scanned recursively.
`;

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

/** Collect XML files, expanding directories recursively. */
function collectXmlFiles(paths: readonly string[]): string[] {
  const files: string[] = [];

  const walk = (path: string): void => {
    const stats = statSync(path);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(path)) walk(join(path, entry));
      return;
    }
    if (path.toLowerCase().endsWith('.xml')) files.push(path);
  };

  for (const path of paths) walk(path);
  return files;
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatUsd(amount: number): string {
  return Math.abs(amount) < 0.01 && amount !== 0 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}

function runIngest(values: Record<string, string | boolean | undefined>, positionals: string[]): void {
  const repo = parseRepoSlug(values.repo);
  if (!repo) fail('--repo must be a valid "owner/name" slug');

  const sha = typeof values.sha === 'string' ? values.sha.trim() : '';
  if (!sha) fail('--sha is required');

  if (positionals.length === 0) fail('at least one JUnit XML path is required');

  const files = collectXmlFiles(positionals);
  if (files.length === 0) fail('no .xml files found in the given paths');

  const results: TestResult[] = [];
  for (const file of files) {
    try {
      results.push(...parseJUnitXml(readFileSync(file, 'utf8')));
    } catch (error) {
      fail(`could not parse ${file}: ${error instanceof Error ? error.message : 'invalid XML'}`);
    }
  }

  const config = loadConfig();
  const store = new Store(openDatabase(config.databasePath));

  const failed = results.some((result) => result.status === 'failed' || result.status === 'error');
  const totalDuration = results.reduce((sum, result) => sum + result.durationMs, 0);
  const prRaw = typeof values.pr === 'string' ? Number(values.pr) : Number.NaN;

  const outcome = store.recordRun({
    repo,
    run: {
      externalId: typeof values['run-id'] === 'string' ? values['run-id'] : sha,
      workflowName: typeof values.workflow === 'string' ? values.workflow : 'local',
      runAttempt: Math.max(1, Math.trunc(num(values.attempt as string | undefined, 1))),
      commitSha: sha.toLowerCase(),
      branch: typeof values.branch === 'string' ? values.branch : 'unknown',
      pullRequestNumber: Number.isInteger(prRaw) && prRaw > 0 ? prRaw : null,
      runnerOs: (typeof values.runner === 'string' ? values.runner : 'linux') as RunnerOs,
      durationMs: num(values.duration as string | undefined, totalDuration),
      conclusion:
        typeof values.conclusion === 'string' ? values.conclusion : failed ? 'failure' : 'success',
      startedAt:
        typeof values.started === 'string' && !Number.isNaN(Date.parse(values.started))
          ? new Date(values.started).toISOString()
          : new Date().toISOString(),
    },
    results,
  });

  if (!outcome.inserted) {
    console.log(`run already recorded (${files.length} file(s) skipped) — nothing to do`);
    return;
  }

  console.log(`recorded ${results.length} test result(s) from ${files.length} file(s) for ${repo.owner}/${repo.name}`);
}

function runFlaky(values: Record<string, string | boolean | undefined>): void {
  const repo = parseRepoSlug(values.repo);
  if (!repo) fail('--repo must be a valid "owner/name" slug');

  const config = loadConfig();
  const store = new Store(openDatabase(config.databasePath));

  const repoId = store.findRepo(repo);
  if (repoId === null) fail(`no data recorded for ${repo.owner}/${repo.name}`);

  const all = assessAll(store.recentObservations(repoId, config.flake.windowSize), config.flake);
  const shown = values.all === true ? all : flakyOnly(all);

  if (shown.length === 0) {
    console.log('no flaky tests detected 🎉');
    return;
  }

  for (const assessment of shown) {
    const score = (assessment.score * 100).toFixed(0).padStart(3);
    console.log(
      `${score}  ${assessment.verdict.padEnd(20)} ${assessment.suite} › ${assessment.name}\n` +
        `      ${assessment.failures}/${assessment.totalRuns} failed · flip rate ${(assessment.flipRate * 100).toFixed(0)}%` +
        ` · ${assessment.contradictoryCommits} contradictory commit(s)`,
    );
  }
}

function runReport(values: Record<string, string | boolean | undefined>): void {
  const repo = parseRepoSlug(values.repo);
  if (!repo) fail('--repo must be a valid "owner/name" slug');

  const pr = typeof values.pr === 'string' ? Number(values.pr) : Number.NaN;
  if (!Number.isInteger(pr) || pr <= 0) fail('--pr must be a positive integer');

  const config = loadConfig();
  const store = new Store(openDatabase(config.databasePath));

  const repoId = store.findRepo(repo);
  if (repoId === null) fail(`no data recorded for ${repo.owner}/${repo.name}`);

  const base = typeof values.base === 'string' ? values.base : 'main';
  const report = buildPullRequestReport(store, repoId, repo, pr, base, config);

  if (values.markdown === true) {
    console.log(renderPullRequestComment(report));
    return;
  }

  console.log(`PR #${pr} — ${formatUsd(report.cost.usd)} across ${report.cost.runCount} run(s)`);
  console.log(`  baseline ${formatUsd(report.baseline.baselineUsd)} · delta ${formatUsd(report.baseline.deltaUsd)}`);
  console.log(`  flaky tests touched: ${report.flakes.length}`);
  console.log(`  flake-induced waste: ${formatUsd(report.waste.usd)} over ${report.waste.runCount} re-run(s)`);
}

export function run(argv: readonly string[]): void {
  const [command, ...rest] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }

  const { values, positionals } = parseArgs({
    args: [...rest],
    allowPositionals: true,
    options: {
      repo: { type: 'string' },
      sha: { type: 'string' },
      'run-id': { type: 'string' },
      attempt: { type: 'string' },
      workflow: { type: 'string' },
      branch: { type: 'string' },
      pr: { type: 'string' },
      runner: { type: 'string' },
      duration: { type: 'string' },
      started: { type: 'string' },
      conclusion: { type: 'string' },
      base: { type: 'string' },
      all: { type: 'boolean' },
      markdown: { type: 'boolean' },
    },
  });

  switch (command) {
    case 'ingest':
      runIngest(values, positionals);
      return;
    case 'flaky':
      runFlaky(values);
      return;
    case 'report':
      runReport(values);
      return;
    default:
      console.error(`unknown command: ${command}\n`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

run(process.argv.slice(2));
