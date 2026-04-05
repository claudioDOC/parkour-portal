import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

let columnCache: Set<string> | null = null;

export function resetSpotsTableColumnCache(): void {
	columnCache = null;
}

function getSpotsTableColumnNames(): Set<string> {
	if (columnCache) return columnCache;
	const rows = db.all(sql.raw(`PRAGMA table_info(spots)`)) as { name: string }[];
	columnCache = new Set(rows.map((r) => r.name));
	return columnCache;
}

/** Ohne Spalte: keine Spot-Papierkorb-Filter in SQL (Legacy-DB). */
export function spotsTableHasDeletedColumn(): boolean {
	return getSpotsTableColumnNames().has('deleted');
}
