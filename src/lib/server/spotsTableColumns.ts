import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

let columnCache: Set<string> | null = null;
let parkingTableCache: boolean | null = null;

export function resetSpotsTableColumnCache(): void {
	columnCache = null;
	parkingTableCache = null;
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

/** Ohne Spalten: Microspot-Flag/Zuordnung im Code deaktivieren (Legacy-DB). */
export function spotsTableHasMicrospotColumns(): boolean {
	const cols = getSpotsTableColumnNames();
	return cols.has('is_micro') && cols.has('parent_spot_id');
}

export function spotsParkingTableExists(): boolean {
	if (parkingTableCache != null) return parkingTableCache;
	const rows = db.all(sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='spot_parking_locations'`)) as
		| { name: string }[]
		| undefined;
	parkingTableCache = Boolean(rows && rows.length > 0);
	return parkingTableCache;
}
