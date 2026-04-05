import type { RequestEvent } from '@sveltejs/kit';

type Bucket = { count: number; resetAt: number };

const loginBuckets = new Map<string, Bucket>();
const registerBuckets = new Map<string, Bucket>();

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

/** Max. 5 Login-Versuche pro Minute pro IP (Brute-Force-Schutz). */
export function rateLimitAuthLogin(ip: string) {
	return consume(loginBuckets, ip, 5, 60_000);
}

/** Max. 10 Registrierungen pro Stunde pro IP (Invite + Massen-Accounts). */
export function rateLimitAuthRegister(ip: string) {
	return consume(registerBuckets, ip, 10, 3_600_000);
}
