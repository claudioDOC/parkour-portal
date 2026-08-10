import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

/** /profil = mein Profil — leitet auf die öffentliche Profilseite weiter. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	throw redirect(302, `/profil/${locals.user.id}`);
};
