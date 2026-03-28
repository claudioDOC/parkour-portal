export type TrainingAttendanceMode = 'implicit' | 'opt_in';

/** Wochentage wie in `training_sessions.day_of_week` (Seed: Dienstag, Donnerstag). */
export const TRAINING_WEEKDAY_OPTIONS = ['Dienstag', 'Donnerstag'] as const;

export type UserForAttendance = {
	id: number;
	username: string;
	trainingAttendance: TrainingAttendanceMode;
	autoAbsentWeekdays: string[];
	active?: boolean;
};

export function parseAutoAbsentWeekdays(raw: string | null | undefined): string[] {
	if (!raw || raw === '[]') return [];
	try {
		const v = JSON.parse(raw) as unknown;
		if (!Array.isArray(v)) return [];
		const allowed = new Set<string>(TRAINING_WEEKDAY_OPTIONS);
		return v.filter((x): x is string => typeof x === 'string' && allowed.has(x));
	} catch {
		return [];
	}
}

export function serializeAutoAbsentWeekdays(days: string[]): string {
	const allowed = new Set<string>(TRAINING_WEEKDAY_OPTIONS);
	const unique = [...new Set(days.filter((d) => allowed.has(d)))].sort((a, b) => a.localeCompare(b, 'de'));
	return JSON.stringify(unique);
}

export function normalizeUserForAttendance(row: {
	id: number;
	username: string;
	active: boolean | null;
	trainingAttendance: string | null;
	autoAbsentWeekdays?: string | null;
}): UserForAttendance {
	return {
		id: row.id,
		username: row.username,
		active: row.active ?? true,
		trainingAttendance: row.trainingAttendance === 'opt_in' ? 'opt_in' : 'implicit',
		autoAbsentWeekdays: parseAutoAbsentWeekdays(row.autoAbsentWeekdays ?? '[]')
	};
}

/** Effektiv abgemeldet: DB-Eintrag oder (implicit + Wochentagsregel ohne Ausnahme). */
export function computeEffectiveAbsentUserIds(
	allUsers: UserForAttendance[],
	sessionDayOfWeek: string,
	dbAbsentIds: Set<number>,
	overrideUserIds: Set<number>
): Set<number> {
	const out = new Set(dbAbsentIds);
	for (const u of allUsers) {
		if (u.active === false) continue;
		if (dbAbsentIds.has(u.id)) continue;
		if (overrideUserIds.has(u.id)) continue;
		if (u.trainingAttendance === 'opt_in') continue;
		if (u.autoAbsentWeekdays.includes(sessionDayOfWeek)) out.add(u.id);
	}
	return out;
}

/** Zieht mit: nicht effektiv abgemeldet, nicht ausgeblendet, und (implicit ODER hat Zusage). */
export function isListedAsAttending(
	user: UserForAttendance,
	effectiveAbsentUserIds: Set<number>,
	hiddenUserIds: Set<number>,
	rsvpUserIds: Set<number>
): boolean {
	if (user.active === false) return false;
	if (hiddenUserIds.has(user.id) || effectiveAbsentUserIds.has(user.id)) return false;
	if (user.trainingAttendance === 'opt_in') return rsvpUserIds.has(user.id);
	return true;
}

export function filterAttendingUsers(
	allUsers: UserForAttendance[],
	effectiveAbsentUserIds: Set<number>,
	hiddenUserIds: Set<number>,
	rsvpUserIds: Set<number>
): { id: number; username: string }[] {
	return allUsers
		.filter((u) => isListedAsAttending(u, effectiveAbsentUserIds, hiddenUserIds, rsvpUserIds))
		.map((u) => ({ id: u.id, username: u.username }));
}

export type AbsenceListEntry = {
	id: number | null;
	userId: number;
	username: string;
	reason: string | null;
	virtual: boolean;
};

export function buildAbsenceListForSession(
	allUsers: UserForAttendance[],
	dbAbsences: { id: number; userId: number; username: string; reason: string | null }[],
	effectiveAbsentIds: Set<number>,
	dbAbsentIds: Set<number>,
	sessionDayOfWeek: string
): AbsenceListEntry[] {
	const virtual: AbsenceListEntry[] = [];
	for (const u of allUsers) {
		if (!effectiveAbsentIds.has(u.id)) continue;
		if (dbAbsentIds.has(u.id)) continue;
		if (u.trainingAttendance === 'opt_in') continue;
		if (!u.autoAbsentWeekdays.includes(sessionDayOfWeek)) continue;
		virtual.push({
			id: null,
			userId: u.id,
			username: u.username,
			reason: `Standard: kein ${sessionDayOfWeek}`,
			virtual: true
		});
	}
	const real: AbsenceListEntry[] = dbAbsences.map((a) => ({
		id: a.id,
		userId: a.userId,
		username: a.username,
		reason: a.reason,
		virtual: false
	}));
	return [...real, ...virtual].sort((a, b) => a.username.localeCompare(b.username, 'de'));
}

/** Statistik: implizit effektiv abwesend (DB oder Wochentagsregel ohne Override). */
export function isImplicitEffectiveAbsent(
	user: {
		id: number;
		trainingAttendance: string | null;
		autoAbsentWeekdays?: string | null;
	},
	session: { id: number; dayOfWeek: string },
	absencePairs: Set<string>,
	overridePairs: Set<string>
): boolean {
	if (user.trainingAttendance === 'opt_in') return absencePairs.has(`${user.id}:${session.id}`);
	if (absencePairs.has(`${user.id}:${session.id}`)) return true;
	const days = parseAutoAbsentWeekdays(user.autoAbsentWeekdays);
	if (!days.includes(session.dayOfWeek)) return false;
	if (overridePairs.has(`${user.id}:${session.id}`)) return false;
	return true;
}
