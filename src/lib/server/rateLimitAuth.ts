import type { RequestEvent } from '@sveltejs/kit';

type Bucket = { count: number; resetAt: number };

const loginFailureBuckets = new Map<string, Bucket>();
const registerBuckets = new Map<string, Bucket>();
/** Fehlerberichte der App — nimmt der Server bewusst ohne Login entgegen. */
const clientLogBuckets = new Map<string, Bucket>();
/** Falsche „aktuelles Passwort"-Eingaben beim Passwortwechsel. */
const passwordChangeBuckets = new Map<string, Bucket>();
/** Bild-Uploads pro Person. */
const uploadBuckets = new Map<string, Bucket>();

const LOGIN_FAIL_MAX = 5;
const LOGIN_FAIL_WINDOW_MS = 60_000;

/**
 * Client-IP für Sperren und Audit-Log.
 *
 * Früher wurde blind der ERSTE Wert aus `X-Forwarded-For` genommen — den
 * schreibt aber der Client selbst. Mit rotierenden Fantasie-IPs bekam jeder
 * Anmeldeversuch einen frischen Zähler, die Sperre war wirkungslos und das
 * Audit-Log liess sich mit erfundenen Adressen füllen.
 *
 * Jetzt gilt: Dem Header wird NUR geglaubt, wenn die Verbindung
 * tatsächlich vom eigenen Reverse-Proxy kommt (`TRUSTED_PROXY_IPS`). Dann
 * zählt der LETZTE Eintrag — den hängt nginx selbst an
 * (`$proxy_add_x_forwarded_for`), alles davor stammt vom Client und ist
 * damit wertlos. Kommt die Anfrage von woanders (etwa direkt auf Port
 * 3000 im LAN), gilt die echte Verbindungsadresse.
 */
const TRUSTED_PROXIES = new Set(
	(process.env.TRUSTED_PROXY_IPS ?? '')
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean)
);

function normalizeIp(ip: string): string {
	// ::ffff:10.0.0.1 → 10.0.0.1
	return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function getClientIp(event: RequestEvent): string {
	let socketIp = 'unbekannt';
	try {
		socketIp = normalizeIp(event.getClientAddress());
	} catch {
		return 'unbekannt';
	}
	if (!TRUSTED_PROXIES.has(socketIp)) return socketIp;

	const xf = event.request.headers.get('x-forwarded-for');
	if (!xf) return socketIp;
	const parts = xf
		.split(',')
		.map((v) => normalizeIp(v.trim()))
		.filter(Boolean);
	return parts.at(-1) ?? socketIp;
}

function consume(
	buckets: Map<string, Bucket>,
	key: string,
	max: number,
	windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
	const now = Date.now();
	let b = buckets.get(key);
	if (!b || now >= b.resetAt) {
		b = { count: 0, resetAt: now + windowMs };
		buckets.set(key, b);
	}
	if (b.count >= max) {
		return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
	}
	b.count += 1;
	return { ok: true };
}

/**
 * Vor dem Login: blockiert nur nach mehreren Fehlversuchen (falsches Passwort, …).
 * Erfolgreiche Logins zählen nicht — verhindert Sperre, wenn Session/Cookie separat hakt.
 */
export function assertLoginFailuresBelowLimit(
	ip: string
): { ok: true } | { ok: false; retryAfterSec: number } {
	const now = Date.now();
	const b = loginFailureBuckets.get(ip);
	if (!b || now >= b.resetAt) {
		return { ok: true };
	}
	if (b.count >= LOGIN_FAIL_MAX) {
		return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
	}
	return { ok: true };
}

/** Nach fehlgeschlagenem Login (unbekannter User, falsches Passwort, inaktiv, Papierkorb). */
export function recordLoginAuthFailure(ip: string) {
	const now = Date.now();
	let b = loginFailureBuckets.get(ip);
	if (!b || now >= b.resetAt) {
		b = { count: 0, resetAt: now + LOGIN_FAIL_WINDOW_MS };
		loginFailureBuckets.set(ip, b);
	}
	b.count += 1;
}

export function clearLoginAuthFailures(ip: string) {
	loginFailureBuckets.delete(ip);
}

/** Max. 10 Registrierungen pro Stunde pro IP (Invite + Massen-Accounts). */
export function rateLimitAuthRegister(ip: string) {
	return consume(registerBuckets, ip, 10, 3_600_000);
}

/**
 * Fehlerberichte je IP begrenzen.
 *
 * Der Endpunkt muss ohne Login erreichbar sein — Abstürze passieren oft
 * vor der Anmeldung. Ohne Bremse könnte aber jede beliebige Person die
 * Tabelle vollschreiben. 40 Meldungen pro Viertelstunde reichen selbst
 * für eine Absturzschleife locker.
 */
export function rateLimitClientLog(ip: string) {
	return consume(clientLogBuckets, ip, 40, 15 * 60_000);
}

/**
 * Passwort ändern: Auch hier wird ein Passwort geprüft — ohne Bremse liess
 * sich das aktuelle Passwort einer offenen Sitzung beliebig oft raten und
 * der Account danach vollständig übernehmen. Gezählt wird pro Konto UND
 * pro Adresse, damit weder ein fremdes Gerät noch eine fremde Leitung die
 * Sperre umgeht.
 */
export function rateLimitPasswordChange(key: string) {
	return consume(passwordChangeBuckets, key, 5, 15 * 60_000);
}

/** Nach erfolgreichem Wechsel den Zähler leeren. */
export function clearPasswordChangeFailures(key: string) {
	passwordChangeBuckets.delete(key);
}

/**
 * Bild-Uploads je Person begrenzen.
 *
 * Jedes Mitglied darf Fotos zu jedem Spot beitragen — das ist in einer
 * Gruppe, die gemeinsam Spots pflegt, ausdrücklich gewollt. Ohne Bremse
 * liesse sich damit aber die Platte vollschreiben. 40 Bilder pro Stunde
 * sind mehr, als eine Session je braucht.
 */
export function rateLimitImageUpload(userId: number) {
	return consume(uploadBuckets, `u${userId}`, 40, 3_600_000);
}
