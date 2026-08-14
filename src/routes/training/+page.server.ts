import type { PageServerLoad } from './$types';
import { buildTrainingPagePayload } from '$lib/server/trainingPagePayload';

export const load: PageServerLoad = async ({ locals }) => buildTrainingPagePayload(locals.user);
