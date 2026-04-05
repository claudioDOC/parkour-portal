import type { RequestEvent } from '@sveltejs/kit';

type Bucket = { count: number; resetAt: number };

const loginFailureBuckets = new Map<string, Bucket>();
const registerBuckets = new Map<string, Bucket>();

const LOGIN_FAIL_MAX = 5;
const LOGIN_FAIL_WINDOW_MS = 60_000;

/** Client-IP: bei Reverse-Proxy zuerst X-Forwarded-For (erster Hop). */
export function getClientIp(event: RequestEvent): string {
	const xf = event.request.headers.get('x-forwarded-for');
	if (xf) {
		const first = xf.split(',')[0]?.trim();
		if (first) return first;
	}
	return event.getClientAddress();
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
