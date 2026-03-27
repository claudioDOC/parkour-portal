import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSystemSnapshot } from '$lib/server/system';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

export const GET: RequestHandler = async ({ locals }) => {
	assertAdmin(locals);
	const snapshot = await getSystemSnapshot();
	return json(snapshot);
};
