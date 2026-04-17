/**
 * Wendet ausstehende SQL-Migrationen aus `drizzle/` auf die SQLite-Datei an.
 * Pfad: `PARKOUR_DATABASE_PATH` oder fest das Repo-`data/parkour.db` (nicht abhängig vom Shell-cwd).
 * Auf dem VPS nach git pull ausführen, wenn die App HTTP 500 wirft (z. B. "no such column: deleted").
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { resetUsersTableColumnCache } from '$lib/server/usersTableColumns';
import { resetSpotsTableColumnCache } from '$lib/server/spotsTableColumns';
import { resetTripPlansTableColumnCache } from '$lib/server/tripPlansTableColumns';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { drizzleFolderForCli, resolveSqlitePathForCli, SQLITE_PATH_ENV } from './sqlitePath';

const DB_PATH = resolveSqlitePathForCli(import.meta.url);
const DRIZZLE_DIR = drizzleFolderForCli(import.meta.url);
const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

console.log(`[db:migrate] SQLite-Datei: ${DB_PATH}`);
if (!process.env[SQLITE_PATH_ENV]?.trim()) {
	console.log(
		`[db:migrate] App-Prozess nutzt cwd/data/parkour.db — bei abweichendem WorkingDirectory bitte ${SQLITE_PATH_ENV} setzen (README).`
	);
}

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
	const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8')) as Journal;
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
		},
		{
			tag: '0008_spot_challenges_soft_delete',
			schemaAlreadyThere: () =>
				columnExists('spot_challenges', 'deleted') && columnExists('spot_challenges', 'deleted_at')
		},
		{
			tag: '0009_spots_microspots',
			schemaAlreadyThere: () =>
				columnExists('spots', 'is_micro') && columnExists('spots', 'parent_spot_id')
		},
		{
			tag: '0010_spot_parking_locations',
			schemaAlreadyThere: () =>
				tableExists('spot_parking_locations') &&
				columnExists('spot_parking_locations', 'spot_id') &&
				columnExists('spot_parking_locations', 'latitude') &&
				columnExists('spot_parking_locations', 'longitude')
		},
		{
			tag: '0011_trip_plans',
			schemaAlreadyThere: () =>
				tableExists('trip_plans') &&
				tableExists('trip_participants') &&
				tableExists('trip_destinations') &&
				tableExists('trip_destination_votes')
		},
		{
			tag: '0012_trip_transport_modes',
			schemaAlreadyThere: () =>
				columnExists('trip_participants', 'transport_mode') &&
				columnExists('trip_participants', 'vehicle_from')
		},
		{
			tag: '0013_trip_plans_soft_delete',
			schemaAlreadyThere: () =>
				columnExists('trip_plans', 'deleted') && columnExists('trip_plans', 'deleted_at')
		},
		{
			tag: '0014_trip_map',
			schemaAlreadyThere: () =>
				columnExists('trip_plans', 'destination_latitude') &&
				columnExists('trip_plans', 'destination_longitude') &&
				tableExists('trip_stopovers')
		},
		{
			tag: '0015_trip_date_options',
			schemaAlreadyThere: () =>
				tableExists('trip_date_options') && tableExists('trip_date_votes')
		}
	];

	for (const c of candidates) {
		const hash = fileHash(join(DRIZZLE_DIR, `${c.tag}.sql`));
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
migrate(db, { migrationsFolder: DRIZZLE_DIR });

/**
 * Wenn `__drizzle_migrations` einen Stand vortäuscht, den die Tabelle nicht hat
 * (Backup, manueller Eingriff), überspringt Drizzle die SQL-Datei — Spalte fehlt trotzdem.
 */
