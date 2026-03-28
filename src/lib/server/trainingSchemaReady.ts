import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

/**
 * True wenn alle Trainings-/Anwesenheits-Erweiterungen in SQLite vorliegen.
 * Bei alter DB ohne Migrationen: false — App nutzt dann Legacy-Pfade ohne 500.
 */
let cached: boolean | null = null;

export function isTrainingAttendanceSchemaReady(): boolean {
	if (cached !== null) return cached;
	try {
		const colRows = db.all(sql.raw(`PRAGMA table_info(users)`)) as { name: string }[];
		const cols = new Set(colRows.map((r) => r.name));
		if (!cols.has('training_attendance') || !cols.has('auto_absent_weekdays')) {
			cached = false;
			console.warn(
				'[parkour-portal] SQLite: Spalten training_attendance / auto_absent_weekdays fehlen — drizzle/0002_training_opt_in.sql und 0003_auto_absent_weekdays.sql auf die Produktions-DB anwenden.'
			);
			return false;
		}
		const tRows = db.all(
			sql.raw(
				`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('training_session_rsvp','training_session_weekday_override')`
			)
		) as { name: string }[];
		const names = new Set(tRows.map((r) => r.name));
		cached = names.has('training_session_rsvp') && names.has('training_session_weekday_override');
		if (!cached) {
			console.warn(
				'[parkour-portal] SQLite: Tabellen training_session_rsvp / training_session_weekday_override fehlen — Migrationen 0002 und 0003 ausführen.'
			);
		}
		return cached;
	} catch (e) {
		console.error('[parkour-portal] trainingSchemaReady check failed', e);
		cached = false;
		return false;
	}
}
