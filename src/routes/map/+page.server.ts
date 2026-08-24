import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Die Karte ist keine eigene Seite mehr, sondern die zweite Ansicht der
 * Spots-Seite. Alte Links und Lesezeichen landen dort statt im Nichts.
 */
export const load: PageServerLoad = async () => {
	redirect(308, '/spots?ansicht=karte');
};
