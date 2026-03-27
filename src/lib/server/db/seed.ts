import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import bcryptjs from 'bcryptjs';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';

const DB_PATH = './data/parkour.db';
if (!existsSync('./data')) mkdirSync('./data', { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: './drizzle' });

sqlite.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	created_at text DEFAULT (datetime('now')) NOT NULL,
	action text NOT NULL,
	actor_user_id integer,
	actor_username text,
	target_user_id integer,
	detail_json text,
	ip text
);
`);

const existing = db.select().from(schema.users).all();
if (existing.length === 0) {
	const hash = bcryptjs.hashSync('admin123', 10);
	db.insert(schema.users).values({
		username: 'Claudio',
		passwordHash: hash,
		role: 'admin'
	}).run();
	console.log('Admin-User erstellt: Claudio / admin123');
} else {
	console.log('Datenbank hat bereits User, Seed übersprungen.');
}

function getNextTrainingDates(count: number): { date: string; dayOfWeek: string }[] {
	const dates: { date: string; dayOfWeek: string }[] = [];
	const current = new Date();

	while (dates.length < count) {
		const day = current.getDay();
		if (day === 2 || day === 4) {
			const dateStr = current.toISOString().split('T')[0];
			const dayName = day === 2 ? 'Dienstag' : 'Donnerstag';
			dates.push({ date: dateStr, dayOfWeek: dayName });
		}
		current.setDate(current.getDate() + 1);
	}
	return dates;
}

const trainingDates = getNextTrainingDates(8);
for (const t of trainingDates) {
	const exists = sqlite.prepare('SELECT id FROM training_sessions WHERE date = ?').get(t.date);
	if (!exists) {
		db.insert(schema.trainingSessions).values({
			date: t.date,
			dayOfWeek: t.dayOfWeek,
			timeStart: '18:15',
			timeEnd: '20:15'
		}).run();
	}
}
console.log(`${trainingDates.length} Trainings-Sessions erstellt/geprüft.`);

sqlite.close();
console.log('Seed abgeschlossen.');
