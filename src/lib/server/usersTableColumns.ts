import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

let columnCache: Set<string> | null = null;

/** Nach Migrationen aufrufen, damit PRAGMA neu gelesen wird. */
export function resetUsersTableColumnCache(): void {
	columnCache = null;
}

export function getUsersTableColumnNames(): Set<string> {
	if (columnCache) return columnCache;
	const rows = db.all(sql.raw(`PRAGMA table_info(users)`)) as { name: string }[];
	columnCache = new Set(rows.map((r) => r.name));
	return columnCache;
}

export function usersTableHasDeletedColumn(): boolean {
	return getUsersTableColumnNames().has('deleted');
}

export function usersTableHasSessionVersionColumn(): boolean {
	return getUsersTableColumnNames().has('session_version');
}

export function usersTableHasUiThemeColumn(): boolean {
	return getUsersTableColumnNames().has('ui_theme');
}
