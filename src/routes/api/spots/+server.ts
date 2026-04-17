import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spots, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logAudit } from '$lib/server/audit';
import { spotsTableHasMicrospotColumns } from '$lib/server/spotsTableColumns';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const hasMicro = spotsTableHasMicrospotColumns();

	const allSpots = hasMicro
		? db
				.select({
					id: spots.id,
					name: spots.name,
					city: spots.city,
					isMicro: spots.isMicro,
					parentSpotId: spots.parentSpotId,
					addedByName: users.username
				})
				.from(spots)
				.leftJoin(users, eq(spots.addedBy, users.id))
				.where(eq(spots.deleted, false))
				.all()
		: db
				.select({
					id: spots.id,
					name: spots.name,
					city: spots.city,
					addedByName: users.username
				})
				.from(spots)
				.leftJoin(users, eq(spots.addedBy, users.id))
				.where(eq(spots.deleted, false))
				.all()
				.map((s) => ({ ...s, isMicro: false, parentSpotId: null }));

	return json({ spots: allSpots });
};

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const { name, city, latitude, longitude, lighting, techniques, goodWeather, description, isMicro, parentSpotId } = body;
	const hasMicro = spotsTableHasMicrospotColumns();

	if (!name || !city) {
		return json({ error: 'Name und Stadt sind erforderlich' }, { status: 400 });
	}

	const techniquesStr = Array.isArray(techniques) ? techniques.join(',') : (techniques || '');
	const weatherStr = Array.isArray(goodWeather) ? goodWeather.join(',') : (goodWeather || 'trocken,nass');
	const isMicroBool = Boolean(isMicro);
	const parentIdNum = parentSpotId ? Number(parentSpotId) : null;

	const result = db.insert(spots).values({
		name,
		city,
		latitude: latitude || null,
		longitude: longitude || null,
		...(hasMicro
			? {
					isMicro: isMicroBool,
					parentSpotId: isMicroBool ? parentIdNum : null
				}
			: {}),
		lighting: lighting || 'teilweise',
		techniques: techniquesStr,
		goodWeather: weatherStr,
		description: description || null,
		addedBy: locals.user.id
	}).returning().get();

	logAudit({
		event,
		action: 'spot.create',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { spotId: result.id, name: result.name, city: result.city }
	});

	return json({ success: true, spot: result });
};
