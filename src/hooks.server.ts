import type { Handle } from '@sveltejs/kit';
import { getSession } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';

const publicPaths = ['/login', '/register', '/api/auth/login', '/api/auth/register'];

export const handle: Handle = async ({ event, resolve }) => {
	const session = getSession(event.cookies);

	if (session) {
		event.locals.user = {
			id: session.userId,
			username: session.username,
			role: session.role
		};
	} else {
		event.locals.user = null;
	}

	const isPublic = publicPaths.some((p) => event.url.pathname.startsWith(p));

	if (!isPublic && !event.locals.user && !event.url.pathname.startsWith('/api')) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};
