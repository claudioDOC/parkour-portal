import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

let columnCache: Set<string> | null = null;

export function resetTripPlansTableColumnCache(): void {
	columnCache = null;
}

function getTripPlansColumnNames(): Set<string> {
	if (columnCache) return columnCache;
	const rows = db.all(sql.raw(`PRAGMA table_info(trip_plans)`)) as { name: string }[];
	columnCache = new Set(rows.map((r) => r.name));
	return columnCache;
}

export function tripPlansHasSoftDeleteColumns(): boolean {
	const cols = getTripPlansColumnNames();
	return cols.has('deleted') && cols.has('deleted_at');
}
