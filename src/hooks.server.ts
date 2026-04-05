import type { Handle, RequestEvent } from '@sveltejs/kit';
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

/** F-09: In Produktion nur HTTPS, wenn der Proxy X-Forwarded-Proto mitsendet. */
function redirectHttpToHttpsIfNeeded(event: RequestEvent) {
	if (process.env.NODE_ENV !== 'production') return;

	const host = event.request.headers.get('host') ?? '';
	const hostOnly = host.split(':')[0].toLowerCase();
	if (hostOnly === 'localhost' || hostOnly === '127.0.0.1' || hostOnly === '[::1]') return;

	const rawProto = event.request.headers.get('x-forwarded-proto');
	if (rawProto == null || rawProto === '') return;
	const proto = rawProto.split(',')[0].trim().toLowerCase();
	if (proto !== 'http') return;

	const publicHost =
		event.request.headers.get('x-forwarded-host')?.split(',')[0].trim() || host;
	if (!publicHost) return;

	throw redirect(308, `https://${publicHost}${event.url.pathname}${event.url.search}`);
}

export const handle: Handle = async ({ event, resolve }) => {
	redirectHttpToHttpsIfNeeded(event);

	const session = getSession(event.cookies);

	if (session) {
		const jwtSessionVersion = session.sessionVersion ?? 0;

		if (!isTrainingAttendanceSchemaReady()) {
			const core = db
				.select({
					active: users.active,
					deleted: users.deleted,
					sessionVersion: users.sessionVersion
				})
				.from(users)
				.where(eq(users.id, session.userId))
				.get();
			if (!core || !core.active || core.deleted || jwtSessionVersion !== core.sessionVersion) {
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
					sessionVersion: users.sessionVersion,
					trainingAttendance: users.trainingAttendance,
					autoAbsentWeekdays: users.autoAbsentWeekdays
				})
				.from(users)
				.where(eq(users.id, session.userId))
				.get();
			if (!row || !row.active || row.deleted || jwtSessionVersion !== row.sessionVersion) {
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