function repairMissingColumnsAfterJournalDrift() {
	if (tableExists('users') && !columnExists('users', 'session_version')) {
		sqlite.exec(
			'ALTER TABLE users ADD COLUMN session_version integer DEFAULT 0 NOT NULL'
		);
		console.log(
			'[db:migrate] Schema-Reparatur: users.session_version ergänzt (Journal wich von der Tabelle ab).'
		);
	}
	if (tableExists('spots') && !columnExists('spots', 'deleted')) {
		sqlite.exec('ALTER TABLE spots ADD COLUMN deleted integer DEFAULT 0 NOT NULL');
		console.log('[db:migrate] Schema-Reparatur: spots.deleted ergänzt.');
	}
	if (tableExists('spots') && !columnExists('spots', 'is_micro')) {
		sqlite.exec('ALTER TABLE spots ADD COLUMN is_micro integer DEFAULT 0 NOT NULL');
		console.log('[db:migrate] Schema-Reparatur: spots.is_micro ergänzt.');
	}
	if (tableExists('spots') && !columnExists('spots', 'parent_spot_id')) {
		sqlite.exec('ALTER TABLE spots ADD COLUMN parent_spot_id integer');
		console.log('[db:migrate] Schema-Reparatur: spots.parent_spot_id ergänzt.');
	}
	if (!tableExists('spot_parking_locations')) {
		sqlite.exec(`CREATE TABLE spot_parking_locations (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			spot_id integer NOT NULL,
			name text,
			latitude real NOT NULL,
			longitude real NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL
		)`);
		console.log('[db:migrate] Schema-Reparatur: spot_parking_locations erstellt.');
	}
	if (!tableExists('trip_plans')) {
		sqlite.exec(`CREATE TABLE trip_plans (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			title text NOT NULL,
			start_date text NOT NULL,
			end_date text NOT NULL,
			notes text,
			transport_mode text DEFAULT 'auto' NOT NULL,
			car_count integer DEFAULT 0 NOT NULL,
			seats_per_car integer DEFAULT 0 NOT NULL,
			created_by integer NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL
		)`);
		console.log('[db:migrate] Schema-Reparatur: trip_plans erstellt.');
	}
	if (!tableExists('trip_participants')) {
		sqlite.exec(`CREATE TABLE trip_participants (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			trip_id integer NOT NULL,
			user_id integer NOT NULL,
			has_car integer DEFAULT 0 NOT NULL,
			seats_offered integer DEFAULT 0 NOT NULL,
			note text,
			created_at text DEFAULT (datetime('now')) NOT NULL
		)`);
		sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS trip_participants_trip_user ON trip_participants (trip_id, user_id)');
		console.log('[db:migrate] Schema-Reparatur: trip_participants erstellt.');
	}
	if (tableExists('trip_participants') && !columnExists('trip_participants', 'transport_mode')) {
		sqlite.exec(`ALTER TABLE trip_participants ADD COLUMN transport_mode text DEFAULT 'mitfahrt' NOT NULL`);
		console.log('[db:migrate] Schema-Reparatur: trip_participants.transport_mode ergänzt.');
	}
	if (tableExists('trip_participants') && !columnExists('trip_participants', 'vehicle_from')) {
		sqlite.exec('ALTER TABLE trip_participants ADD COLUMN vehicle_from text');
		console.log('[db:migrate] Schema-Reparatur: trip_participants.vehicle_from ergänzt.');
	}
	if (!tableExists('trip_destinations')) {
		sqlite.exec(`CREATE TABLE trip_destinations (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			trip_id integer NOT NULL,
			name text NOT NULL,
			city text NOT NULL,
			note text,
			proposed_by integer NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL
		)`);
		console.log('[db:migrate] Schema-Reparatur: trip_destinations erstellt.');
	}
	if (!tableExists('trip_destination_votes')) {
		sqlite.exec(`CREATE TABLE trip_destination_votes (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			trip_id integer NOT NULL,
			destination_id integer NOT NULL,
			user_id integer NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL
		)`);
		sqlite.exec(
			'CREATE UNIQUE INDEX IF NOT EXISTS trip_destination_votes_trip_user ON trip_destination_votes (trip_id, user_id)'
		);
		console.log('[db:migrate] Schema-Reparatur: trip_destination_votes erstellt.');
	}
	if (tableExists('trip_plans') && !columnExists('trip_plans', 'deleted')) {
		sqlite.exec('ALTER TABLE trip_plans ADD COLUMN deleted integer DEFAULT 0 NOT NULL');
		console.log('[db:migrate] Schema-Reparatur: trip_plans.deleted ergänzt.');
	}
	if (tableExists('trip_plans') && !columnExists('trip_plans', 'deleted_at')) {
		sqlite.exec('ALTER TABLE trip_plans ADD COLUMN deleted_at text');
		console.log('[db:migrate] Schema-Reparatur: trip_plans.deleted_at ergänzt.');
	}
	if (tableExists('trip_plans') && !columnExists('trip_plans', 'destination_latitude')) {
		sqlite.exec('ALTER TABLE trip_plans ADD COLUMN destination_latitude real');
		console.log('[db:migrate] Schema-Reparatur: trip_plans.destination_latitude ergänzt.');
	}
	if (tableExists('trip_plans') && !columnExists('trip_plans', 'destination_longitude')) {
		sqlite.exec('ALTER TABLE trip_plans ADD COLUMN destination_longitude real');
		console.log('[db:migrate] Schema-Reparatur: trip_plans.destination_longitude ergänzt.');
	}
	if (tableExists('trip_plans') && !columnExists('trip_plans', 'destination_label')) {
		sqlite.exec('ALTER TABLE trip_plans ADD COLUMN destination_label text');
		console.log('[db:migrate] Schema-Reparatur: trip_plans.destination_label ergänzt.');
	}
	if (!tableExists('trip_stopovers')) {
		sqlite.exec(`CREATE TABLE trip_stopovers (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			trip_id integer NOT NULL,
			label text NOT NULL,
			latitude real NOT NULL,
			longitude real NOT NULL,
			sort_order integer DEFAULT 0 NOT NULL,
			proposed_by integer NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL
		)`);
		sqlite.exec('CREATE INDEX IF NOT EXISTS trip_stopovers_trip_id_idx ON trip_stopovers (trip_id)');
		console.log('[db:migrate] Schema-Reparatur: trip_stopovers erstellt.');
	}
	if (!tableExists('trip_date_options')) {
		sqlite.exec(`CREATE TABLE trip_date_options (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			trip_id integer NOT NULL,
			start_date text NOT NULL,
			end_date text NOT NULL,
			note text,
			proposed_by integer NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL
		)`);
		console.log('[db:migrate] Schema-Reparatur: trip_date_options erstellt.');
	}
	if (!tableExists('trip_date_votes')) {
		sqlite.exec(`CREATE TABLE trip_date_votes (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			trip_id integer NOT NULL,
			date_option_id integer NOT NULL,
			user_id integer NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL
		)`);
		sqlite.exec(
			'CREATE UNIQUE INDEX IF NOT EXISTS trip_date_votes_trip_user ON trip_date_votes (trip_id, user_id)'
		);
		console.log('[db:migrate] Schema-Reparatur: trip_date_votes erstellt.');
	}
	if (tableExists('spot_challenges')) {
		if (!columnExists('spot_challenges', 'deleted')) {
			sqlite.exec(
				'ALTER TABLE spot_challenges ADD COLUMN deleted integer DEFAULT 0 NOT NULL'
			);
			console.log('[db:migrate] Schema-Reparatur: spot_challenges.deleted ergänzt.');
		}
		if (!columnExists('spot_challenges', 'deleted_at')) {
			sqlite.exec('ALTER TABLE spot_challenges ADD COLUMN deleted_at text');
			console.log('[db:migrate] Schema-Reparatur: spot_challenges.deleted_at ergänzt.');
		}
	}
}

repairMissingColumnsAfterJournalDrift();

resetUsersTableColumnCache();
resetSpotsTableColumnCache();
resetTripPlansTableColumnCache();
sqlite.close();
console.log('Drizzle-Migrationen abgeschlossen.');
