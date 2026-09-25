import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { activePenaltyFor } from '$lib/server/noShowPenalty';

/**
 * Laufende Strafrunde der angemeldeten Person — Grundlage für den
 * Warnhinweis beim Öffnen (Web und App). Ohne Strafe: `{ penalty: null }`.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return json({ penalty: activePenaltyFor(locals.user.id) });
};
