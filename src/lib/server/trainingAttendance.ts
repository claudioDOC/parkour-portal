export type TrainingAttendanceMode = 'implicit' | 'opt_in';

export type UserForAttendance = {
	id: number;
	username: string;
	trainingAttendance: TrainingAttendanceMode;
	active?: boolean;
};

/** Zieht mit: nicht abgemeldet, nicht ausgeblendet, und (implicit ODER hat Zusage). */
export function isListedAsAttending(
	user: UserForAttendance,
	absentUserIds: Set<number>,
	hiddenUserIds: Set<number>,
	rsvpUserIds: Set<number>
): boolean {
	if (user.active === false) return false;
	if (hiddenUserIds.has(user.id) || absentUserIds.has(user.id)) return false;
	if (user.trainingAttendance === 'opt_in') return rsvpUserIds.has(user.id);
	return true;
}

export function filterAttendingUsers(
	allUsers: UserForAttendance[],
	absentUserIds: Set<number>,
	hiddenUserIds: Set<number>,
	rsvpUserIds: Set<number>
): { id: number; username: string }[] {
	return allUsers
		.filter((u) => isListedAsAttending(u, absentUserIds, hiddenUserIds, rsvpUserIds))
		.map((u) => ({ id: u.id, username: u.username }));
}
