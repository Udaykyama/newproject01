import type { Config } from './config.js';
import type { Store } from './db/store.js';
import type { GitHubClient } from './github/client.js';

/** Shared services handed to the HTTP routes and webhook handlers. */
export interface AppContext {
  readonly config: Config;
  readonly store: Store;
  /** Null when no GitHub App credentials are configured. */
  readonly github: GitHubClient | null;
}
