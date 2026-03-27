import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spots, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const allSpots = db.select({
		id: spots.id,
		name: spots.name,
		city: spots.city,
		addedByName: users.username
	})
	.from(spots)
	.leftJoin(users, eq(spots.addedBy, users.id))
	.where(eq(spots.deleted, false))
	.all();

	return json({ spots: allSpots });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const { name, city, latitude, longitude, lighting, techniques, goodWeather, description } = body;

	if (!name || !city) {
		return json({ error: 'Name und Stadt sind erforderlich' }, { status: 400 });
	}

	const techniquesStr = Array.isArray(techniques) ? techniques.join(',') : (techniques || '');
	const weatherStr = Array.isArray(goodWeather) ? goodWeather.join(',') : (goodWeather || 'trocken,nass');

	const result = db.insert(spots).values({
		name,
		city,
		latitude: latitude || null,
		longitude: longitude || null,
		lighting: lighting || 'teilweise',
		techniques: techniquesStr,
		goodWeather: weatherStr,
		description: description || null,
		addedBy: locals.user.id
	}).returning().get();

	return json({ success: true, spot: result });
};
