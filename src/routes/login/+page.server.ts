import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { attemptLogin } from '$lib/server/attemptLogin';

export const actions = {
	default: async (event) => {
		const fd = await event.request.formData();
		const username = fd.get('username');
		const password = fd.get('password');

		const result = await attemptLogin(event, username, password);
		if (result.kind === 'success') {
			throw redirect(303, '/');
		}

		return fail(result.status, { error: result.error });
	}
} satisfies Actions;
