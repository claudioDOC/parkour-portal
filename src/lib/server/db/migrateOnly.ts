/**
 * Wendet ausstehende SQL-Migrationen aus ./drizzle auf data/parkour.db an.
 * Auf dem VPS nach git pull ausführen, wenn die App HTTP 500 wirft (z. B. "no such column: deleted").
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { resetUsersTableColumnCache } from '$lib/server/usersTableColumns';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = './data/parkour.db';
const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: './drizzle' });
resetUsersTableColumnCache();
sqlite.close();
console.log('Drizzle-Migrationen abgeschlossen.');
