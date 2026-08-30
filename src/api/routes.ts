import { Router, json, type Request, type Response } from 'express';
import type { AppContext } from '../context.js';
import { buildPullRequestReport, buildRepoReport } from '../analysis/report.js';
import { isFlaky } from '../analysis/flaky.js';
import { renderPullRequestComment } from '../github/comment.js';
import { requireIngestToken } from './auth.js';
import { ingestRateLimiter } from './rate-limit.js';
import { isValidBranchName, isValidRepoName, parseIngestRequest } from './validate.js';
import type { RepoRef } from '../types.js';

/** JUnit reports from large monorepos are genuinely megabytes of XML. */
const INGEST_BODY_LIMIT = '20mb';

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
    res.status(outcome.inserted ? 201 : 200).json({
      runId: outcome.runId,
      recorded: outcome.inserted,
      testsIngested: outcome.inserted ? parsed.value.results.length : 0,
      // Surfaced so a CI job can tell a genuine upload from a replay.
      duplicate: !outcome.inserted,
    });
  });

  /** Ranked flake list for a repository. */
  router.get('/v1/repos/:owner/:repo/flaky', (req, res) => {
    const repo = readRepoParams(req, res);
    if (!repo) return;

    const repoId = requireRepoId(context, repo, res);
    if (repoId === null) return;

    const report = buildRepoReport(store, repoId, repo, config);
    const includeStable = req.query.includeStable === 'true';

    res.json({
      repo: `${repo.owner}/${repo.name}`,
      generatedAt: report.generatedAt,
      quarantined: report.quarantined,
      tests: includeStable ? report.assessments : report.assessments.filter(isFlaky),
    });
  });

  /** Cost and flake report for a single pull request. */
  router.get('/v1/repos/:owner/:repo/pulls/:number/report', (req, res) => {
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

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;
    store.quarantine(store.upsertRepo(repo), suite, name, reason);
    res.status(201).json({ quarantined: { suite, name, reason } });
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
