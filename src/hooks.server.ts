import type { Handle, RequestEvent } from '@sveltejs/kit';
import { clearSession, getVerifiedSession } from '$lib/server/auth';
import { isTokenRevoked } from '$lib/server/revokedTokens';
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

/**
 * Gehört der Pfad zu einem der Präfixe? Nur exakt oder als Unterpfad —
 * `/app` deckt `/app/datei.apk` ab, aber NICHT `/apps…` oder `/application`.
 * Vorher reichte ein simples startsWith: Jede künftige Seite, deren Name
 * zufällig mit einem öffentlichen Präfix beginnt, wäre ohne Login offen
 * gewesen.
 */
function underPrefix(path: string, prefix: string): boolean {
	if (prefix.endsWith('/')) return path.startsWith(prefix);
	return path === prefix || path.startsWith(prefix + '/');
}

/** Mutationen, die keinen Live-Reload bei allen auslösen sollen. */
const LIVE_IGNORED_PATHS = [
	'/api/live',
	'/api/push/beacon',
	// Fehlerberichte der App — ohne Login erreichbar; sonst könnte jede
	// beliebige Person alle offenen Browser im Takt neu laden lassen.
	'/api/v1/client-log',
	'/api/auth/',
	// Rein persönlich (Gelesen-Stand) — würde sonst bei allen einen Reload
	// auslösen und das gerade geöffnete Glocken-Panel zuklappen.
	'/api/activity'
];

/**
 * Herkunfts-Prüfung für Formular-Anfragen (CSRF).
 *
 * SvelteKits eingebaute Prüfung war zu grob: Sie verlangt einen passenden
 * Origin-Header und blockte damit die native App, die als Nicht-Browser
 * gar keinen schickt — jeder Bild-Upload aus der App endete in
 * „403 Cross-site POST form submissions are forbidden".
 *
 * Diese Fassung schützt Browser weiterhin (fremder Origin = abgelehnt),
 * lässt aber Anfragen mit gültigem Bearer-Token durch: Ein Angreifer kann
 * über ein fremdes Formular kein Token setzen — Browser schicken dort nur
 * Cookies mit. Genau darum ist die Ausnahme sicher.
 */
function isForbiddenCrossSiteForm(event: Parameters<Handle>[0]['event']): boolean {
	const method = event.request.method;
	if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
		return false;
	}

	// Native App: authentifiziert sich per Token, nicht per Cookie.
	const auth = event.request.headers.get('authorization') ?? '';
	if (auth.toLowerCase().startsWith('bearer ')) return false;

	// Fremder Origin = abgelehnt, egal welcher Inhaltstyp. Vorher galt das
	// nur für Formular-Typen; eine fremde Seite konnte etwa einen POST ohne
	// Content-Type schicken. Sicher war das bisher nur dank SameSite=Lax.
	const origin = event.request.headers.get('origin');
	if (origin && origin !== event.url.origin) return true;

	const type = (event.request.headers.get('content-type') ?? '').split(';')[0].trim();
	const formLike = [
		'application/x-www-form-urlencoded',
		'multipart/form-data',
		'text/plain'
	].includes(type);
	// Browser senden bei Formular-POSTs immer einen Origin — fehlt er, ist
	// es kein normaler Browser-Aufruf.
	return formLike && !origin;
}

/**
 * Grosse Anfragen nur dort, wo Dateien hochgeladen werden.
 *
 * BODY_SIZE_LIMIT (64 MB) gilt für den ganzen Server — nötig für Videos.
 * Ohne diese Bremse durfte aber auch der Login ohne Anmeldung 64 MB
 * schicken; ein paar solche Anfragen parallel füllen den Arbeitsspeicher.
 * Alle anderen Endpunkte bekommen höchstens 1 MB (das reicht für jeden
 * Text um ein Vielfaches).
 */
const LARGE_BODY_PATHS = ['/api/spots/images', '/api/spots/challenges/images', '/api/profile/avatar'];
const SMALL_BODY_LIMIT = 1024 * 1024;

function isTooLargeBody(event: RequestEvent): boolean {
	const method = event.request.method;
	if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
	if (LARGE_BODY_PATHS.some((p) => underPrefix(event.url.pathname, p))) return false;
	const len = Number(event.request.headers.get('content-length') ?? '');
	return Number.isFinite(len) && len > SMALL_BODY_LIMIT;
}

