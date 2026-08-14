import type { Handle, RequestEvent } from '@sveltejs/kit';
import { clearSession, getSessionFromCookiesOrBearer } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import { parseAutoAbsentWeekdays } from '$lib/server/trainingAttendance';
import { getSessionUserCheckRow } from '$lib/server/userCoreQuery';
import { startPushScheduler } from '$lib/server/pushScheduler';
import { broadcastDataChanged } from '$lib/server/liveBus';

// Läuft einmal beim Start des Serverprozesses.
startPushScheduler();

/** JWT vs. DB: gleiche Zahl auch bei BigInt/String-Unterschieden. */
function sessionVersionMatches(jwtVal: unknown, dbVal: unknown): boolean {
	return Number(jwtVal ?? 0) === Number(dbVal ?? 0);
}

const publicPaths = [
	'/login',
	'/register',
	'/api/auth/login',
	'/api/auth/register',
	'/uploads',
	// Fallback des Service Workers — muss auch ohne gültige Session laden,
	// sonst landet die Login-Seite im Offline-Cache.
	'/offline',
	// Digital Asset Links für die Android-App (Play Store / TWA).
	'/.well-known/assetlinks.json',
	// Kalender-Abo — Key-geschützt in der Route selbst.
	'/calendar.ics',
	// APK-Download-Seite — Link soll ohne Login teilbar sein.
	'/app'
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

/** Mutationen, die keinen Live-Reload bei allen auslösen sollen. */
const LIVE_IGNORED_PATHS = [
	'/api/live',
	'/api/push/beacon',
	'/api/auth/',
	// Rein persönlich (Gelesen-Stand) — würde sonst bei allen einen Reload
	// auslösen und das gerade geöffnete Glocken-Panel zuklappen.
	'/api/activity'
];

export const handle: Handle = async ({ event, resolve }) => {
	redirectHttpToHttpsIfNeeded(event);

	const sessionJwt = getSessionFromCookiesOrBearer(event.cookies, event.request);

	if (sessionJwt) {
		const row = getSessionUserCheckRow(sessionJwt.userId);
		if (
			!row ||
			!row.active ||
			row.deleted ||
			!sessionVersionMatches(sessionJwt.sessionVersion, row.sessionVersion)
		) {
			clearSession(event.cookies);
			event.locals.user = null;
		} else {
			const trainingAttendance = row.trainingAttendance === 'opt_in' ? 'opt_in' : 'implicit';
			const autoAbsentWeekdays = parseAutoAbsentWeekdays(row.autoAbsentWeekdays);
			event.locals.user = {
				id: sessionJwt.userId,
				username: sessionJwt.username,
				role: sessionJwt.role,
				trainingAttendance,
				autoAbsentWeekdays,
				uiTheme: row.uiTheme
			};
		}
	} else {
		event.locals.user = null;
	}

	const isPublic = publicPaths.some((p) => event.url.pathname.startsWith(p));

	if (!isPublic && !event.locals.user && !event.url.pathname.startsWith('/api')) {
		throw redirect(303, '/login');
	}

	const response = await resolve(event);

	// Erfolgreiche API-Mutation → alle verbundenen Apps laden ihre Daten neu.
	// Global hier statt in jedem Endpunkt — neue Endpunkte sind automatisch live.
	if (
		event.request.method !== 'GET' &&
		event.request.method !== 'HEAD' &&
		event.url.pathname.startsWith('/api/') &&
		response.status < 400 &&
		!LIVE_IGNORED_PATHS.some((p) => event.url.pathname.startsWith(p))
	) {
		broadcastDataChanged();
	}

	return response;
};
