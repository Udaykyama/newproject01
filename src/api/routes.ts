import { Router, json, type Request, type Response } from 'express';
import type { AppContext } from '../context.js';
import { buildPullRequestReport, buildRepoReport } from '../analysis/report.js';
import { isFlaky } from '../analysis/flaky.js';
import { renderPullRequestComment } from '../github/comment.js';
import { requireIngestToken, requireReadAccess } from './auth.js';
import { ingestRateLimiter } from './rate-limit.js';
import { isValidBranchName, isValidRepoName, parseIngestRequest } from './validate.js';
import type { RepoRef } from '../types.js';

/** JUnit reports from large monorepos are genuinely megabytes of XML. */
const INGEST_BODY_LIMIT = '20mb';

/** Quarantine reasons are free text from an operator; cap them for storage. */
const MAX_REASON_LENGTH = 500;
const MAX_ACTOR_LENGTH = 120;

/**
 * Read a non-negative integer query parameter.
 *
 * Returns `null` when the value is present but not a valid bound, so the caller
 * can reject rather than silently paginating from somewhere the client did not
 * ask for.
 */
function readBound(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function readRepoParams(req: Request, res: Response): RepoRef | null {
  // Express types route params as `string | string[]`; repeated params would
  // arrive as an array, which is never valid here.
  const owner = typeof req.params.owner === 'string' ? req.params.owner : '';
  const name = typeof req.params.repo === 'string' ? req.params.repo : '';

  if (!isValidRepoName(owner) || !isValidRepoName(name)) {
    res.status(400).json({ error: 'invalid repository owner or name' });
    return null;
  }

  return { owner, name };
}

/**
 * Resolve a repository that must already exist.
 *
 * Read endpoints deliberately do not create rows: a typo should 404, not
 * silently register an empty repository.
 */
function requireRepoId(context: AppContext, repo: RepoRef, res: Response): number | null {
  const repoId = context.store.findRepo(repo);
  if (repoId === null) {
    res.status(404).json({ error: `no data for ${repo.owner}/${repo.name}` });
    return null;
  }
  return repoId;
}

export function createRouter(context: AppContext): Router {
  const router = Router();
  const { config, store } = context;
  // Rate limiting runs before authentication so a brute-force attempt is
  // throttled rather than merely rejected.
  const ingestLimit = ingestRateLimiter(config.limits.ingestPerMinute);
  const ingestAuth = requireIngestToken(config.ingestToken);
  // Row-level scoping for the read endpoints: a token may only see the
  // repositories its scope names. A no-op unless REQUIRE_READ_AUTH is set.
  const readAuth = requireReadAccess(context);

  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** CI uploads a finished run plus its JUnit report. */
  router.post('/v1/ingest/junit', ingestLimit, ingestAuth, json({ limit: INGEST_BODY_LIMIT }), (req, res) => {
    const parsed = parseIngestRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid payload', details: parsed.errors });
      return;
    }

    const outcome = store.recordRun(parsed.value);
    // `recorded` and `duplicate` describe the *results*, not the row. The
    // webhook writes the same run row for its duration data, so "a row already
    // existed" says nothing about whether this upload's tests were stored.
    res.status(outcome.inserted || outcome.resultsRecorded > 0 ? 201 : 200).json({
      runId: outcome.runId,
      recorded: outcome.resultsRecorded > 0,
      testsIngested: outcome.resultsRecorded,
      // Surfaced so a CI job can tell a genuine upload from a replay.
      duplicate: outcome.duplicateResults,
    });
  });

  /** Ranked flake list for a repository. */
  router.get('/v1/repos/:owner/:repo/flaky', readAuth, (req, res) => {
    const repo = readRepoParams(req, res);
    if (!repo) return;

    const repoId = requireRepoId(context, repo, res);
    if (repoId === null) return;

    // Unbounded reads are fine for one repository and untenable for a monorepo
    // with tens of thousands of tests, so the window is always bounded.
    const limit = readBound(req.query.limit, config.reads.defaultPageSize);
    const offset = readBound(req.query.offset, 0);
    if (limit === null || offset === null) {
      res.status(400).json({ error: 'limit and offset must be non-negative integers' });
      return;
    }

    const report = buildRepoReport(store, repoId, repo, config);
    const includeStable = req.query.includeStable === 'true';
    const matching = includeStable ? report.assessments : report.assessments.filter(isFlaky);
    const pageSize = Math.min(limit, config.reads.maxPageSize);

    res.json({
      repo: `${repo.owner}/${repo.name}`,
      generatedAt: report.generatedAt,
      quarantined: report.quarantined,
      total: matching.length,
      limit: pageSize,
      offset,
      tests: matching.slice(offset, offset + pageSize),
    });
  });

  /** Cost and flake report for a single pull request. */
  router.get('/v1/repos/:owner/:repo/pulls/:number/report', readAuth, (req, res) => {
    const repo = readRepoParams(req, res);
    if (!repo) return;

    const pullRequestNumber = Number(req.params.number);
    if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
      res.status(400).json({ error: 'pull request number must be a positive integer' });
      return;
    }

    const repoId = requireRepoId(context, repo, res);
    if (repoId === null) return;

    const requestedBranch = req.query.baseBranch;
    if (requestedBranch !== undefined && (typeof requestedBranch !== 'string' || !isValidBranchName(requestedBranch))) {
      res.status(400).json({ error: 'baseBranch must be a valid git branch name' });
      return;
    }

    const baseBranch = requestedBranch ?? 'main';
    const report = buildPullRequestReport(store, repoId, repo, pullRequestNumber, baseBranch, config);

    if (req.query.format === 'markdown') {
      // Served as plain text: the body is markdown source for a PR comment,
      // consumed by API clients rather than rendered by a browser, and it
      // carries test names that originate in untrusted CI reports. The header
      // is set on its own statement so the declared type is unambiguous.
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(renderPullRequestComment(report));
      return;
    }

    res.json(report);
  });

  router.post('/v1/repos/:owner/:repo/quarantine', ingestLimit, ingestAuth, json(), (req, res) => {
    const repo = readRepoParams(req, res);
    if (!repo) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const suite = typeof body.suite === 'string' ? body.suite.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!suite || !name) {
      res.status(400).json({ error: 'suite and name are required' });
      return;
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON_LENGTH) : null;
    // Recorded so a stale quarantine can be traced back to a person and a
    // date. A skip with no owner is how a test stays skipped for three years.
    const createdBy = typeof body.createdBy === 'string' ? body.createdBy.trim().slice(0, MAX_ACTOR_LENGTH) : null;

    let expiresAt: string | null = null;
    if (body.expiresAt !== undefined && body.expiresAt !== null) {
      if (typeof body.expiresAt !== 'string' || Number.isNaN(Date.parse(body.expiresAt))) {
        res.status(400).json({ error: 'expiresAt must be an ISO 8601 timestamp' });
        return;
      }
      expiresAt = new Date(body.expiresAt).toISOString();
    }

    store.quarantine(store.upsertRepo(repo), suite, name, reason, createdBy || null, expiresAt);
    res.status(201).json({ quarantined: { suite, name, reason, createdBy: createdBy || null, expiresAt } });
  });

  router.delete('/v1/repos/:owner/:repo/quarantine', ingestLimit, ingestAuth, json(), (req, res) => {
    const repo = readRepoParams(req, res);
    if (!repo) return;

    const repoId = requireRepoId(context, repo, res);
    if (repoId === null) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const suite = typeof body.suite === 'string' ? body.suite.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!suite || !name) {
      res.status(400).json({ error: 'suite and name are required' });
      return;
    }

    const removed = store.removeQuarantine(repoId, suite, name);
    res.status(removed ? 200 : 404).json({ removed });
  });

  return router;
}
