import { sql, eq, and, type SQL } from 'drizzle-orm';
import { users } from '$lib/server/db/schema';
import { usersTableHasDeletedColumn } from '$lib/server/usersTableColumns';

/** User nicht im Papierkorb; ohne Spalte `deleted` immer wahr. */
export function usersNotDeletedCondition(): SQL {
	return usersTableHasDeletedColumn() ? eq(users.deleted, false) : sql`1`;
}

/** `and(...parts)` plus optional User-nicht-gelöscht. */
export function andWithUsersNotDeleted(...parts: SQL[]): SQL {
	const list = usersTableHasDeletedColumn() ? [...parts, eq(users.deleted, false)] : [...parts];
	if (list.length === 1) return list[0]!;
	return and(...list)!;
}

/** Papierkorb-Filter: ohne Spalte `deleted` gibt es keinen Papierkorb (trashed → leere Liste). */
export function whereUsersTrashed(trashed: boolean): SQL {
	if (!usersTableHasDeletedColumn()) {
		return trashed ? sql`0 = 1` : sql`1 = 1`;
	}
	return eq(users.deleted, trashed);
}
