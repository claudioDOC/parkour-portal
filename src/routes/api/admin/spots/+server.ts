import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spots, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logAudit } from '$lib/server/audit';
import { spotsTableHasDeletedColumn } from '$lib/server/spotsTableColumns';
import { jsonFromSqliteOrSchemaError } from '$lib/server/sqliteAdminErrors';

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

	if (!spotsTableHasDeletedColumn()) {
		const rows = db
			.select({
				id: spots.id,
				name: spots.name,
				city: spots.city,
				addedByName: users.username,
				createdAt: spots.createdAt
			})
			.from(spots)
			.leftJoin(users, eq(spots.addedBy, users.id))
			.all();
		const allSpots = deleted ? [] : rows.map((r) => ({ ...r, deleted: false }));
		return json({ spots: allSpots });
	}

	const allSpots = db
		.select({
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

export const PATCH: RequestHandler = async (event) => {
	const { request, locals } = event;

	try {
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
			if (!spotsTableHasDeletedColumn()) {
				return json(
					{
						error: 'Spalte spots.deleted fehlt.',
						detail: 'Auf dem Server: npm run db:migrate (Migration 0006).'
					},
					{ status: 503 }
				);
			}
			db.update(spots).set({ deleted: true }).where(eq(spots.id, spotId)).run();
			logAudit({
				event,
				action: 'admin.spot.trash',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { spotId, spotName: spot.name }
			});
			return json({ success: true, message: `"${spot.name}" in den Papierkorb verschoben` });
		}

		if (action === 'restore') {
			assertAdmin(locals);
			if (!spotsTableHasDeletedColumn()) {
				return json(
					{
						error: 'Spalte spots.deleted fehlt.',
						detail: 'Auf dem Server: npm run db:migrate (Migration 0006).'
					},
					{ status: 503 }
				);
			}
			db.update(spots).set({ deleted: false }).where(eq(spots.id, spotId)).run();
			logAudit({
				event,
				action: 'admin.spot.restore',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { spotId, spotName: spot.name }
			});
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

			logAudit({
				event,
				action: 'admin.spot.edit',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { spotId, name, city }
			});
			return json({ success: true, message: `"${name}" wurde aktualisiert` });
		}

		return json({ error: 'Ungültige Aktion' }, { status: 400 });
	} catch (e) {
		console.error('PATCH /api/admin/spots', e);
		const mapped = jsonFromSqliteOrSchemaError(e);
		if (mapped) return mapped;
		return json({ error: 'Spot-Aktion fehlgeschlagen.' }, { status: 500 });
	}
};
