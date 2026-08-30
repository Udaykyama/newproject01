import type { Db } from './index.js';
import {
  DURATION_SOURCE_RANK,
  DURATION_SOURCES,
  UNKNOWN_BRANCH,
  UNKNOWN_CONCLUSION,
  UNKNOWN_WORKFLOW,
  type DurationSource,
  type JobRecord,
  type RepoRef,
  type RunFacts,
  type RunIngestPayload,
  type RunnerOs,
  type TestStatus,
} from '../types.js';

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
export interface RunRecord extends RunFacts {
  readonly externalId: string;
  readonly runAttempt: number;
  readonly commitSha: string;
  /** Per-job billing rows; empty when only run-level data was available. */
  readonly jobs: readonly JobRecord[];
}

export interface QuarantineEntry {
  readonly suite: string;
  readonly name: string;
  readonly reason: string | null;
  readonly createdBy: string | null;
  /** ISO-8601 instant after which the quarantine no longer applies. */
  readonly expiresAt: string | null;
  readonly createdAt: string;
}

export interface RecordRunOutcome {
  readonly runId: number;
  /** False when the run row already existed and its facts were merged instead. */
  readonly inserted: boolean;
  /** How many test results this call wrote; 0 when none were stored. */
  readonly resultsRecorded: number;
  /** True when results were discarded because the run already had some. */
  readonly duplicateResults: boolean;
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
  duration_source: string;
  conclusion: string;
  commit_sha: string;
  branch: string;
  pull_request_number: number | null;
  started_at: string;
}

interface ExistingRunRow extends RunRow {
  id: number;
}

interface JobRow {
  run_id: number;
  external_id: string;
  name: string;
  runner_os: string;
  duration_ms: number;
}

interface QuarantineRow {
  suite: string;
  name: string;
  reason: string | null;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
}

const VALID_STATUSES: ReadonlySet<string> = new Set(['passed', 'failed', 'error', 'skipped']);
const VALID_RUNNERS: ReadonlySet<string> = new Set(['linux', 'windows', 'macos']);
const VALID_DURATION_SOURCES: ReadonlySet<string> = new Set(DURATION_SOURCES);

function toStatus(raw: string): TestStatus {
  return VALID_STATUSES.has(raw) ? (raw as TestStatus) : 'failed';
}

function toRunnerOs(raw: string): RunnerOs {
  return VALID_RUNNERS.has(raw) ? (raw as RunnerOs) : 'linux';
}

