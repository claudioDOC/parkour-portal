import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spots, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

function assertCanManageSpots(locals: App.Locals) {
	if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'spotmanager')) {
		throw error(403, 'Keine Berechtigung');
	}
}

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

export const GET: RequestHandler = async ({ url, locals }) => {
	assertCanManageSpots(locals);

	const deleted = url.searchParams.get('deleted') === 'true';

	const allSpots = db.select({
		id: spots.id,
		name: spots.name,
		city: spots.city,
		deleted: spots.deleted,
		addedByName: users.username,
		createdAt: spots.createdAt
	})
	.from(spots)
	.leftJoin(users, eq(spots.addedBy, users.id))
	.where(eq(spots.deleted, deleted))
	.all();

	return json({ spots: allSpots });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const { spotId, action } = body;

	if (!spotId) {
		return json({ error: 'Spot-ID erforderlich' }, { status: 400 });
	}

	const spot = db.select().from(spots).where(eq(spots.id, spotId)).get();
	if (!spot) {
		return json({ error: 'Spot nicht gefunden' }, { status: 404 });
	}

	if (action === 'trash') {
		assertAdmin(locals);
		db.update(spots).set({ deleted: true }).where(eq(spots.id, spotId)).run();
		return json({ success: true, message: `"${spot.name}" in den Papierkorb verschoben` });
	}

	if (action === 'restore') {
		assertAdmin(locals);
		db.update(spots).set({ deleted: false }).where(eq(spots.id, spotId)).run();
		return json({ success: true, message: `"${spot.name}" wiederhergestellt` });
	}

	if (action === 'edit') {
		assertCanManageSpots(locals);
		const { name, city, latitude, longitude, lighting, techniques, goodWeather, description } = body;

		if (!name || !city) {
			return json({ error: 'Name und Stadt sind erforderlich' }, { status: 400 });
		}

		const techniquesStr = Array.isArray(techniques) ? techniques.join(',') : (techniques || '');
		const weatherStr = Array.isArray(goodWeather) ? goodWeather.join(',') : (goodWeather || 'trocken,nass');

		db.update(spots).set({
			name,
			city,
			latitude: latitude || null,
			longitude: longitude || null,
			lighting: lighting || 'teilweise',
			techniques: techniquesStr,
			goodWeather: weatherStr,
			description: description || null
		}).where(eq(spots.id, spotId)).run();

		return json({ success: true, message: `"${name}" wurde aktualisiert` });
	}

	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};
