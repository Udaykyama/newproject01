import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Open (and migrate) the SQLite database.
 *
 * Pass `:memory:` for tests. Any other path has its parent directory created
 * on demand so a fresh checkout can boot without a setup step.
 */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  db.pragma('foreign_keys = ON');

  // schema.sql is copied next to the compiled JS by the build step, and sits
  // beside the source when running through tsx.
  const schema = readFileSync(join(HERE, 'schema.sql'), 'utf8');
  db.exec(schema);

  return db;
}
