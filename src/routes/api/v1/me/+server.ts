import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return json({
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