export const handle: Handle = async ({ event, resolve }) => {
	if (isForbiddenCrossSiteForm(event)) {
		return new Response('Cross-site POST form submissions are forbidden', { status: 403 });
	}
	if (isTooLargeBody(event)) {
		return new Response('Payload too large', { status: 413 });
	}

	redirectHttpToHttpsIfNeeded(event);

	// Abgemeldete Tokens gelten nicht mehr, auch wenn sie noch nicht
	// abgelaufen sind. Geprüft wird genau das Token, aus dem die Sitzung
	// stammt (nicht irgendein mitgeschickter Bearer-Wert).
	const verified = getVerifiedSession(event.cookies, event.request);
	const sessionJwt = verified && !isTokenRevoked(verified.raw) ? verified.payload : null;

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
				// Rolle IMMER aus der Datenbank: Im Token steht der Stand vom
				// Anmelden. Wurde jemand zwischenzeitlich herabgestuft, behielte
				// er sonst bis zum Ablauf (30 Tage) seine alten Rechte.
				role: row.role,
				trainingAttendance,
				autoAbsentWeekdays,
				uiTheme: row.uiTheme
			};
		}
	} else {
		event.locals.user = null;
	}

	const isPublic = publicPaths.some((p) => underPrefix(event.url.pathname, p));

	if (!isPublic && !event.locals.user && !underPrefix(event.url.pathname, '/api')) {
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
		// Bewusst startsWith: '/api/live' deckt auch '/api/live-location' ab.
		!LIVE_IGNORED_PATHS.some((p) => event.url.pathname.startsWith(p))
	) {
		broadcastDataChanged();
	}

	setSecurityHeaders(event, response);
	return response;
};

/**
 * Schutz-Header für jede Antwort (Pentest F-01/F-05).
 *
 * Bewusst hier statt im Reverse-Proxy: So gilt es unabhängig davon, wer
 * die App ausliefert, und wandert mit dem Code mit.
 *
 * Zur CSP: Karten-Kacheln (OpenFreeMap, Esri), das Kalender-Abo und die
 * Schriften brauchen ihre Quellen ausdrücklich. `unsafe-inline` für Stile
 * ist nötig, weil SvelteKit und die Karte Stile direkt am Element setzen;
 * für Skripte bleibt es aus — dort liegt das eigentliche XSS-Risiko.
 */
function setSecurityHeaders(event: RequestEvent, response: Response): void {
	const h = response.headers;
	h.set('X-Content-Type-Options', 'nosniff');
	// Anmelde- und Kontoantworten enthalten Tokens bzw. persönliche Daten
	// und dürfen nirgends zwischengespeichert werden — weder im Browser
	// noch in einem Proxy dazwischen.
	if (event.url.pathname.startsWith('/api/auth') || event.url.pathname.startsWith('/api/v1/auth')) {
		h.set('Cache-Control', 'no-store, no-cache, must-revalidate');
		h.set('Pragma', 'no-cache');
	}
	h.set('X-Frame-Options', 'DENY');
	h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	h.set(
		'Permissions-Policy',
		'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()'
	);
	// Seiten bekommen ihre CSP von SvelteKit (mit den nötigen Skript-Hashes).
	// Hier nur ergänzen, wo keine gesetzt ist: Bilder, Dateien, API.
	if (!h.has('content-security-policy'))
		h.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"base-uri 'self'",
			"object-src 'none'",
			"frame-ancestors 'none'",
			"form-action 'self'",
			"script-src 'self'",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
			"font-src 'self' https://fonts.gstatic.com data:",
			"img-src 'self' data: blob: https://server.arcgisonline.com https://tiles.openfreemap.org https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org",
			"connect-src 'self' https://tiles.openfreemap.org https://server.arcgisonline.com https://nominatim.openstreetmap.org https://router.project-osrm.org",
			"worker-src 'self' blob:",
			"manifest-src 'self'",
			"upgrade-insecure-requests"
		].join('; ')
	);

	// HSTS nur, wenn die Anfrage wirklich über HTTPS kam — sonst sperrt man
	// sich eine rein lokale Installation aus.
	const proto = event.request.headers.get('x-forwarded-proto') ?? event.url.protocol.replace(':', '');
	if (proto === 'https') {
		h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
}
