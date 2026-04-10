import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { resolveSqlitePathForApp } from './sqlitePath';

/** Siehe `sqlitePath.ts`: optional `PARKOUR_DATABASE_PATH`, sonst `process.cwd()/data/parkour.db`. */
const DB_PATH = resolveSqlitePathForApp();

const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
	mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

/** Direkter SQLite-Zugriff für Legacy-Abfragen (fehlende Spalten `deleted` / `session_version`). */
export { sqlite as sqliteDb };
