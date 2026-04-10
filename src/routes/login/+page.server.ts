import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { attemptLogin } from '$lib/server/attemptLogin';

export const load: PageServerLoad = async ({ url }) => {
	const pw = url.searchParams.get('pw');
	return {
		flash:
			pw === 'changed'
				? 'Passwort wurde geändert. Bitte mit dem neuen Passwort anmelden.'
				: null
	};
};

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
