import { Webhooks } from '@octokit/webhooks';
import type { AppContext } from '../context.js';
import type { RepoRef, RunMetadata } from '../types.js';
import { buildPullRequestReport } from '../analysis/report.js';
import { renderPullRequestComment } from './comment.js';
import { summariseJobs, upsertPullRequestComment } from './client.js';

/**
 * GitHub webhook handling.
 *
 * `workflow_run.completed` supplies run metadata and, critically, the
 * `run_attempt` counter that makes re-runs visible. Test-level results arrive
 * separately through the ingest endpoint, because GitHub does not put test
 * outcomes in the webhook payload.
 */

interface WorkflowRunLike {
  id: number;
  name?: string | null;
  run_attempt?: number | null;
  head_sha: string;
  head_branch?: string | null;
  conclusion?: string | null;
  run_started_at?: string | null;
  updated_at?: string | null;
  pull_requests?: ({ number: number; base?: { ref?: string | null } | null } | null)[] | null;
}

function toRunMetadata(run: WorkflowRunLike, durationMs: number, runnerOs: RunMetadata['runnerOs']): RunMetadata {
  const startedAt = run.run_started_at ?? new Date().toISOString();
  const pullRequest = run.pull_requests?.find((pr) => pr && typeof pr.number === 'number') ?? null;

  return {
    externalId: String(run.id),
    workflowName: run.name ?? 'unknown workflow',
    runAttempt: run.run_attempt ?? 1,
    commitSha: run.head_sha,
    branch: run.head_branch ?? 'unknown',
    pullRequestNumber: pullRequest?.number ?? null,
    runnerOs,
    durationMs,
    conclusion: run.conclusion ?? 'unknown',
    startedAt,
  };
}

/** Wall-clock fallback when per-job billing data is unavailable. */
function wallClockDurationMs(run: WorkflowRunLike): number {
  if (!run.run_started_at || !run.updated_at) return 0;
  const start = Date.parse(run.run_started_at);
  const end = Date.parse(run.updated_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

export function createWebhooks(context: AppContext): Webhooks {
  const { config, store, github } = context;

  if (!config.webhookSecret) {
    throw new Error('GITHUB_WEBHOOK_SECRET is required to receive webhooks');
  }

  const webhooks = new Webhooks({ secret: config.webhookSecret });

  webhooks.on('workflow_run.completed', async ({ payload }) => {
    const run = payload.workflow_run as unknown as WorkflowRunLike;
    const repo: RepoRef = { owner: payload.repository.owner.login, name: payload.repository.name };
    const installationId = payload.installation?.id;

    const octokit = github && installationId ? github.forInstallation(installationId) : null;

    // Per-job data yields a far more accurate bill than run wall-clock time,
    // but it is an extra API call that may fail; degrade rather than drop the
    // run entirely.
    let durationMs = wallClockDurationMs(run);
    let runnerOs: RunMetadata['runnerOs'] = 'linux';

    if (octokit) {
      try {
        const jobs = await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
          owner: repo.owner,
          repo: repo.name,
          run_id: run.id,
          per_page: 100,
        });
        const summary = summariseJobs(jobs);
        if (summary) {
          durationMs = summary.durationMs;
          runnerOs = summary.runnerOs;
        }
      } catch (error) {
        console.warn(
          `[webhook] could not read jobs for run ${run.id}; falling back to wall-clock duration`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    const metadata = toRunMetadata(run, durationMs, runnerOs);
    store.recordRun({ repo, run: metadata, results: [] });

    if (metadata.pullRequestNumber === null) return;
    if (!config.postPrComments || !octokit) return;

    const repoId = store.upsertRepo(repo);
    const baseBranch =
      run.pull_requests?.find((pr) => pr?.base?.ref)?.base?.ref ?? payload.repository.default_branch;

    const report = buildPullRequestReport(
      store,
      repoId,
      repo,
      metadata.pullRequestNumber,
      baseBranch,
      config,
    );

    await upsertPullRequestComment(
      octokit,
      repo.owner,
      repo.name,
      metadata.pullRequestNumber,
      renderPullRequestComment(report),
    );
  });

  webhooks.onError((error) => {
    console.error('[webhook] handler error:', error.message);
  });

  return webhooks;
}
