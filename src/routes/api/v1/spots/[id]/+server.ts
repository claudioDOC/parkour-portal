import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildSpotDetailPayload } from '$lib/server/spotDetailPayload';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const spotId = parseInt(params.id, 10);
	if (Number.isNaN(spotId)) {
		return json({ error: 'Ungültige Spot-ID' }, { status: 400 });
	}

	const payload = buildSpotDetailPayload(spotId, locals.user.id);
	if (!payload) {
		return json({ error: 'Spot nicht gefunden' }, { status: 404 });
	}

	return json({
		...payload,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			role: locals.user.role,
			trainingAttendance: locals.user.trainingAttendance,
			autoAbsentWeekdays: locals.user.autoAbsentWeekdays,
			uiTheme: locals.user.uiTheme
		}
	});
};
