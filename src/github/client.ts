import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import type { Config } from '../config.js';
import type { JobRecord, RunnerOs } from '../types.js';
import { COMMENT_MARKER } from './comment.js';

/**
 * Thin wrapper over Octokit for GitHub App installation auth.
 *
 * Constructed only when credentials are present, so the analysis engine, the
 * CLI and the whole test suite work without any GitHub configuration.
 */
export class GitHubClient {
  private readonly cache = new Map<number, Octokit>();

  private constructor(
    private readonly appId: string,
    private readonly privateKey: string,
  ) {}

  static fromConfig(config: Config): GitHubClient | null {
    if (!config.githubAppId || !config.githubPrivateKey) return null;
    return new GitHubClient(config.githubAppId, config.githubPrivateKey);
  }

  /** An Octokit authenticated as the App installation on a given account. */
  forInstallation(installationId: number): Octokit {
    const cached = this.cache.get(installationId);
    if (cached) return cached;

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: this.appId, privateKey: this.privateKey, installationId },
    });

    this.cache.set(installationId, octokit);
    return octokit;
  }
}

/**
 * Map runner labels to a billing family.
 *
 * Labels are matched case-insensitively and by prefix because GitHub versions
 * them (`ubuntu-22.04`, `windows-2022`, `macos-14-arm64`), and self-hosted
 * runners carry arbitrary extra labels alongside the OS one.
 */
export function inferRunnerOs(labels: readonly string[]): RunnerOs {
  for (const raw of labels) {
    const label = raw.toLowerCase();
    if (label.startsWith('windows')) return 'windows';
    if (label.startsWith('macos') || label.startsWith('mac-')) return 'macos';
  }
  return 'linux';
}

export interface JobBillingSummary {
  readonly runnerOs: RunnerOs;
  readonly durationMs: number;
  /** The individual jobs, which is what GitHub actually bills. */
  readonly jobs: readonly JobRecord[];
}

interface JobLike {
  readonly id?: number | string | null;
  readonly name?: string | null;
  readonly labels?: string[] | null;
  readonly started_at?: string | null;
  readonly completed_at?: string | null;
}

function durationOf(job: JobLike): number {
  if (!job.started_at || !job.completed_at) return 0;
  const start = Date.parse(job.started_at);
  const end = Date.parse(job.completed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

/**
 * Reduce a run's jobs to billing rows plus a run-level summary.
 *
 * The per-job breakdown is what pricing uses, because GitHub bills each job
 * separately and a run's jobs can straddle rate tiers that differ by 10×. The
 * summary fields are the degraded view kept for stores that hold only run-level
 * data, and attribute the run to whichever OS consumed the most time.
 */
export function summariseJobs(jobs: readonly JobLike[]): JobBillingSummary | null {
  if (jobs.length === 0) return null;

  const byOs = new Map<RunnerOs, number>();
  const records: JobRecord[] = [];
  let durationMs = 0;

  jobs.forEach((job, index) => {
    const ms = durationOf(job);
    const os = inferRunnerOs(job.labels ?? []);
    durationMs += ms;
    byOs.set(os, (byOs.get(os) ?? 0) + ms);

    records.push({
      // Fall back to the position in the list so a provider that omits ids
      // still produces stable keys across redeliveries of the same run.
      externalId: job.id === undefined || job.id === null ? `index-${index}` : String(job.id),
      name: job.name ?? `job-${index}`,
      runnerOs: os,
      durationMs: ms,
    });
  });

  let runnerOs: RunnerOs = 'linux';
  let best = -1;
  for (const [os, ms] of byOs) {
    if (ms > best) {
      best = ms;
      runnerOs = os;
    }
  }

  return { runnerOs, durationMs, jobs: records };
}

/**
 * Post the report comment, replacing our previous one if it exists.
 *
 * Identified by a hidden marker rather than by author so the behaviour holds
 * when the App is renamed.
 */
export async function upsertPullRequestComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  const existing = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  const previous = existing.find((comment) => comment.body?.includes(COMMENT_MARKER));

  if (previous) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body });
    return;
  }

  await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}
