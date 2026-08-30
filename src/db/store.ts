import type { Db } from './index.js';
import type { RepoRef, RunIngestPayload, RunnerOs, TestStatus } from '../types.js';

/** A single test execution joined with the run that produced it. */
export interface Observation {
  /** Provider run id, so an observation can be tied back to its run/attempt. */
  readonly runExternalId: string;
  readonly suite: string;
  readonly name: string;
  readonly status: TestStatus;
  readonly commitSha: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly runAttempt: number;
  readonly branch: string;
  readonly pullRequestNumber: number | null;
}

/** Run-level facts needed to price CI usage. */
export interface RunRecord {
  readonly externalId: string;
  readonly workflowName: string;
  readonly runAttempt: number;
  readonly runnerOs: RunnerOs;
  readonly durationMs: number;
  readonly conclusion: string;
  readonly commitSha: string;
  readonly branch: string;
  readonly pullRequestNumber: number | null;
  readonly startedAt: string;
}

export interface QuarantineEntry {
  readonly suite: string;
  readonly name: string;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface RecordRunOutcome {
  readonly runId: number;
  /** False when the run was already stored — a duplicate webhook or re-upload. */
  readonly inserted: boolean;
}

interface RepoRow {
  id: number;
}

interface ObservationRow {
  external_id: string;
  suite: string;
  name: string;
  status: string;
  commit_sha: string;
  started_at: string;
  duration_ms: number;
  run_attempt: number;
  branch: string;
  pull_request_number: number | null;
}

interface RunRow {
  external_id: string;
  workflow_name: string;
  run_attempt: number;
  runner_os: string;
  duration_ms: number;
  conclusion: string;
  commit_sha: string;
  branch: string;
  pull_request_number: number | null;
  started_at: string;
}

interface QuarantineRow {
  suite: string;
  name: string;
  reason: string | null;
  created_at: string;
}

const VALID_STATUSES: ReadonlySet<string> = new Set(['passed', 'failed', 'error', 'skipped']);
const VALID_RUNNERS: ReadonlySet<string> = new Set(['linux', 'windows', 'macos']);

function toStatus(raw: string): TestStatus {
  return VALID_STATUSES.has(raw) ? (raw as TestStatus) : 'failed';
}

function toRunnerOs(raw: string): RunnerOs {
  return VALID_RUNNERS.has(raw) ? (raw as RunnerOs) : 'linux';
}

function mapObservation(row: ObservationRow): Observation {
  return {
    runExternalId: row.external_id,
    suite: row.suite,
    name: row.name,
    status: toStatus(row.status),
    commitSha: row.commit_sha,
    startedAt: row.started_at,
    durationMs: row.duration_ms,
    runAttempt: row.run_attempt,
    branch: row.branch,
    pullRequestNumber: row.pull_request_number,
  };
}

function mapRun(row: RunRow): RunRecord {
  return {
    externalId: row.external_id,
    workflowName: row.workflow_name,
    runAttempt: row.run_attempt,
    runnerOs: toRunnerOs(row.runner_os),
    durationMs: row.duration_ms,
    conclusion: row.conclusion,
    commitSha: row.commit_sha,
    branch: row.branch,
    pullRequestNumber: row.pull_request_number,
    startedAt: row.started_at,
  };
}

/**
 * All persistence for the service.
 *
 * Every statement is parameterised; no caller-supplied value is ever
 * interpolated into SQL.
 */
export class Store {
  constructor(private readonly db: Db) {}

  /** Find or create the repository row, returning its id. */
  upsertRepo(repo: RepoRef): number {
    this.db
      .prepare('INSERT INTO repositories (owner, name) VALUES (?, ?) ON CONFLICT (owner, name) DO NOTHING')
      .run(repo.owner, repo.name);

    const row = this.db
      .prepare('SELECT id FROM repositories WHERE owner = ? AND name = ?')
      .get(repo.owner, repo.name) as RepoRow | undefined;

    if (!row) {
      throw new Error(`failed to upsert repository ${repo.owner}/${repo.name}`);
    }
    return row.id;
  }

  findRepo(repo: RepoRef): number | null {
    const row = this.db
      .prepare('SELECT id FROM repositories WHERE owner = ? AND name = ?')
      .get(repo.owner, repo.name) as RepoRow | undefined;
    return row?.id ?? null;
  }

