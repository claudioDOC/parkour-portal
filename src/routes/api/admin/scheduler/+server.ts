import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runPushSchedulerNow } from '$lib/server/pushScheduler';
import { logAudit } from '$lib/server/audit';

/**
 * Manueller Lauf des Erinnerungs-Schedulers (Admin). Normalerweise läuft
 * er alle fünf Minuten von selbst; hier lässt sich ein Durchgang sofort
 * anstossen — etwa um eine abgelaufene Trip-Frist ohne Warten zu
 * verarbeiten oder die Logik zu prüfen.
 */
export const POST: RequestHandler = async (event) => {
	const { locals } = event;
	if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Nur Admin');
	await runPushSchedulerNow();
	logAudit({
		event,
		action: 'admin.scheduler.run',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username
	});
	return json({ success: true });
};
