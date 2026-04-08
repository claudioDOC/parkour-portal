import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

let cached: boolean | null = null;

export function isSpotChallengesSchemaReady(): boolean {
	if (cached !== null) return cached;
	try {
		const rows = db.all(
			sql.raw(
				`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('spot_challenges','spot_challenge_completions')`
			)
		) as { name: string }[];
		const names = new Set(rows.map((r) => r.name));
		cached = names.has('spot_challenges') && names.has('spot_challenge_completions');
		if (!cached) {
			console.warn(
				'[parkour-portal] SQLite: Tabellen spot_challenges / spot_challenge_completions fehlen — Migration 0007_spot_challenges ausführen.'
			);
		}
		return cached;
	} catch (e) {
		console.error('[parkour-portal] spotChallengesSchemaReady check failed', e);
		cached = false;
		return false;
	}
}
