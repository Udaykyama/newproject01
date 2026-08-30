import { parseArgs } from 'node:util';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { Store, type ApiTokenScope } from './db/store.js';
import { parseJUnitXml } from './ingest/junit.js';
import { assessAll, flakyOnly } from './analysis/flaky.js';
import { buildPullRequestReport, windowStart } from './analysis/report.js';
import { renderPullRequestComment } from './github/comment.js';
import { isValidRepoName, parseRepoSlug } from './api/validate.js';
import { generateApiToken, tokenDigest } from './api/auth.js';
import { measurePrecision, parseLabels } from './analysis/precision.js';
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
  ci-ledger precision --repo <owner/name> --labels <labels.json>
  ci-ledger token mint --scope <owner[/name]> [--label <text>]
  ci-ledger token list
  ci-ledger token revoke --id <n>

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

Precision options:
  --labels <path>   JSON: { "flaky": [{"suite","name"}], "stable": [...] }

Token options:
  --scope <owner[/name]>  Repositories the read token may see; an owner alone
                          grants every repository under it
  --label <text>          Note recorded beside the token
  --id    <n>             Token id to revoke

Read tokens are only enforced when REQUIRE_READ_AUTH=true.
`;

/**
 * A problem the user can fix — a bad flag, a missing file, an unknown repo.
 *
 * Distinguished from a genuine defect so the entrypoint can print one line
 * instead of a stack trace. A CLI that dumps a stack at someone for forgetting
 * `--repo` teaches them the tool is broken.
 */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

function fail(message: string): never {
  throw new CliError(message);
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
      // Locally we only ever know what the report claimed, never what the
      // provider billed.
      durationSource: 'reported',
      conclusion:
        typeof values.conclusion === 'string' ? values.conclusion : failed ? 'failure' : 'success',
      startedAt:
        typeof values.started === 'string' && !Number.isNaN(Date.parse(values.started))
          ? new Date(values.started).toISOString()
          : new Date().toISOString(),
    },
    results,
  });

  if (outcome.resultsRecorded === 0) {
    console.log(`run already recorded (${files.length} file(s) skipped) — nothing to do`);
    return;
  }

  console.log(
    `recorded ${outcome.resultsRecorded} test result(s) from ${files.length} file(s) for ${repo.owner}/${repo.name}`,
  );
}

function runFlaky(values: Record<string, string | boolean | undefined>): void {
  const repo = parseRepoSlug(values.repo);
  if (!repo) fail('--repo must be a valid "owner/name" slug');

  const config = loadConfig();
  const store = new Store(openDatabase(config.databasePath));

  const repoId = store.findRepo(repo);
  if (repoId === null) fail(`no data recorded for ${repo.owner}/${repo.name}`);

  const observations = store.recentObservations(
    repoId,
    config.flake.windowSize,
    windowStart(config.flake.windowDays),
  );
  const all = assessAll(observations, config.flake);
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

/**
 * Report how well the detector did against tests whose nature is known.
 *
 * Milestone 1 of the roadmap is a precision number, not a claim: this is the
 * command that produces it, from the flake canary's labels.
 */
function runPrecision(values: Record<string, string | boolean | undefined>): void {
  const repo = parseRepoSlug(values.repo);
  if (!repo) fail('--repo must be a valid "owner/name" slug');

  const labelsPath = typeof values.labels === 'string' ? values.labels.trim() : '';
  if (!labelsPath) fail('--labels is required');

  let labels;
  try {
    labels = parseLabels(JSON.parse(readFileSync(labelsPath, 'utf8')) as unknown);
  } catch (error) {
    fail(`could not read labels from ${labelsPath}: ${error instanceof Error ? error.message : 'invalid JSON'}`);
  }

  const config = loadConfig();
  const store = new Store(openDatabase(config.databasePath));

  const repoId = store.findRepo(repo);
  if (repoId === null) fail(`no data recorded for ${repo.owner}/${repo.name}`);

  const assessments = assessAll(
    store.recentObservations(repoId, config.flake.windowSize, windowStart(config.flake.windowDays)),
    config.flake,
  );
  const report = measurePrecision(assessments, labels);

  const percent = (value: number | null): string => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);

  console.log(`precision ${percent(report.precision)} · recall ${percent(report.recall)} over ${report.labelledCount} labelled test(s)`);
  console.log(`  confirmed-verdict precision: ${percent(report.confirmedPrecision)}`);
  console.log(
    `  tp ${report.truePositives} · fp ${report.falsePositives} · fn ${report.falseNegatives} · tn ${report.trueNegatives}`,
  );
  console.log(`  flagged but unlabelled (not scored): ${report.unlabelledFlagged}`);

  for (const label of report.unobserved) {
    console.log(`  no observations in window: ${label.suite} › ${label.name}`);
  }
}

/** Mint, list and revoke the repository-scoped tokens that guard reads. */
function runToken(values: Record<string, string | boolean | undefined>, positionals: string[]): void {
  const [subcommand] = positionals;
  const config = loadConfig();
  const store = new Store(openDatabase(config.databasePath));

  switch (subcommand) {
    case 'mint': {
      const raw = typeof values.scope === 'string' ? values.scope.trim() : '';
      if (!raw) fail('--scope must be "owner" or "owner/name"');

      // An owner alone scopes the token to every repository under it, which is
      // what an organisation-wide App installation grants.
      let scope: ApiTokenScope;
      if (raw.includes('/')) {
        const parsed = parseRepoSlug(raw);
        if (!parsed) fail('--scope must be "owner" or "owner/name"');
        scope = { owner: parsed.owner, name: parsed.name };
      } else {
        if (!isValidRepoName(raw)) fail('--scope must be "owner" or "owner/name"');
        scope = { owner: raw, name: null };
      }

      const label = typeof values.label === 'string' ? values.label.trim().slice(0, 120) : null;
      const secret = generateApiToken();
      const record = store.createApiToken(tokenDigest(secret), scope, label || null);

      const target = record.scope.name ? `${record.scope.owner}/${record.scope.name}` : `${record.scope.owner}/*`;
      // Printed once and never stored: only the digest is persisted, so a lost
      // token is reissued rather than recovered.
      console.log(`token #${record.id} for ${target}\n${secret}`);
      if (!config.reads.requireAuth) {
        console.log('warning: REQUIRE_READ_AUTH is not true, so read endpoints still answer without a token');
      }
      return;
    }

    case 'list': {
      const tokens = store.listApiTokens();
      if (tokens.length === 0) {
        console.log('no read tokens issued');
        return;
      }
      for (const token of tokens) {
        const target = token.scope.name ? `${token.scope.owner}/${token.scope.name}` : `${token.scope.owner}/*`;
        const state = token.revokedAt ? `revoked ${token.revokedAt}` : 'active';
        console.log(`#${token.id}  ${target.padEnd(40)} ${state}${token.label ? ` · ${token.label}` : ''}`);
      }
      return;
    }

    case 'revoke': {
      const id = typeof values.id === 'string' ? Number(values.id) : Number.NaN;
      if (!Number.isInteger(id) || id <= 0) fail('--id must be a positive integer');
      if (!store.revokeApiToken(id)) fail(`no active token with id ${id}`);
      console.log(`revoked token #${id}`);
      return;
    }

    default:
      fail('token subcommand must be one of: mint, list, revoke');
  }
}

export function run(argv: readonly string[]): void {
  const [command, ...rest] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }

  let parsed;
  try {
    parsed = parseArgs({
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
        labels: { type: 'string' },
        scope: { type: 'string' },
        label: { type: 'string' },
        id: { type: 'string' },
        markdown: { type: 'boolean' },
      },
    });
  } catch (error) {
    // An unrecognised or malformed flag is a typo, not a crash.
    fail(error instanceof Error ? error.message : 'could not parse arguments');
  }

  const { values, positionals } = parsed;

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
    case 'precision':
      runPrecision(values);
      return;
    case 'token':
      runToken(values, positionals);
      return;
    default:
      console.error(`unknown command: ${command}\n`);
      console.log(USAGE);
      throw new CliError(`unknown command: ${command}`);
  }
}

/**
 * Run the CLI and return the process exit code.
 *
 * Separate from `run` so tests can exercise every command without the process
 * exiting underneath them, and so a genuine defect still surfaces its stack
 * trace rather than being flattened into a one-line message.
 */
export function main(argv: readonly string[]): number {
  try {
    run(argv);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`error: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

/**
 * Only take over the process when this module *is* the program.
 *
 * Importing the CLI from a test must not run a command or set an exit code.
 */
function isEntrypoint(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return resolve(invoked) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  process.exitCode = main(process.argv.slice(2));
}
