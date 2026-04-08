/**
 * Wendet ausstehende SQL-Migrationen aus ./drizzle auf data/parkour.db an.
 * Auf dem VPS nach git pull ausführen, wenn die App HTTP 500 wirft (z. B. "no such column: deleted").
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { resetUsersTableColumnCache } from '$lib/server/usersTableColumns';
import { resetSpotsTableColumnCache } from '$lib/server/spotsTableColumns';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const DB_PATH = './data/parkour.db';
const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

function tableExists(name: string): boolean {
	return !!sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`).get(name);
}

function columnExists(table: string, column: string): boolean {
	if (!tableExists(table)) return false;
	const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	return cols.some((c) => c.name === column);
}

function fileHash(path: string): string {
	const content = readFileSync(path, 'utf8');
	return createHash('sha256').update(content).digest('hex');
}

function repairLegacyMigrationDrift() {
	if (!tableExists('__drizzle_migrations')) return;

	type Journal = {
		entries: { when: number; tag: string }[];
	};
	const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8')) as Journal;
	const appliedRows = sqlite
		.prepare(`SELECT hash FROM __drizzle_migrations`)
		.all() as { hash: string }[];
	const applied = new Set(appliedRows.map((r) => r.hash));

	const candidates = [
		{
			tag: '0002_training_opt_in',
			schemaAlreadyThere: () =>
				columnExists('users', 'training_attendance') && tableExists('training_session_rsvp')
		},
		{
			tag: '0003_auto_absent_weekdays',
			schemaAlreadyThere: () =>
				columnExists('users', 'auto_absent_weekdays') && tableExists('training_session_weekday_override')
		},
		{
			tag: '0004_user_deleted',
			schemaAlreadyThere: () => columnExists('users', 'deleted')
		},
		{
			tag: '0005_session_version',
			schemaAlreadyThere: () => columnExists('users', 'session_version')
		},
		{
			tag: '0006_spots_deleted',
			schemaAlreadyThere: () => columnExists('spots', 'deleted')
		}
	];

	for (const c of candidates) {
		const hash = fileHash(`./drizzle/${c.tag}.sql`);
		if (applied.has(hash)) continue;
		if (!c.schemaAlreadyThere()) continue;
		const entry = journal.entries.find((e) => e.tag === c.tag);
		if (!entry) continue;
		sqlite
			.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
			.run(hash, entry.when);
		console.log(`Drift-Reparatur: ${c.tag} als angewendet markiert.`);
	}
}

repairLegacyMigrationDrift();

const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: './drizzle' });
resetUsersTableColumnCache();
resetSpotsTableColumnCache();
sqlite.close();
console.log('Drizzle-Migrationen abgeschlossen.');
