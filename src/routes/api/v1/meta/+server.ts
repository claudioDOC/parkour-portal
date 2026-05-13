import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Öffentliche Meta-Infos (ohne Login). */
export const GET: RequestHandler = async () => {
	return json({
		name: 'parkour-portal',
		apiVersion: '1',
		documentation: 'docs/API.md (Repository)',
		endpoints: {
			public: [
				'GET /api/v1/meta',
				'GET /api/public/status/today',
				'GET /api/public/status/next',
				'GET /api/public/stats (X-API-Key)',
				'POST /api/auth/register',
				'POST /api/auth/login'
			],
			authenticated: [
				'GET /api/v1/me',
				'GET /api/v1/spots',
				'GET /api/v1/spots/:id',
				'GET /api/v1/challenges',
				'GET /api/v1/training/sessions',
				'GET /api/spots (Liste, kompakt)',
				'POST /api/spots',
				'POST /api/spots/vote',
				'DELETE /api/spots/vote',
				'POST /api/spots/images',
				'DELETE /api/spots/images',
				'POST /api/spots/challenges',
				'PATCH /api/spots/challenges',
				'DELETE /api/spots/challenges',
				'PUT /api/spots/challenges',
				'POST /api/spots/challenges/images',
				'DELETE /api/spots/challenges/images',
				'POST /api/training',
				'GET /api/training/watch',
				'GET /api/finder',
				'GET /api/geocode',
				'GET/POST /api/trips',
				'POST /api/auth/logout',
				'POST /api/auth/change-password',
				'PATCH /api/user/ui-theme'
			]
		}
	});
};
