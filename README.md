# ci-ledger

**Flaky-test detection and CI cost attribution, delivered as a single GitHub App.**

Every pull request gets one comment that answers two questions nobody can answer today:

> **This PR cost $2.41 in CI, +38% vs `main`.**
> **$0.84 of that was wasted re-running one flaky test.**

> **This repository holds two unrelated things.** Everything outside
> [`ai-ops-hyderabad/`](ai-ops-hyderabad/) is `ci-ledger`, the product. That folder is a
> business plan for an unrelated consultancy, kept here only because it had nowhere else to go;
> it is self-contained and carries [its own extraction
> instructions](ai-ops-hyderabad/README.md#how-to-move-this-into-its-own-repository). Splitting
> it out is a prerequisite for anyone doing diligence on either.

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
            │  ← results, attempt, sha        │ ← run_attempt, per-job timings
            ▼                                 ▼
      ┌───────────────────────────────────────────────┐
      │  Express API  ·  HMAC-verified webhook route   │
      └───────────────────────┬───────────────────────┘
                              │  both producers write the *same* run row,
                              ▼  merged by provenance (see Cost model)
                  ┌───────────────────────┐
                  │  SQLite  (runs,       │
                  │  run_jobs,            │
                  │  test_results,        │
                  │  quarantines)         │
                  └───────────┬───────────┘
                              ▼
          ┌───────────────────────────────────────┐
          │  analysis/flaky.ts   contradiction +  │
          │                      flip rate +      │
          │                      Wilson bound     │
          │  analysis/cost.ts    per-job pricing, │
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
    schema.sql         Fact tables + repo dimension
    index.ts           Connection, pragmas, additive column migrations
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
# Capture the start time first, so the upload can report a measured duration.
- name: Record the start time
  run: echo "RUN_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" >> "$GITHUB_ENV"

- name: Run tests
  run: npm test -- --reporter=junit --outputFile.junit=reports/junit.xml

- name: Upload test results to ci-ledger
  if: always()
  run: |
    node -e '
      const fs = require("fs");
      const xml = fs.readFileSync("reports/junit.xml", "utf8");
      const startedAt = process.env.RUN_STARTED_AT;
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
            runnerOs: process.env.RUNNER_OS.toLowerCase(),
            durationMs: Date.now() - Date.parse(startedAt),
            startedAt,
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

This repository runs exactly this path against itself — see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) and the reusable
[`report-to-ci-ledger`](.github/actions/report-to-ci-ledger/action.yml) action.

`GITHUB_RUN_ATTEMPT` is the important field: without it, contradictions can never be observed
and every verdict degrades to a statistical guess.

Do **not** send `durationMs: 0`. A zero is not a measurement, and a run priced from it lands on
the one-minute floor. Measuring the elapsed time of the uploading job, as above, is a real
number even though it misses work done in sibling jobs; the PR comment labels any figure
derived this way as an estimate. Installing the GitHub App replaces it: the
`workflow_run.completed` webhook supplies per-job billing data, which is priced exactly and
overwrites the weaker measurement.

