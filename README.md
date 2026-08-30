# ci-ledger

**Flaky-test detection and CI cost attribution, delivered as a single GitHub App.**

Every pull request gets one comment that answers two questions nobody can answer today:

> **This PR cost $2.41 in CI, +38% vs `main`.**
> **$0.84 of that was wasted re-running one flaky test.**

---

## Why this project

This repository implements the recommendation from the project-selection plan: of all the
candidate ideas, this one scores highest on the criteria that actually make a project
acquirable.

| Criterion | How this project satisfies it |
| --- | --- |
| **Distribution** | Ships as a GitHub App. GitHub Marketplace is the install channel — no cold-start audience problem. |
| **Proprietary data** | Cross-repo test-stability signals compound with every run ingested and cannot be scraped. |
| **Hard wedge** | Flake detection that is *provably* correct (see below) rather than a noisy failure list. |
| **Revenue** | The ROI pitch is a dollar figure the tool itself computes: wasted CI spend. |
| **Named acquirers** | GitHub, CircleCI, Buildkite, Datadog, Sentry, Datadog CI Visibility, BuildPulse, Trunk.io. |

### The technical wedge, stated precisely

Most "flaky test" tooling reports every test that has ever failed. That list is useless,
because most failures are real. `ci-ledger` separates three populations that other tools
conflate:

1. **Genuinely non-deterministic tests** — worth quarantining.
2. **Broken tests** that fail every single time — not flaky, just red.
3. **Real regressions** — the test is doing its job.

The strongest available evidence is a **contradiction**: the same test, at the *same commit*,
both passing and failing. The code did not change between those two observations, so the test
itself must be non-deterministic. That is a proof, not a heuristic — and it is why ingesting
re-run attempts (`run_attempt`) matters so much.

Where no contradiction exists, we fall back to statistics over the test's recent history and
label the verdict `flaky_suspected`, so a human can tell a guess from a proof.

| Verdict | Meaning |
| --- | --- |
| `flaky_confirmed` | Passed and failed on the same commit. Non-determinism proven. |
| `flaky_suspected` | Outcome flips too often across history to be a real regression. |
| `consistently_failing` | Fails every run — broken, not flaky. |
| `stable` | No evidence of a problem. |

Scores are ranked so a confirmed flake always outranks any statistical guess.

### Why the cost number is deliberately conservative

A re-run is charged to flakiness **only** when the attempt before it failed *exclusively* on
tests already known to be flaky. If any genuine failure was present, the re-run would have
been necessary anyway, and claiming it would overstate the savings.

An ROI claim that survives a procurement conversation is worth more than a bigger one that
does not.

---

## Architecture

```
      GitHub Actions                       GitHub
            │                                 │
   JUnit XML│(POST /v1/ingest/junit)          │ workflow_run.completed
            │  ← run duration, attempt, sha   │ ← run_attempt, timings, jobs
            ▼                                 ▼
      ┌───────────────────────────────────────────────┐
      │  Express API  ·  HMAC-verified webhook route   │
      └───────────────────────┬───────────────────────┘
                              ▼
                  ┌───────────────────────┐
                  │  SQLite  (runs,       │
                  │  test_results,        │
                  │  quarantines)         │
                  └───────────┬───────────┘
                              ▼
          ┌───────────────────────────────────────┐
          │  analysis/flaky.ts   contradiction +  │
          │                      flip rate +      │
          │                      Wilson bound     │
          │  analysis/cost.ts    per-run pricing, │
          │                      baseline delta,  │
          │                      flake waste      │
          └───────────────────┬───────────────────┘
                              ▼
                  PR comment  ·  JSON API  ·  CLI
```

### Stack, and why

| Choice | Rationale |
| --- | --- |
| **Node 22 + TypeScript** | The GitHub App ecosystem (Octokit, webhooks) is first-class in JS, and strict types matter for a billing calculation. |
| **SQLite** (`better-sqlite3`) | Zero infra to self-host, which is the fastest path to a first user. The schema ports to Postgres unchanged when multi-tenancy demands it. |
| **Express 5** | Native async error handling; nothing exotic needed for four routes. |
| **`fast-xml-parser`** | JUnit XML is the one format every test runner emits, so a new language costs zero engineering. |
| **Vitest** | Fast, no transpile config, and this project is fundamentally about tests. |

