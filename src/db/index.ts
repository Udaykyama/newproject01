import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Columns added after the initial schema shipped.
 *
 * `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so it cannot alter a database
 * that already exists — and SQLite has no `ADD COLUMN IF NOT EXISTS`. Each
 * entry is probed first and applied only when missing, which makes startup
 * idempotent. Every string here is a literal: no caller-supplied value is ever
 * interpolated into these statements.
 */
const COLUMN_MIGRATIONS: readonly { probe: string; column: string; sql: string }[] = [
  {
    probe: 'table_info(runs)',
    column: 'duration_source',
    sql: "ALTER TABLE runs ADD COLUMN duration_source TEXT NOT NULL DEFAULT 'reported'",
  },
  {
    probe: 'table_info(quarantines)',
    column: 'created_by',
    sql: 'ALTER TABLE quarantines ADD COLUMN created_by TEXT',
  },
  {
    probe: 'table_info(quarantines)',
    column: 'expires_at',
    sql: 'ALTER TABLE quarantines ADD COLUMN expires_at TEXT',
  },
];

function applyColumnMigrations(db: Db): void {
  for (const migration of COLUMN_MIGRATIONS) {
    const columns = db.pragma(migration.probe) as { name: string }[];
    if (columns.some((column) => column.name === migration.column)) continue;
    db.exec(migration.sql);
  }
}

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
  applyColumnMigrations(db);

  return db;
}
