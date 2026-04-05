import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invites } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { registerWithInvite } from '$lib/server/registerWithInvite';

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

export const actions = {
	default: async (event) => {
		const fd = await event.request.formData();
		const username = fd.get('username');
		const password = fd.get('password');
		const passwordConfirm = fd.get('passwordConfirm');

		const result = await registerWithInvite(
			event,
			username,
			password,
			event.params.token,
			passwordConfirm
		);

		if (result.kind === 'success') {
			throw redirect(303, '/');
		}

		return fail(result.status, { error: result.error });
	}
} satisfies Actions;