function toDurationSource(raw: string): DurationSource {
  return VALID_DURATION_SOURCES.has(raw) ? (raw as DurationSource) : 'reported';
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

function mapRun(row: RunRow, jobs: readonly JobRecord[] = []): RunRecord {
  return {
    externalId: row.external_id,
    workflowName: row.workflow_name,
    runAttempt: row.run_attempt,
    runnerOs: toRunnerOs(row.runner_os),
    durationMs: row.duration_ms,
    durationSource: toDurationSource(row.duration_source),
    conclusion: row.conclusion,
    commitSha: row.commit_sha,
    branch: row.branch,
    pullRequestNumber: row.pull_request_number,
    startedAt: row.started_at,
    jobs,
  };
}

function mapJob(row: JobRow): JobRecord {
  return {
    externalId: row.external_id,
    name: row.name,
    runnerOs: toRunnerOs(row.runner_os),
    durationMs: row.duration_ms,
  };
}

/** Bucket job rows by the run they belong to. */
function groupJobs(rows: readonly JobRow[]): Map<number, JobRecord[]> {
  const byRun = new Map<number, JobRecord[]>();
  for (const row of rows) {
    const bucket = byRun.get(row.run_id);
    if (bucket) {
      bucket.push(mapJob(row));
    } else {
      byRun.set(row.run_id, [mapJob(row)]);
    }
  }
  return byRun;
}

/** A real value from either producer always beats the other's placeholder. */
function preferKnown(existing: string, incoming: string, placeholder: string): string {
  if (incoming === placeholder) return existing;
  return incoming;
}

/**
 * Reconcile two observations of the same run.
 *
 * A run is written twice by design. The CI job uploads its JUnit report, which
 * carries the test results but cannot measure the run it is running inside; the
 * `workflow_run.completed` webhook arrives afterwards with per-job billing data
 * but no test results. Neither is complete, they can arrive in either order,
 * and whichever lands second must not erase what the first recorded.
 *
 * Duration, runner OS and provenance move together: an OS attribution is only
 * meaningful alongside the measurement it was derived from. A zero duration is
 * never a measurement, so it can never displace one.
 */
export function mergeRunFacts(existing: RunFacts, incoming: RunFacts): RunFacts {
  const incomingMeasured = incoming.durationMs > 0;
  const existingMeasured = existing.durationMs > 0;
  const betterSourced =
    DURATION_SOURCE_RANK[incoming.durationSource] >= DURATION_SOURCE_RANK[existing.durationSource];

  const takeMeasurement = incomingMeasured && (!existingMeasured || betterSourced);
  const measurement = takeMeasurement ? incoming : existing;

  return {
    workflowName: preferKnown(existing.workflowName, incoming.workflowName, UNKNOWN_WORKFLOW),
    branch: preferKnown(existing.branch, incoming.branch, UNKNOWN_BRANCH),
    // A pull request association is never dropped: one producer may not know it,
    // and losing it would strand the run's cost outside every PR report.
    pullRequestNumber: incoming.pullRequestNumber ?? existing.pullRequestNumber,
    runnerOs: measurement.runnerOs,
    durationMs: measurement.durationMs,
    durationSource: measurement.durationSource,
    conclusion: preferKnown(existing.conclusion, incoming.conclusion, UNKNOWN_CONCLUSION),
    // The run started when it started. Taking the earliest of the two claims is
    // order-independent, so the stored value does not depend on delivery race.
    startedAt: incoming.startedAt < existing.startedAt ? incoming.startedAt : existing.startedAt,
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

  private hasResults(runId: number): boolean {
    return this.db.prepare('SELECT 1 FROM test_results WHERE run_id = ? LIMIT 1').get(runId) !== undefined;
  }

  /** Returns how many results were written. */
  private insertResults(runId: number, results: RunIngestPayload['results']): number {
    if (results.length === 0) return 0;

    const statement = this.db.prepare(
      `INSERT INTO test_results (run_id, suite, name, status, duration_ms, failure_message)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    for (const test of results) {
      statement.run(
        runId,
        test.suite,
        test.name,
        test.status,
        Math.max(0, Math.round(test.durationMs)),
        test.failureMessage,
      );
    }

    return results.length;
  }

  /**
   * Record the run's per-job billing rows.
   *
   * Upserted on the provider's job id so an at-least-once webhook redelivery
   * refreshes the numbers rather than doubling the bill.
   */
  private upsertJobs(runId: number, jobs: readonly JobRecord[] | undefined): void {
    if (!jobs || jobs.length === 0) return;

    const statement = this.db.prepare(
      `INSERT INTO run_jobs (run_id, external_id, name, runner_os, duration_ms)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (run_id, external_id) DO UPDATE SET
         name = excluded.name,
         runner_os = excluded.runner_os,
         duration_ms = excluded.duration_ms`,
    );

    for (const job of jobs) {
      statement.run(runId, job.externalId, job.name, job.runnerOs, Math.max(0, Math.round(job.durationMs)));
    }
  }

  private updateRunFacts(runId: number, facts: RunFacts): void {
    this.db
      .prepare(
        `UPDATE runs
         SET workflow_name = ?, branch = ?, pull_request_number = ?, runner_os = ?,
             duration_ms = ?, duration_source = ?, conclusion = ?, started_at = ?
         WHERE id = ?`,
      )
      .run(
        facts.workflowName,
        facts.branch,
        facts.pullRequestNumber,
        facts.runnerOs,
        Math.max(0, Math.round(facts.durationMs)),
        facts.durationSource,
        facts.conclusion,
        facts.startedAt,
        runId,
      );
  }

  /**
   * Persist a run and its test results atomically.
   *
   * The run row is keyed on (repo, provider run id, attempt) and is shared by
   * both producers, so a second write merges facts rather than being dropped —
   * see {@link mergeRunFacts}. Test results are written only once per run:
   * webhooks are delivered at least once and re-uploads happen, and
   * double-counting either would corrupt the ledger.
   */
  recordRun(payload: RunIngestPayload): RecordRunOutcome {
    const insert = this.db.transaction((data: RunIngestPayload): RecordRunOutcome => {
      const repoId = this.upsertRepo(data.repo);
      const { run } = data;

      const result = this.db
        .prepare(
          `INSERT INTO runs (
             repo_id, external_id, workflow_name, run_attempt, commit_sha, branch,
             pull_request_number, runner_os, duration_ms, duration_source, conclusion, started_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          run.durationSource,
          run.conclusion,
          run.startedAt,
        );

      if (result.changes > 0) {
        const runId = Number(result.lastInsertRowid);
        this.upsertJobs(runId, data.jobs);
        return {
          runId,
          inserted: true,
          resultsRecorded: this.insertResults(runId, data.results),
          duplicateResults: false,
        };
      }

      // Already stored — either the other producer got here first, or this is a
      // replay. Merge what it knows into what we have.
      const existing = this.db
        .prepare(
          `SELECT id, external_id, workflow_name, run_attempt, runner_os, duration_ms, duration_source,
                  conclusion, commit_sha, branch, pull_request_number, started_at
           FROM runs WHERE repo_id = ? AND external_id = ? AND run_attempt = ?`,
        )
        .get(repoId, run.externalId, run.runAttempt) as ExistingRunRow | undefined;

      if (!existing) {
        return { runId: -1, inserted: false, resultsRecorded: 0, duplicateResults: false };
      }

      this.updateRunFacts(existing.id, mergeRunFacts(mapRun(existing), run));
      this.upsertJobs(existing.id, data.jobs);

      const alreadyHasResults = this.hasResults(existing.id);
      return {
        runId: existing.id,
        inserted: false,
        resultsRecorded: alreadyHasResults ? 0 : this.insertResults(existing.id, data.results),
        duplicateResults: alreadyHasResults && data.results.length > 0,
      };
    });

    return insert(payload);
  }

  /**
   * Recent observations per test identity, newest first within each test.
   *
   * The per-test window keeps a chatty suite from crowding out a rarely-run
   * one, which a global `LIMIT` would do.
   *
   * The optional `since` bound complements the count: a suite that runs twice a
   * year would otherwise keep a verdict alive on evidence from another era, and
   * a flake list that describes a suite as it used to be is worse than no list.
   */
  recentObservations(repoId: number, windowSize: number, since: string | null = null): Observation[] {
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
           WHERE r.repo_id = ? AND (? IS NULL OR r.started_at >= ?)
         )
         WHERE rn <= ?
         ORDER BY suite, name, started_at ASC, run_attempt ASC`,
      )
      .all(repoId, since, since, windowSize) as ObservationRow[];

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

  /**
   * Load per-job billing rows for exactly the runs given, and attach them.
   *
   * Fetching by run id rather than by repeating the outer query's predicates
   * keeps the job read bounded by the same `LIMIT`: re-running the predicate
   * would pull every job row on the branch and then discard most of them. The
   * placeholder list is generated from the row count, never from caller input,
   * so the statement stays fully parameterised.
   */
  private attachJobs(rows: readonly ExistingRunRow[]): RunRecord[] {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(', ');

    const jobRows = this.db
      .prepare(
        `SELECT run_id, external_id, name, runner_os, duration_ms
         FROM run_jobs
         WHERE run_id IN (${placeholders})`,
      )
      .all(...ids) as JobRow[];

    const byRun = groupJobs(jobRows);
    return rows.map((row) => mapRun(row, byRun.get(row.id) ?? []));
  }

  runsForPullRequest(repoId: number, pullRequestNumber: number): RunRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, external_id, workflow_name, run_attempt, runner_os, duration_ms, duration_source,
                conclusion, commit_sha, branch, pull_request_number, started_at
         FROM runs
         WHERE repo_id = ? AND pull_request_number = ?
         ORDER BY started_at ASC, run_attempt ASC`,
      )
      .all(repoId, pullRequestNumber) as ExistingRunRow[];

    return this.attachJobs(rows);
  }

  /**
   * Most recent runs on a branch.
   *
   * `excludeRetries` is applied in SQL rather than by the caller so the `limit`
   * still yields that many usable runs. The cost baseline sets it: a base
   * branch that retries a lot would otherwise inflate its own baseline and hide
   * the very regressions a PR comparison exists to surface.
   */
  runsForBranch(
    repoId: number,
    branch: string,
    limit: number,
    options: { readonly excludeRetries?: boolean } = {},
  ): RunRecord[] {
    // One of two literal strings, chosen by a boolean: no caller-supplied value
    // reaches the SQL text.
    const attemptFilter = options.excludeRetries === true ? 'AND run_attempt = 1' : '';

    const rows = this.db
      .prepare(
        `SELECT id, external_id, workflow_name, run_attempt, runner_os, duration_ms,
                duration_source, conclusion, commit_sha, branch, pull_request_number, started_at
         FROM runs
         WHERE repo_id = ? AND branch = ? ${attemptFilter}
         ORDER BY started_at DESC, run_attempt DESC
         LIMIT ?`,
      )
      .all(repoId, branch, limit) as ExistingRunRow[];

    return this.attachJobs(rows);
  }

  /**
   * Quarantines currently in force.
   *
   * Expired entries are filtered out rather than deleted: the history of what
   * was quarantined, by whom and when is the audit trail an operator needs when
   * a skipped test turns out to have been hiding a real bug.
   */
  listQuarantined(repoId: number, now: string = new Date().toISOString()): QuarantineEntry[] {
    const rows = this.db
      .prepare(
        `SELECT suite, name, reason, created_by, expires_at, created_at
         FROM quarantines
         WHERE repo_id = ? AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY suite, name`,
      )
      .all(repoId, now) as QuarantineRow[];

    return rows.map((row) => ({
      suite: row.suite,
      name: row.name,
      reason: row.reason,
      createdBy: row.created_by,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  }

  quarantine(
    repoId: number,
    suite: string,
    name: string,
    reason: string | null,
    createdBy: string | null = null,
    expiresAt: string | null = null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO quarantines (repo_id, suite, name, reason, created_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (repo_id, suite, name) DO UPDATE SET
           reason = excluded.reason,
           created_by = excluded.created_by,
           expires_at = excluded.expires_at`,
      )
      .run(repoId, suite, name, reason, createdBy, expiresAt);
  }

  removeQuarantine(repoId: number, suite: string, name: string): boolean {
    const result = this.db
      .prepare('DELETE FROM quarantines WHERE repo_id = ? AND suite = ? AND name = ?')
      .run(repoId, suite, name);
    return result.changes > 0;
  }
}
