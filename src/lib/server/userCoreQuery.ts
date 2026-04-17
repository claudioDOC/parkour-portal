import { sqliteDb } from '$lib/server/db';
import {
	usersTableHasDeletedColumn,
	usersTableHasSessionVersionColumn,
	usersTableHasUiThemeColumn
} from '$lib/server/usersTableColumns';
import type { UiThemeId } from '$lib/uiThemes';
import { UI_THEME_DEFAULT, isUiThemeId } from '$lib/uiThemes';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';

export type UserCoreAuthRow = {
	id: number;
	username: string;
	passwordHash: string;
	role: string;
	active: boolean;
	deleted: boolean;
	sessionVersion: number;
};

type RawUserRow = {
	id: number;
	username: string;
	password_hash: string;
	role: string;
	active: number;
	deleted: number;
	session_version: number;
};

function mapRaw(r: RawUserRow): UserCoreAuthRow {
	return {
		id: r.id,
		username: r.username,
		passwordHash: r.password_hash,
		role: r.role,
		active: Boolean(r.active),
		deleted: Boolean(r.deleted),
		sessionVersion: Number(r.session_version ?? 0)
	};
}

function selectUserSql(whereClause: string): string {
	const hasDel = usersTableHasDeletedColumn();
	const hasSv = usersTableHasSessionVersionColumn();
	return (
		`SELECT id, username, password_hash, role, active` +
		(hasDel ? `, deleted` : `, 0 AS deleted`) +
		(hasSv ? `, session_version` : `, 0 AS session_version`) +
		` FROM users WHERE ${whereClause}`
	);
}

export function getUserCoreByUsername(username: string): UserCoreAuthRow | undefined {
	const row = sqliteDb
		.prepare(selectUserSql(`username = ?`))
		.get(username) as RawUserRow | undefined;
	return row ? mapRaw(row) : undefined;
}

export function getUserCoreById(id: number): UserCoreAuthRow | undefined {
	const row = sqliteDb.prepare(selectUserSql(`id = ?`)).get(id) as RawUserRow | undefined;
	return row ? mapRaw(row) : undefined;
}

export type SessionUserCheckRow = {
	active: boolean;
	deleted: boolean;
	sessionVersion: number;
	trainingAttendance: 'implicit' | 'opt_in';
	autoAbsentWeekdays: string;
	uiTheme: UiThemeId;
};

/** Für hooks.server: Zeile für Session-Check, Spalten abhängig von Migrationen. */
export function getSessionUserCheckRow(userId: number): SessionUserCheckRow | undefined {
	const hasDel = usersTableHasDeletedColumn();
	const hasSv = usersTableHasSessionVersionColumn();
	const hasUi = usersTableHasUiThemeColumn();
	const schemaOk = isTrainingAttendanceSchemaReady();

	let q =
		`SELECT active` +
		(hasDel ? `, deleted` : `, 0 AS deleted`) +
		(hasSv ? `, session_version` : `, 0 AS session_version`);
	if (schemaOk) {
		q += `, training_attendance, auto_absent_weekdays`;
	}
	if (hasUi) {
		q += `, ui_theme`;
	}
	q += ` FROM users WHERE id = ?`;

	const row = sqliteDb.prepare(q).get(userId) as
		| {
				active: number;
				deleted: number;
				session_version: number;
				training_attendance?: string | null;
				auto_absent_weekdays?: string | null;
				ui_theme?: string | null;
		  }
		| undefined;

	if (!row) return undefined;

	const ta = row.training_attendance;
	const attendance: 'implicit' | 'opt_in' = ta === 'opt_in' ? 'opt_in' : 'implicit';

	const rawTheme = hasUi ? row.ui_theme : null;
	const uiTheme: UiThemeId = isUiThemeId(rawTheme) ? rawTheme : UI_THEME_DEFAULT;

	return {
		active: Boolean(row.active),
		deleted: Boolean(row.deleted),
		sessionVersion: Number(row.session_version ?? 0),
		trainingAttendance: schemaOk ? attendance : 'implicit',
		autoAbsentWeekdays: schemaOk ? (row.auto_absent_weekdays ?? '[]') : '[]',
		uiTheme
	};
}