### Layout

```
src/
  config.ts            Environment → typed config
  types.ts             Shared domain types
  server.ts            Express app; raw-body webhook route
  cli.ts               Local CLI (ingest / flaky / report)
  db/
    schema.sql         Two fact tables + repo dimension
    store.ts           All SQL, fully parameterised
  ingest/junit.ts      JUnit XML → normalised results (validated)
  analysis/
    flaky.ts           Detection engine
    cost.ts            Pricing, baselines, waste attribution
    report.ts          Joins flakes + cost for a PR
  github/
    client.ts          App auth, job-level billing, comment upsert
    comment.ts         Markdown renderer
    webhooks.ts        workflow_run.completed handler
  api/
    routes.ts          HTTP endpoints
    auth.ts            Timing-safe bearer auth
    validate.ts        Input validation for untrusted payloads
```

---

## Quick start

The fastest path to value needs **no GitHub App and no hosted service** — run it against your
own CI artifacts locally.

```bash
npm install
npm run build

# Ingest two attempts of the same run: attempt 1 failed, attempt 2 passed.
node dist/src/cli.js ingest --repo acme/widgets --sha deadbeef \
  --run-id 900 --attempt 1 --pr 7 --duration 600000 ./reports/attempt-1

node dist/src/cli.js ingest --repo acme/widgets --sha deadbeef \
  --run-id 900 --attempt 2 --pr 7 --duration 600000 ./reports/attempt-2

node dist/src/cli.js flaky  --repo acme/widgets
node dist/src/cli.js report --repo acme/widgets --pr 7 --markdown
```

```
100  flaky_confirmed      Suite › wobbly
      1/2 failed · flip rate 100% · 1 contradictory commit(s)
```

Paths may be JUnit XML files or directories, which are scanned recursively.

### Run the service

```bash
cp .env.example .env      # then fill in the values you need
npm run dev               # or: npm start
```

Only `INGEST_TOKEN` is required to accept uploads. GitHub credentials are optional — without
them the analysis engine, HTTP API and CLI all still work.

### Upload from GitHub Actions

```yaml
- name: Upload test results to ci-ledger
  if: always()
  run: |
    node -e '
      const fs = require("fs");
      const xml = fs.readFileSync("junit.xml", "utf8");
      fetch(process.env.LEDGER_URL + "/v1/ingest/junit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + process.env.LEDGER_TOKEN,
        },
        body: JSON.stringify({
          repo: process.env.GITHUB_REPOSITORY,
          run: {
            externalId: process.env.GITHUB_RUN_ID,
            runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
            commitSha: process.env.GITHUB_SHA,
            branch: process.env.GITHUB_REF_NAME,
            workflowName: process.env.GITHUB_WORKFLOW,
            runnerOs: "linux",
            durationMs: 0,
            conclusion: process.env.JOB_STATUS,
          },
          junitXml: xml,
        }),
      }).then((r) => process.exit(r.ok ? 0 : 1));
    '
  env:
    LEDGER_URL: ${{ vars.LEDGER_URL }}
    LEDGER_TOKEN: ${{ secrets.LEDGER_TOKEN }}
    JOB_STATUS: ${{ job.status }}
```

`GITHUB_RUN_ATTEMPT` is the important field: without it, contradictions can never be observed
and every verdict degrades to a statistical guess.

`durationMs` may be left at `0` in this snippet — a job cannot easily measure its own total
runtime. Install the GitHub App and the `workflow_run.completed` webhook supplies accurate
per-job timings automatically, which is what the cost figures are built from.

