import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { getUserCoreById } from '$lib/server/userCoreQuery';
import type { Cookies } from '@sveltejs/kit';

/**
 * Kein Standard-Secret mehr: Mit einem im Quelltext stehenden Schlüssel
 * kann jede:r gültige Tokens bauen — auch mit `role: "admin"`. Fehlt die
 * Variable, verweigert der Server den Dienst, statt still unsicher zu
 * laufen. Geprüft wird beim ersten Zugriff, damit der Build (der diese
 * Datei nur bündelt) nicht daran scheitert.
 */
let cachedSecret: string | null = null;
function jwtSecret(): string {
	if (cachedSecret) return cachedSecret;
	const secret = process.env.JWT_SECRET?.trim();
	if (!secret || secret.length < 16) {
		throw new Error(
			'JWT_SECRET fehlt oder ist zu kurz (mind. 16 Zeichen). Ohne gesetztes Secret startet das Portal nicht.'
		);
	}
	cachedSecret = secret;
	return cachedSecret;
}
const COOKIE_NAME = 'session';

/**
 * Eigener Schlüssel je Verwendungszweck, abgeleitet aus JWT_SECRET — so
 * taugt etwa ein Kalender-Link nie als Sitzungs-Token und umgekehrt.
 */
export function derivedSecret(purpose: string): Buffer {
	return createHmac('sha256', jwtSecret()).update(`parkour-portal:${purpose}`).digest();
}

export interface JwtPayload {
	userId: number;
	username: string;
	role: 'admin' | 'spotmanager' | 'member';
	/** Ablauf in Sekunden (von jsonwebtoken gesetzt). */
	exp?: number;
	/** Fehlt bei alten Tokens → wird wie 0 behandelt */
	sessionVersion?: number;
}

export function signSessionToken(user: {
	id: number;
	username: string;
	role: string;
	sessionVersion: number;
}): string {
	return jwt.sign(
		{
			userId: user.id,
			username: user.username,
			role: user.role,
			sessionVersion: user.sessionVersion
		},
		jwtSecret(),
		{ expiresIn: '30d' }
	);
}

/**
 * Nur HS256 annehmen. jsonwebtoken lehnt `none` zwar schon ab, aber das
 * Verfahren gehört festgenagelt statt dem Token überlassen.
 */
const VERIFY_OPTS: jwt.VerifyOptions = { algorithms: ['HS256'] };

function verifyToken(token: string): JwtPayload | null {
	try {
		return jwt.verify(token, jwtSecret(), VERIFY_OPTS) as JwtPayload;
	} catch {
		return null;
	}
}

export function verifyBearerJwt(authHeader: string | null): JwtPayload | null {
	if (!authHeader) return null;
	const v = authHeader.trim();
	if (!v.toLowerCase().startsWith('bearer ')) return null;
	const token = v.slice(7).trim();
	if (!token) return null;
	return verifyToken(token);
}

export async function hashPassword(password: string): Promise<string> {
	return bcryptjs.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcryptjs.compare(password, hash);
}

export function createSession(
	user: { id: number; username: string; role: string; sessionVersion: number },
	cookies: Cookies
) {
	const token = signSessionToken(user);

	const origin = (process.env.ORIGIN ?? '').toLowerCase();
	const secure = origin.startsWith('https://');

	cookies.set(COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: 60 * 60 * 24 * 30
	});
}

export function getSession(cookies: Cookies): JwtPayload | null {
	const token = cookies.get(COOKIE_NAME);
	if (!token) return null;
	return verifyToken(token);
}

/**
 * Gültige Sitzung der Anfrage — zusammen mit GENAU dem Token, das geprüft
 * wurde: zuerst Bearer (App), sonst Cookie (Browser).
 *
 * Das rohe Token gehört zur Prüfung dazu: Vorher wurde die Sperrliste
 * (Abmelden) gegen den Bearer-Wert geprüft, die Sitzung aber notfalls aus
 * dem Cookie genommen. Ein abgemeldetes Cookie-Token galt so weiter,
 * sobald man irgendeinen Unsinn als Bearer mitschickte.
 */
export function getVerifiedSession(
	cookies: Cookies,
	request: Request
): { payload: JwtPayload; raw: string } | null {
	const header = request.headers.get('authorization') ?? '';
	if (header.toLowerCase().startsWith('bearer ')) {
		const raw = header.slice(7).trim();
		const payload = raw ? verifyToken(raw) : null;
		if (payload) return { payload, raw };
	}
	const raw = cookies.get(COOKIE_NAME);
	const payload = raw ? verifyToken(raw) : null;
	return payload && raw ? { payload, raw } : null;
}

export function getSessionFromCookiesOrBearer(cookies: Cookies, request: Request): JwtPayload | null {
	return getVerifiedSession(cookies, request)?.payload ?? null;
}

export function clearSession(cookies: Cookies) {
	const origin = (process.env.ORIGIN ?? '').toLowerCase();
	const secure = origin.startsWith('https://');
	cookies.delete(COOKIE_NAME, { path: '/', secure });
}

export function getUserById(id: number) {
	return getUserCoreById(id);
}
