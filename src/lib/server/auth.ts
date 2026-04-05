import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { getUserCoreById } from '$lib/server/userCoreQuery';
import type { Cookies } from '@sveltejs/kit';

const JWT_SECRET = process.env.JWT_SECRET || 'parkour-portal-secret-change-me';
const COOKIE_NAME = 'session';

interface JwtPayload {
	userId: number;
	username: string;
	role: 'admin' | 'spotmanager' | 'member';
	/** Fehlt bei alten Tokens → wird wie 0 behandelt */
	sessionVersion?: number;
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
	const token = jwt.sign(
		{
			userId: user.id,
			username: user.username,
			role: user.role,
			sessionVersion: user.sessionVersion
		},
		JWT_SECRET,
		{ expiresIn: '30d' }
	);

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
		return jwt.verify(token, JWT_SECRET) as JwtPayload;
	} catch {
		return null;
	}
}

export function clearSession(cookies: Cookies) {
	const origin = (process.env.ORIGIN ?? '').toLowerCase();
	const secure = origin.startsWith('https://');
	cookies.delete(COOKIE_NAME, { path: '/', secure });
}

export function getUserById(id: number) {
	return getUserCoreById(id);
}