---

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/healthz` | — | Liveness probe |
| `POST` | `/webhooks/github` | HMAC signature | `workflow_run.completed` ingestion |
| `POST` | `/v1/ingest/junit` | Ingest token | Upload a run + JUnit XML (or normalised results) |
| `GET` | `/v1/repos/:owner/:repo/flaky` | Read token* | Ranked flake list (`?includeStable=true`, `?limit=`, `?offset=`) |
| `GET` | `/v1/repos/:owner/:repo/pulls/:n/report` | Read token* | Cost + flake report (`?format=markdown`) |
| `POST` | `/v1/repos/:owner/:repo/quarantine` | Ingest token | Quarantine a test |
| `DELETE` | `/v1/repos/:owner/:repo/quarantine` | Ingest token | Lift a quarantine |

\* Only when `REQUIRE_READ_AUTH=true`. See [Read tokens](#read-tokens).

Ingestion is **idempotent** on `(repo, run id, attempt)`: test results are written once and
only once per run, because webhooks are delivered at least once and double-counting would
corrupt the cost ledger. The `duplicate` flag in the response means *these results were already
recorded*, not merely that a row with this key exists — the webhook writes the same row to carry
duration, so the two must not be conflated.

The flake list is paginated. `limit` defaults to `READ_DEFAULT_PAGE_SIZE` (100) and is capped at
`READ_MAX_PAGE_SIZE` (500); the response carries `total`, `limit` and `offset`.

---

## Cost model

Cost is `ceil(duration ÷ 60s) × rate[runner OS]`, matching how GitHub bills: whole minutes,
rounded up, **per job**. A run with one 30-second macOS job and one 30-second Linux job costs a
full minute of each — not two minutes of whichever ran longer.

| Runner | Default rate (USD/min) | Override |
| --- | --- | --- |
| Linux | `0.008` | `RATE_LINUX_USD_PER_MIN` |
| Windows | `0.016` | `RATE_WINDOWS_USD_PER_MIN` |
| macOS | `0.080` | `RATE_MACOS_USD_PER_MIN` |

The baseline is computed **per workflow**: each workflow the PR triggered is compared to the
median cost of that same workflow on the base branch, and the results are summed. Comparing
against a repo-wide median would let a nightly heavy job inflate the number for every PR that
never triggers it. Median rather than mean, because CI durations are heavily right-skewed — one
timed-out six-hour run would drag an average far above a typical build.

Re-run attempts are excluded from the baseline sample. A base branch that retries a lot would
otherwise inflate its own baseline and hide the regressions the comparison exists to surface.

### Where the duration comes from

Both the ingest endpoint and the `workflow_run.completed` webhook write the same run row, and
they know different things: ingest carries the test results, the webhook carries what GitHub
billed. Neither is discarded. Facts are merged by provenance, strongest wins, and a zero can
never displace a measurement:

| Source | Meaning | Accuracy |
| --- | --- | --- |
| `jobs` | Per-job durations from the GitHub App | Reproduces the invoice |
| `wallclock` | Webhook run wall-clock time | Under-reports parallel jobs |
| `reported` | A duration the uploading CI job asserted | Weakest; misses sibling jobs |

The PR comment states which of these it used whenever the figure is not derived entirely from
job data, so an estimate is always labelled as one.

### Known approximations

- Runs with no job data are priced from a single duration and one runner OS, which
  **under-reports** runs with many parallel jobs. Install the GitHub App to remove this.
- Rates are configured, not fetched. Self-hosted runners and negotiated pricing need
  `RATE_*_USD_PER_MIN` set to match the real invoice.

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run test:ci     # same, plus a JUnit report in reports/junit.xml
npm run build       # tsc + copy schema.sql into dist
npm run dev         # watch mode
```

Tests cover the XML parser, the detection engine, the cost model, the run-row merge between the
two producers, the store's idempotency guarantees, quarantine lifecycle, the comment renderer,
the CLI, webhook signature verification, input validation, response hardening and rate limiting,
and the full HTTP surface end to end over a real socket.

`.github/workflows/ci.yml` runs typecheck, tests and build on every pull request, and uploads
the JUnit report the product itself ingests.

### The flake canary

`test/flake-canary.test.ts` fails about half the time **on purpose**. It is skipped unless
`CI_LEDGER_FLAKE_CANARY=true`, and runs only in its own hourly workflow, never in the required
checks.

It exists because a detector that never fires is indistinguishable from a healthy suite. With a
labelled positive on a real repository, "found no flakes" can be told apart from "found
nothing".

Its labels live in [`test/flake-canary.labels.json`](test/flake-canary.labels.json), and turn
into a measurement:

```bash
ci-ledger precision --repo Udaykyama/newproject01 --labels test/flake-canary.labels.json
```

```
precision 100.0% · recall 100.0% over 2 labelled test(s)
  confirmed-verdict precision: 100.0%
  tp 1 · fp 0 · fn 0 · tn 0
  flagged but unlabelled (not scored): 3
```

*(Shape of the output, not a published result — Milestone 1 is the number, once there is
enough canary history to stand behind it.)*

Three properties keep that number honest:

- Only **labelled** tests are scored. A flagged test nobody labelled is reported as unlabelled,
  never counted as correct — a precision figure that assumes its own findings are right is a
  tautology, not a measurement.
- A label with **no observations** in the window is listed, not counted as a miss. The detector
  is not charged for data that never arrived.
- `flaky_confirmed` is scored **separately**. That verdict rests on a contradiction at a single
  commit, so anything below 100% there is a defect in the detector, not a tuning problem — and
  averaging it together with the statistical guesses would hide exactly that.

### Deployment

```bash
docker build -t ci-ledger .
docker run -p 3000:3000 \
  -v ci-ledger-data:/data \
  -e INGEST_TOKEN=... \
  ci-ledger
```

The database is a **file**, and it holds the run history the product exists to accumulate. It
must live on a volume that outlives the container; the image declares `/data` as a volume and
defaults `DATABASE_PATH` into it so a forgotten mount degrades to an anonymous volume rather
than silent data loss on the next deploy.

