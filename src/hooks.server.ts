import type { Handle } from '@sveltejs/kit';
import { getSession, clearSession } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseAutoAbsentWeekdays } from '$lib/server/trainingAttendance';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';

const publicPaths = [
	'/login',
	'/register',
	'/api/auth/login',
	'/api/auth/register',
	'/uploads'
];

export const handle: Handle = async ({ event, resolve }) => {
	const session = getSession(event.cookies);

	if (session) {
		if (!isTrainingAttendanceSchemaReady()) {
			const core = db
				.select({ active: users.active, deleted: users.deleted })
				.from(users)
				.where(eq(users.id, session.userId))
				.get();
			if (!core || !core.active || core.deleted) {
				clearSession(event.cookies);
				event.locals.user = null;
			} else {
				event.locals.user = {
					id: session.userId,
					username: session.username,
					role: session.role,
					trainingAttendance: 'implicit',
					autoAbsentWeekdays: []
				};
			}
		} else {
			const row = db
				.select({
					active: users.active,
					deleted: users.deleted,
					trainingAttendance: users.trainingAttendance,
					autoAbsentWeekdays: users.autoAbsentWeekdays
				})
				.from(users)
				.where(eq(users.id, session.userId))
				.get();
			if (!row || !row.active || row.deleted) {
				clearSession(event.cookies);
				event.locals.user = null;
			} else {
				const trainingAttendance = row.trainingAttendance === 'opt_in' ? 'opt_in' : 'implicit';
				const autoAbsentWeekdays = parseAutoAbsentWeekdays(row.autoAbsentWeekdays);
				event.locals.user = {
					id: session.userId,
					username: session.username,
					role: session.role,
					trainingAttendance,
					autoAbsentWeekdays
				};
			}
		}
	} else {
		event.locals.user = null;
	}

	const isPublic = publicPaths.some((p) => event.url.pathname.startsWith(p));

	if (!isPublic && !event.locals.user && !event.url.pathname.startsWith('/api')) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};
