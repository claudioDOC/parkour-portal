import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { buildProfilePayload } from '$lib/server/profilePayload';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const id = Number(params.id);
	if (!Number.isFinite(id) || id <= 0) throw error(404, 'Profil nicht gefunden');

	const payload = buildProfilePayload(id);
	if (!payload) throw error(404, 'Profil nicht gefunden');

	return { ...payload, isOwn: id === locals.user.id };
};
