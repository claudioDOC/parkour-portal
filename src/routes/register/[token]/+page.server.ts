import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invites } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const invite = db.select().from(invites)
		.where(and(eq(invites.token, params.token), eq(invites.used, false)))
		.get();

	if (!invite) {
		throw error(404, 'Ungültiger oder bereits verwendeter Einladungslink');
	}

	const now = new Date().toISOString();
	if (invite.expiresAt < now) {
		throw error(410, 'Einladungslink ist abgelaufen');
	}

	return { token: params.token };
};
