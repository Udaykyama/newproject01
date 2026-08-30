import { parseJUnitXml } from '../ingest/junit.js';
import {
  UNKNOWN_BRANCH,
  UNKNOWN_CONCLUSION,
  UNKNOWN_WORKFLOW,
  type RunIngestPayload,
  type RunnerOs,
  type TestResult,
  type TestStatus,
} from '../types.js';

/**
 * Hand-rolled validation for the ingest endpoint.
 *
 * The payload shape is small and stable, and this endpoint is the only place
 * untrusted input enters the system, so an explicit, readable validator is
 * preferable to a schema dependency.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** GitHub's own constraint on owner and repository names. */
const NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
// The hyphen is placed first so it cannot be misread as, or later become
// part of, a range such as `+-` (which would also admit a comma).
const BRANCH_PATTERN = /^[-A-Za-z0-9._/+]+$/;
const SHA_PATTERN = /^[0-9a-fA-F]{7,64}$/;
const RUNNERS: readonly RunnerOs[] = ['linux', 'windows', 'macos'];
const STATUSES: readonly TestStatus[] = ['passed', 'failed', 'error', 'skipped'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Split and validate an `owner/name` slug. */
export function parseRepoSlug(slug: unknown): { owner: string; name: string } | null {
  const text = optionalString(slug);
  if (!text) return null;

  const parts = text.split('/');
  if (parts.length !== 2) return null;

  const [owner, name] = parts;
  if (!owner || !name || !NAME_PATTERN.test(owner) || !NAME_PATTERN.test(name)) return null;

  return { owner, name };
}

export function isValidRepoName(value: string): boolean {
  return NAME_PATTERN.test(value);
}

/**
 * Validate a git branch name.
 *
 * A subset of `git check-ref-format` covering the rules that matter here. The
 * value arrives from the query string and is echoed back in reports, so it is
 * constrained at the edge rather than escaped at each use. The character class
 * is a flat, non-backtracking pattern; the structural rules are plain string
 * checks so a long input cannot be made expensive.
 */
export function isValidBranchName(value: string): boolean {
  if (value.length === 0 || value.length > 255) return false;
  if (!BRANCH_PATTERN.test(value)) return false;
  if (value.startsWith('/') || value.startsWith('-') || value.startsWith('.')) return false;
  if (value.endsWith('/') || value.endsWith('.') || value.endsWith('.lock')) return false;
  return !value.includes('..') && !value.includes('//') && !value.includes('@{');
}

function parseResults(value: unknown, errors: string[]): TestResult[] {
  if (!Array.isArray(value)) {
    errors.push('results must be an array');
    return [];
  }

  const results: TestResult[] = [];
  value.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push(`results[${index}] must be an object`);
      return;
    }

    const name = optionalString(raw.name);
    if (!name) {
      errors.push(`results[${index}].name is required`);
      return;
    }

    const status = optionalString(raw.status) as TestStatus | undefined;
    if (!status || !STATUSES.includes(status)) {
      errors.push(`results[${index}].status must be one of ${STATUSES.join(', ')}`);
      return;
    }

    results.push({
      suite: optionalString(raw.suite) ?? '<unknown suite>',
      name,
      status,
      durationMs: Math.max(0, finiteNumber(raw.durationMs) ?? 0),
      failureMessage: optionalString(raw.failureMessage)?.slice(0, 4000) ?? null,
    });
  });

  return results;
}

/**
 * Validate an ingest request body.
 *
 * Accepts test results either as raw JUnit XML (`junitXml`) or as an already
 * normalised array (`results`), so a CI job can upload its report verbatim
 * while other producers can post structured data.
 */
export function parseIngestRequest(body: unknown): ValidationResult<RunIngestPayload> {
  const errors: string[] = [];

  if (!isRecord(body)) {
    return { ok: false, errors: ['request body must be a JSON object'] };
  }

  const repo = parseRepoSlug(body.repo);
  if (!repo) errors.push('repo must be a valid "owner/name" slug');

  const runRaw = isRecord(body.run) ? body.run : null;
  if (!runRaw) errors.push('run must be an object');

  let results: TestResult[] = [];
  const junitXml = optionalString(body.junitXml);

  if (junitXml !== undefined) {
    try {
      results = parseJUnitXml(junitXml);
    } catch (error) {
      errors.push(`junitXml could not be parsed: ${error instanceof Error ? error.message : 'invalid XML'}`);
    }
  } else if (body.results !== undefined) {
    results = parseResults(body.results, errors);
  }

  if (!runRaw || !repo) return { ok: false, errors };

  const externalId = optionalString(runRaw.externalId);
  if (!externalId) errors.push('run.externalId is required');

  const commitSha = optionalString(runRaw.commitSha);
  if (!commitSha || !SHA_PATTERN.test(commitSha)) errors.push('run.commitSha must be a hex commit sha');

  const runnerOs = (optionalString(runRaw.runnerOs) ?? 'linux') as RunnerOs;
  if (!RUNNERS.includes(runnerOs)) errors.push(`run.runnerOs must be one of ${RUNNERS.join(', ')}`);

  const durationMs = finiteNumber(runRaw.durationMs);
  if (durationMs === undefined || durationMs < 0) errors.push('run.durationMs must be a non-negative number');

  const pullRequestRaw = runRaw.pullRequestNumber;
  let pullRequestNumber: number | null = null;
  if (pullRequestRaw !== undefined && pullRequestRaw !== null) {
    const parsed = finiteNumber(pullRequestRaw);
    if (parsed === undefined || parsed <= 0) {
      errors.push('run.pullRequestNumber must be a positive integer when provided');
    } else {
      pullRequestNumber = Math.trunc(parsed);
    }
  }

  const startedAt = optionalString(runRaw.startedAt) ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(startedAt))) errors.push('run.startedAt must be an ISO-8601 timestamp');

  if (errors.length > 0 || !externalId || !commitSha || durationMs === undefined) {
    return { ok: false, errors };
  }

  const runAttempt = Math.max(1, Math.trunc(finiteNumber(runRaw.runAttempt) ?? 1));

  return {
    ok: true,
    value: {
      repo,
      run: {
        externalId,
        workflowName: optionalString(runRaw.workflowName) ?? UNKNOWN_WORKFLOW,
        runAttempt,
        commitSha: commitSha.toLowerCase(),
        branch: optionalString(runRaw.branch) ?? UNKNOWN_BRANCH,
        pullRequestNumber,
        runnerOs,
        durationMs,
        // A job cannot observe the run it is running inside, so whatever it
        // claims is the weakest measurement available and must never displace
        // the provider's own per-job billing data.
        durationSource: 'reported',
        conclusion: optionalString(runRaw.conclusion) ?? UNKNOWN_CONCLUSION,
        // Normalised so lexicographic ordering in SQL matches chronological
        // ordering, which the flake engine relies on.
        startedAt: new Date(startedAt).toISOString(),
      },
      results,
    },
  };
}
