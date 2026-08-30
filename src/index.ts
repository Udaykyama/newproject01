import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { Store } from './db/store.js';
import { GitHubClient } from './github/client.js';
import { createServer } from './server.js';
import type { AppContext } from './context.js';

function main(): void {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);

  const context: AppContext = {
    config,
    store: new Store(db),
    github: GitHubClient.fromConfig(config),
  };

  const app = createServer(context);
  const server = app.listen(config.port, () => {
    console.log(`ci-ledger listening on :${config.port}`);
    if (!config.webhookSecret) {
      console.warn('GITHUB_WEBHOOK_SECRET is unset — the webhook endpoint is disabled.');
    }
    if (!context.github) {
      console.warn('GitHub App credentials are unset — PR comments are disabled.');
    }
  });

  // Close the database explicitly so WAL data is checkpointed on shutdown.
  const shutdown = (signal: string): void => {
    console.log(`received ${signal}, shutting down`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