---

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/healthz` | — | Liveness probe |
| `POST` | `/webhooks/github` | HMAC signature | `workflow_run.completed` ingestion |
| `POST` | `/v1/ingest/junit` | Ingest token | Upload a run + JUnit XML (or normalised results) |
| `GET` | `/v1/repos/:owner/:repo/flaky` | — | Ranked flake list (`?includeStable=true`) |
| `GET` | `/v1/repos/:owner/:repo/pulls/:n/report` | — | Cost + flake report (`?format=markdown`) |
| `POST` | `/v1/repos/:owner/:repo/quarantine` | Ingest token | Quarantine a test |
| `DELETE` | `/v1/repos/:owner/:repo/quarantine` | Ingest token | Lift a quarantine |

Ingestion is **idempotent** on `(repo, run id, attempt)`. Webhooks are delivered at least once,
and double-counting would corrupt the cost ledger.

---

## Cost model

Cost is `ceil(duration ÷ 60s) × rate[runner OS]`, matching how GitHub bills: whole minutes,
rounded up, per job.

| Runner | Default rate (USD/min) | Override |
| --- | --- | --- |
| Linux | `0.008` | `RATE_LINUX_USD_PER_MIN` |
| Windows | `0.016` | `RATE_WINDOWS_USD_PER_MIN` |
| macOS | `0.080` | `RATE_MACOS_USD_PER_MIN` |

The baseline is the **median** run cost on the base branch, scaled to the number of runs the PR
triggered. Median rather than mean, because CI durations are heavily right-skewed — one
timed-out six-hour run would drag an average far above a typical build.

### Known approximations

- When webhook job data is available, per-job durations are summed (accurate). Without it, run
  wall-clock time is used, which **under-reports** runs with many parallel jobs.
- A run whose jobs span multiple operating systems is priced at whichever OS consumed the most
  time. Splitting cost per job is the natural next increment.

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run  (164 tests)
npm run build       # tsc + copy schema.sql into dist
npm run dev         # watch mode
```

Tests cover the XML parser, the detection engine, the cost model, the store's idempotency
guarantees, the comment renderer, webhook signature verification, input validation, response
hardening and rate limiting, and the full HTTP surface end to end over a real socket.

### Security notes

- Webhook signatures are verified over the **raw** request body; re-serialised JSON would not
  match what GitHub signed.
- The ingest token is compared in constant time over SHA-256 digests, so neither its contents
  nor its length leak through timing.
- If `INGEST_TOKEN` is unset the ingest endpoint returns `503` rather than running open — an
  unauthenticated ingest endpoint would let anyone poison another repository's statistics.
- Endpoints that verify a secret — the webhook route and the token-authenticated ingest and
  quarantine routes — are rate limited per client IP so the secret cannot be brute-forced. The
  limiter runs *before* authentication. Tune with `RATE_LIMIT_WEBHOOK_PER_MIN` (default 600) and
  `RATE_LIMIT_INGEST_PER_MIN` (default 300). Unauthenticated read endpoints are not limited,
  since they carry no secret to guess.
- Every response sends `X-Content-Type-Options: nosniff`. Test names arrive from untrusted CI
  reports and are echoed back in JSON and markdown, so browsers must not sniff them as HTML.
- Markdown table cells escape backslashes before pipes, so a test name cannot break out of the
  table it is rendered into. The markdown report is served as `text/plain`, since it is comment
  source for an API client rather than a document for a browser to render.
- Repository, branch and commit values from the request are validated against their upstream
  grammars at the edge, so untrusted text is constrained once instead of escaped at each use.
- All SQL is parameterised; no caller-supplied value is ever interpolated into a query.
- Internal error messages are never echoed to clients.

---

## Roadmap

**Milestone 1 — prove the wedge on one real repository (this codebase).** Ingest a month of
history from a repo with a known-flaky suite and confirm the detector finds the flakes the team
already knows about, without flagging real regressions. If precision is poor here, nothing else
matters.

**Milestone 2 — the GitHub App install.** Marketplace listing, per-installation storage,
one-click onboarding. This is the distribution moat.

**Milestone 3 — auto-quarantine.** Open a PR that skips a confirmed flake and files a tracking
issue. This converts the tool from a report into an action, which is what people pay for.

**Milestone 4 — charge from the first user.** Free users teach you nothing about acquirability.

Deferred deliberately: multi-tenancy, Postgres, a web dashboard, and non-GitHub CI providers.
None of them are needed to prove the wedge, and all of them are cheap to add afterwards.

---

## Licence

MIT