### Security notes

- Webhook signatures are verified over the **raw** request body; re-serialised JSON would not
  match what GitHub signed.
- The ingest token is compared in constant time over SHA-256 digests, so neither its contents
  nor its length leak through timing.
- If `INGEST_TOKEN` is unset the ingest endpoint returns `503` rather than running open — an
  unauthenticated ingest endpoint would let anyone poison another repository's statistics.
- Endpoints that verify a secret — the webhook route and the token-authenticated ingest and
  quarantine routes — are rate limited per client IP so the secret cannot be brute-forced. The
  limiter runs *before* authentication. Tune with `RATE_LIMIT_WEBHOOK_PER_MIN` (default 600),
  `RATE_LIMIT_INGEST_PER_MIN` (default 300) and `RATE_LIMIT_READ_PER_MIN` (default 600). The read
  limiter is attached only while `REQUIRE_READ_AUTH=true`, because that is exactly when reads
  begin verifying a secret; an open instance has nothing there to guess.
- Every response sends `X-Content-Type-Options: nosniff`. Test names arrive from untrusted CI
  reports and are echoed back in JSON and markdown, so browsers must not sniff them as HTML.
- Markdown table cells escape backslashes before pipes, so a test name cannot break out of the
  table it is rendered into. The markdown report is served as `text/plain`, since it is comment
  source for an API client rather than a document for a browser to render.
- Repository, branch and commit values from the request are validated against their upstream
  grammars at the edge, so untrusted text is constrained once instead of escaped at each use.
- All SQL is parameterised; no caller-supplied value is ever interpolated into a query.
- Internal error messages are never echoed to clients.

### Read tokens

**Read endpoints are open by default, and that is a single-tenant decision.** For a self-hosted
instance behind a team's own network boundary it is the right trade: no token to distribute for
data the team already owns. It becomes a data leak the moment two tenants share an instance —
test names, failure counts and CI spend would all be readable by anyone who knows the repository
slug.

Set `REQUIRE_READ_AUTH=true` and every read is scoped to a token:

```bash
ci-ledger token mint --scope acme/widgets --label "acme install"
ci-ledger token mint --scope acme                # every repository under the owner
ci-ledger token list
ci-ledger token revoke --id 3
```

- Scoping is enforced **on the path**, not in a filter a query could forget: `:owner/:repo` is
  already the address of every read endpoint, so a token that does not cover the path cannot
  reach the data behind it.
- A token scoped to an owner alone covers every repository under it, which is what an
  organisation-wide App installation grants.
- Only the **SHA-256 digest** is stored, and the lookup is keyed on it. A stolen database yields
  no working credentials, and no comparison is ever made over the secret itself.
- A mis-scoped request is refused from the token's scope and the caller's own path, without
  consulting the database — so the refusal cannot disclose whether that repository exists here.
- Tokens are **revoked, not deleted**: "who could read this, and until when" stays answerable
  after an incident.
- The ingest token is accepted for reads too. It can already write every repository on the
  instance, so withholding read access from it would protect nothing.
- Revoking a token is immediate; there is no cache to expire.

---

## Roadmap

**Milestone 1 — prove the wedge on one real repository (this codebase).** In progress: CI runs
on every PR, emits JUnit and self-ingests; the flake canary supplies a labelled positive and a
control; `ci-ledger precision` turns those labels into a number. What remains is accumulating
enough canary history for that number to mean something.

**Milestone 2 — the GitHub App install.** Marketplace listing, per-installation storage,
one-click onboarding. This is the distribution moat. The authentication half of the blocker is
now closed — read endpoints take repository-scoped tokens (see [Read tokens](#read-tokens)) and
the container image and persistent-volume story are in place. What remains is Postgres for a
shared instance, and the listing itself.

**Milestone 3 — auto-quarantine.** Open a PR that skips a confirmed flake and files a tracking
issue. This converts the tool from a report into an action, which is what people pay for.

**Milestone 4 — charge from the first user.** Free users teach you nothing about acquirability.
Pricing is **per repository**, not per seat: the buyer is whoever owns the CI bill, and the
tool already computes the number that justifies the price. A repository shown $800/month of
flake-induced waste does not haggle over $99–$199/month. Two buyers, one install — cost
attribution sells to the engineering manager, quarantine sells to the developers.

Deferred deliberately: Postgres, a web dashboard, and non-GitHub CI providers. JUnit already
makes a new *language* free; a new CI *provider* costs real engineering, so it waits for a
paying user to ask. None of them are needed to prove the wedge, and all are cheap afterwards.

---

## Licence

MIT
