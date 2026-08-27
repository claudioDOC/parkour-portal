import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
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

export function verifyBearerJwt(authHeader: string | null): JwtPayload | null {
	if (!authHeader) return null;
	const v = authHeader.trim();
	if (!v.toLowerCase().startsWith('bearer ')) return null;
	const token = v.slice(7).trim();
	if (!token) return null;
	try {
		return jwt.verify(token, jwtSecret()) as JwtPayload;
	} catch {
		return null;
	}
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

	try {
		return jwt.verify(token, jwtSecret()) as JwtPayload;
	} catch {
		return null;
	}
}

export function getSessionFromCookiesOrBearer(cookies: Cookies, request: Request): JwtPayload | null {
	const fromBearer = verifyBearerJwt(request.headers.get('authorization'));
	if (fromBearer) return fromBearer;
	return getSession(cookies);
}

/** Rohes Token der aktuellen Anfrage — für das Entwerten beim Abmelden. */
export function getRawToken(cookies: Cookies, request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	if (header.toLowerCase().startsWith('bearer ')) {
		const raw = header.slice(7).trim();
		if (raw) return raw;
	}
	return cookies.get(COOKIE_NAME) ?? null;
}

export function clearSession(cookies: Cookies) {
	const origin = (process.env.ORIGIN ?? '').toLowerCase();
	const secure = origin.startsWith('https://');
	cookies.delete(COOKIE_NAME, { path: '/', secure });
}

export function getUserById(id: number) {
	return getUserCoreById(id);
}
