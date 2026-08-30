/**
 * Central configuration, resolved once from the environment.
 *
 * Everything is readable without credentials so the analysis engine and CLI
 * stay usable offline; only the GitHub-facing paths demand real secrets, and
 * they assert their own requirements at the point of use.
 */

export interface CostRates {
  /** USD per billable minute, keyed by normalised runner OS. */
  readonly linux: number;
  readonly windows: number;
  readonly macos: number;
}

export interface FlakeTuning {
  /** Minimum observations before statistics alone may label a test flaky. */
  readonly minRuns: number;
  /** Minimum pass/fail flip rate (0-1) required for a statistical verdict. */
  readonly flipRateThreshold: number;
  /** How many recent results per test are considered. */
  readonly windowSize: number;
  /** How many days back evidence stays relevant; 0 disables the time bound. */
  readonly windowDays: number;
}

export interface RateLimits {
  /** Max webhook deliveries accepted per client IP per minute. */
  readonly webhookPerMinute: number;
  /** Max authenticated ingest/quarantine requests per client IP per minute. */
  readonly ingestPerMinute: number;
  /** Max token-checked read requests per client IP per minute. */
  readonly readPerMinute: number;
}

/** Bounds on how much a single read endpoint will return. */
export interface ReadLimits {
  readonly defaultPageSize: number;
  readonly maxPageSize: number;
  /**
   * Whether read endpoints demand a scoped token.
   *
   * Off by default, because a self-hosted single-tenant instance owns every
   * repository it holds and a token would be ceremony. It must be on for any
   * instance serving more than one tenant: test names, failure counts and CI
   * spend are otherwise readable by anyone who can guess a repository slug.
   */
  readonly requireAuth: boolean;
}

export interface Config {
  readonly port: number;
  readonly databasePath: string;
  readonly githubAppId: string | undefined;
  readonly githubPrivateKey: string | undefined;
  readonly webhookSecret: string | undefined;
  readonly ingestToken: string | undefined;
  readonly postPrComments: boolean;
  readonly rates: CostRates;
  readonly flake: FlakeTuning;
  readonly limits: RateLimits;
  readonly reads: ReadLimits;
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * GitHub App private keys are PEM blobs. Environments that cannot hold real
 * newlines (Heroku, Fly secrets, GitHub Actions inputs) commonly escape them
 * as `\n`, so accept both forms.
 */
function normalisePrivateKey(value: string | undefined): string | undefined {
  const key = str(value);
  return key ? key.replace(/\\n/g, '\n') : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: num(env.PORT, 3000),
    databasePath: str(env.DATABASE_PATH) ?? './data/ci-ledger.db',
    githubAppId: str(env.GITHUB_APP_ID),
    githubPrivateKey: normalisePrivateKey(env.GITHUB_APP_PRIVATE_KEY),
    webhookSecret: str(env.GITHUB_WEBHOOK_SECRET),
    ingestToken: str(env.INGEST_TOKEN),
    postPrComments: str(env.POST_PR_COMMENTS)?.toLowerCase() === 'true',
    rates: {
      linux: num(env.RATE_LINUX_USD_PER_MIN, 0.008),
      windows: num(env.RATE_WINDOWS_USD_PER_MIN, 0.016),
      macos: num(env.RATE_MACOS_USD_PER_MIN, 0.08),
    },
    flake: {
      minRuns: Math.max(2, Math.trunc(num(env.FLAKE_MIN_RUNS, 5))),
      flipRateThreshold: num(env.FLAKE_FLIP_RATE_THRESHOLD, 0.15),
      windowSize: Math.max(2, Math.trunc(num(env.FLAKE_WINDOW_SIZE, 50))),
      windowDays: Math.max(0, num(env.FLAKE_WINDOW_DAYS, 90)),
    },
    reads: {
      defaultPageSize: Math.max(1, Math.trunc(num(env.READ_DEFAULT_PAGE_SIZE, 100))),
      maxPageSize: Math.max(1, Math.trunc(num(env.READ_MAX_PAGE_SIZE, 500))),
      requireAuth: str(env.REQUIRE_READ_AUTH)?.toLowerCase() === 'true',
    },
    limits: {
      webhookPerMinute: Math.max(1, Math.trunc(num(env.RATE_LIMIT_WEBHOOK_PER_MIN, 600))),
      ingestPerMinute: Math.max(1, Math.trunc(num(env.RATE_LIMIT_INGEST_PER_MIN, 300))),
      readPerMinute: Math.max(1, Math.trunc(num(env.RATE_LIMIT_READ_PER_MIN, 600))),
    },
  };
}

export const DEFAULT_CONFIG = loadConfig({});
