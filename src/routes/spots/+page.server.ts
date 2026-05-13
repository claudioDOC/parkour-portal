import type { PageServerLoad } from './$types';
import { buildSpotsListPayload } from '$lib/server/spotsListPayload';

export const load: PageServerLoad = async () => buildSpotsListPayload();
