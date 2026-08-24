import type { PageServerLoad } from './$types';
import { buildSpotsListPayload } from '$lib/server/spotsListPayload';
import { buildSpotMapPayload } from '$lib/server/spotMapPayload';

/**
 * Liste und Karte kommen zusammen — die Karte ist die zweite Ansicht
 * derselben Seite, und beim Umschalten soll nichts nachgeladen werden.
 */
export const load: PageServerLoad = async () => ({
	...buildSpotsListPayload(),
	map: buildSpotMapPayload()
});
