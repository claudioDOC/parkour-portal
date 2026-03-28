import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { db } from './db';
import { users } from './db/schema';
import { userCoreAuth } from './db/userCoreSelect';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';

const JWT_SECRET = process.env.JWT_SECRET || 'parkour-portal-secret-change-me';
const COOKIE_NAME = 'session';

interface JwtPayload {
	userId: number;
	username: string;
	role: 'admin' | 'spotmanager' | 'member';
}

export async function hashPassword(password: string): Promise<string> {
	return bcryptjs.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcryptjs.compare(password, hash);
}

export function createSession(user: { id: number; username: string; role: string }, cookies: Cookies) {
	const token = jwt.sign(
		{ userId: user.id, username: user.username, role: user.role },
		JWT_SECRET,
		{ expiresIn: '30d' }
	);

	cookies.set(COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
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
	cookies.delete(COOKIE_NAME, { path: '/' });
}

export function getUserById(id: number) {
	return db.select(userCoreAuth).from(users).where(eq(users.id, id)).get();
}
