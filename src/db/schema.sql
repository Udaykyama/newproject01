-- ci-ledger schema
--
-- Deliberately small: two fact tables (runs, test results) plus a repo
-- dimension. Every analytical question in v1 is answerable from these, and a
-- single-file SQLite database keeps the app deployable with zero infra.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS repositories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner       TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner, name)
);

CREATE TABLE IF NOT EXISTS runs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id             INTEGER NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  external_id         TEXT NOT NULL,
  workflow_name       TEXT NOT NULL,
  run_attempt         INTEGER NOT NULL DEFAULT 1,
  commit_sha          TEXT NOT NULL,
  branch              TEXT NOT NULL,
  pull_request_number INTEGER,
  runner_os           TEXT NOT NULL,
  duration_ms         INTEGER NOT NULL,
  -- Provenance of duration_ms: 'jobs' (per-job billing data), 'wallclock'
  -- (the run's elapsed span) or 'reported' (whatever the uploader claimed).
  -- The two writers of this row measure differently, so the better measurement
  -- has to be identifiable when they disagree.
  duration_source     TEXT NOT NULL DEFAULT 'reported',
  conclusion          TEXT NOT NULL,
  started_at          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  -- A provider run id plus attempt is unique; re-delivered webhooks and
  -- retried uploads must not double-count cost.
  UNIQUE (repo_id, external_id, run_attempt)
);

CREATE INDEX IF NOT EXISTS idx_runs_repo_pr ON runs (repo_id, pull_request_number);
CREATE INDEX IF NOT EXISTS idx_runs_repo_branch_started ON runs (repo_id, branch, started_at);
CREATE INDEX IF NOT EXISTS idx_runs_repo_sha ON runs (repo_id, commit_sha);

CREATE TABLE IF NOT EXISTS test_results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  suite           TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  failure_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_results_run ON test_results (run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_identity ON test_results (suite, name);

-- Per-job billing rows. The job, not the run, is what GitHub charges for, and
-- one run's jobs can span operating systems whose rates differ by 10x — so the
-- breakdown has to survive if the cost figure is to reproduce the invoice.
CREATE TABLE IF NOT EXISTS run_jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  runner_os   TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  UNIQUE (run_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_run_jobs_run ON run_jobs (run_id);

-- Read tokens, scoped to one owner and optionally one repository.
--
-- Read endpoints answer with test names, failure counts and CI spend, so a
-- shared instance cannot serve them unauthenticated. Only the SHA-256 digest is
-- stored: a stolen database must not yield working credentials, and the digest
-- is what the lookup is keyed on so no comparison over the secret is needed.
-- `scope_repo IS NULL` means every repository under `scope_owner`, which is
-- what a GitHub App installed on an organisation grants.
CREATE TABLE IF NOT EXISTS api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_digest TEXT NOT NULL UNIQUE,
  scope_owner  TEXT NOT NULL,
  scope_repo   TEXT,
  label        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_scope ON api_tokens (scope_owner, scope_repo);

-- Tests an operator has explicitly quarantined. Kept separate from detection
-- so an automated verdict never silently overrides a human decision.
CREATE TABLE IF NOT EXISTS quarantines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id    INTEGER NOT NULL REFERENCES repositories (id) ON DELETE CASCADE,
  suite      TEXT NOT NULL,
  name       TEXT NOT NULL,
  reason     TEXT,
  -- Who asked for the quarantine, and when it stops applying. A quarantine
  -- with no owner and no end date is how a skipped test becomes permanent.
  created_by TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (repo_id, suite, name)
);
