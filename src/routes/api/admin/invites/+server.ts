import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { invites, users } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import cryptoRandomString from 'crypto-random-string';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Kein Zugriff');

	const allInvites = db.select({
		id: invites.id,
		token: invites.token,
		used: invites.used,
		expiresAt: invites.expiresAt,
		createdAt: invites.createdAt,
		createdByName: users.username
	})
		.from(invites)
		.innerJoin(users, eq(invites.createdBy, users.id))
		.orderBy(desc(invites.createdAt))
		.all();

	return json({ invites: allInvites });
};

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Kein Zugriff');

	const token = cryptoRandomString({ length: 32, type: 'url-safe' });

	const expires = new Date();
	expires.setDate(expires.getDate() + 7);

	const result = db.insert(invites).values({
		token,
		createdBy: locals.user.id,
		expiresAt: expires.toISOString()
	}).returning().get();

	return json({ success: true, invite: result });
};