  /**
   * Persist a run and its test results atomically.
   *
   * Idempotent on (repo, provider run id, attempt): webhooks are delivered at
   * least once, and double-counting would corrupt the cost ledger.
   */
  recordRun(payload: RunIngestPayload): RecordRunOutcome {
    const insert = this.db.transaction((data: RunIngestPayload): RecordRunOutcome => {
      const repoId = this.upsertRepo(data.repo);
      const { run } = data;

      const result = this.db
        .prepare(
          `INSERT INTO runs (
             repo_id, external_id, workflow_name, run_attempt, commit_sha, branch,
             pull_request_number, runner_os, duration_ms, conclusion, started_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (repo_id, external_id, run_attempt) DO NOTHING`,
        )
        .run(
          repoId,
          run.externalId,
          run.workflowName,
          run.runAttempt,
          run.commitSha,
          run.branch,
          run.pullRequestNumber,
          run.runnerOs,
          Math.max(0, Math.round(run.durationMs)),
          run.conclusion,
          run.startedAt,
        );

      if (result.changes === 0) {
        const existing = this.db
          .prepare('SELECT id FROM runs WHERE repo_id = ? AND external_id = ? AND run_attempt = ?')
          .get(repoId, run.externalId, run.runAttempt) as RepoRow | undefined;
        return { runId: existing?.id ?? -1, inserted: false };
      }

      const runId = Number(result.lastInsertRowid);
      const insertResult = this.db.prepare(
        `INSERT INTO test_results (run_id, suite, name, status, duration_ms, failure_message)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      for (const test of data.results) {
        insertResult.run(
          runId,
          test.suite,
          test.name,
          test.status,
          Math.max(0, Math.round(test.durationMs)),
          test.failureMessage,
        );
      }

      return { runId, inserted: true };
    });

    return insert(payload);
  }

  /**
   * Recent observations per test identity, newest first within each test.
   *
   * The per-test window keeps a chatty suite from crowding out a rarely-run
   * one, which a global `LIMIT` would do.
   */
  recentObservations(repoId: number, windowSize: number): Observation[] {
    const rows = this.db
      .prepare(
        `SELECT external_id, suite, name, status, commit_sha, started_at, duration_ms, run_attempt, branch, pull_request_number
         FROM (
           SELECT r.external_id, t.suite, t.name, t.status, r.commit_sha, r.started_at, t.duration_ms,
                  r.run_attempt, r.branch, r.pull_request_number,
                  ROW_NUMBER() OVER (
                    PARTITION BY t.suite, t.name
                    ORDER BY r.started_at DESC, r.run_attempt DESC, t.id DESC
                  ) AS rn
           FROM test_results t
           JOIN runs r ON r.id = t.run_id
           WHERE r.repo_id = ?
         )
         WHERE rn <= ?
         ORDER BY suite, name, started_at ASC, run_attempt ASC`,
      )
      .all(repoId, windowSize) as ObservationRow[];

    return rows.map(mapObservation);
  }

  /** Observations belonging to a single pull request, oldest first. */
  observationsForPullRequest(repoId: number, pullRequestNumber: number): Observation[] {
    const rows = this.db
      .prepare(
        `SELECT r.external_id, t.suite, t.name, t.status, r.commit_sha, r.started_at, t.duration_ms,
                r.run_attempt, r.branch, r.pull_request_number
         FROM test_results t
         JOIN runs r ON r.id = t.run_id
         WHERE r.repo_id = ? AND r.pull_request_number = ?
         ORDER BY r.started_at ASC, r.run_attempt ASC, t.id ASC`,
      )
      .all(repoId, pullRequestNumber) as ObservationRow[];

    return rows.map(mapObservation);
  }

  runsForPullRequest(repoId: number, pullRequestNumber: number): RunRecord[] {
    const rows = this.db
      .prepare(
        `SELECT external_id, workflow_name, run_attempt, runner_os, duration_ms,
                conclusion, commit_sha, branch, pull_request_number, started_at
         FROM runs
         WHERE repo_id = ? AND pull_request_number = ?
         ORDER BY started_at ASC, run_attempt ASC`,
      )
      .all(repoId, pullRequestNumber) as RunRow[];

    return rows.map(mapRun);
  }

  /** Most recent runs on a branch, used to build the cost baseline. */
  runsForBranch(repoId: number, branch: string, limit: number): RunRecord[] {
    const rows = this.db
      .prepare(
        `SELECT external_id, workflow_name, run_attempt, runner_os, duration_ms,
                conclusion, commit_sha, branch, pull_request_number, started_at
         FROM runs
         WHERE repo_id = ? AND branch = ?
         ORDER BY started_at DESC, run_attempt DESC
         LIMIT ?`,
      )
      .all(repoId, branch, limit) as RunRow[];

    return rows.map(mapRun);
  }

  listQuarantined(repoId: number): QuarantineEntry[] {
    const rows = this.db
      .prepare('SELECT suite, name, reason, created_at FROM quarantines WHERE repo_id = ? ORDER BY suite, name')
      .all(repoId) as QuarantineRow[];

    return rows.map((row) => ({
      suite: row.suite,
      name: row.name,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  quarantine(repoId: number, suite: string, name: string, reason: string | null): void {
    this.db
      .prepare(
        `INSERT INTO quarantines (repo_id, suite, name, reason) VALUES (?, ?, ?, ?)
         ON CONFLICT (repo_id, suite, name) DO UPDATE SET reason = excluded.reason`,
      )
      .run(repoId, suite, name, reason);
  }

  removeQuarantine(repoId: number, suite: string, name: string): boolean {
    const result = this.db
      .prepare('DELETE FROM quarantines WHERE repo_id = ? AND suite = ? AND name = ?')
      .run(repoId, suite, name);
    return result.changes > 0;
  }
}
