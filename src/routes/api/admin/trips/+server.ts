import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	tripPlans,
	tripParticipants,
	tripDestinations,
	tripDestinationVotes,
	tripDateVotes,
	tripDateOptions,
	tripStopovers,
	users
} from '$lib/server/db/schema';
import { logAudit } from '$lib/server/audit';
import { tripPlansHasSoftDeleteColumns } from '$lib/server/tripPlansTableColumns';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

export const GET: RequestHandler = async ({ locals, url }) => {
	assertAdmin(locals);
	if (!tripPlansHasSoftDeleteColumns()) {
		return json({ trips: [] });
	}
	const trashed = url.searchParams.get('trashed') === 'true' || url.searchParams.get('trashed') === '1';
	if (!trashed) {
		return json({ trips: [] });
	}
	const rows = db
		.select({
			id: tripPlans.id,
			title: tripPlans.title,
			startDate: tripPlans.startDate,
			endDate: tripPlans.endDate,
			deletedAt: tripPlans.deletedAt,
			createdByName: users.username
		})
		.from(tripPlans)
		.innerJoin(users, eq(tripPlans.createdBy, users.id))
		.where(eq(tripPlans.deleted, true))
		.orderBy(desc(tripPlans.deletedAt))
		.all();
	return json({ trips: rows });
};

export const PATCH: RequestHandler = async (event) => {
	const { request, locals } = event;
	assertAdmin(locals);
	if (!tripPlansHasSoftDeleteColumns()) {
		return json(
			{ error: 'Trip-Papierkorb nicht verfügbar.', detail: 'npm run db:migrate (0013_trip_plans_soft_delete).' },
			{ status: 503 }
		);
	}
	let body: { tripId?: unknown; action?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Ungültige Anfrage' }, { status: 400 });
	}
	const tripId = Number(body?.tripId);
	const action = String(body?.action || '');
	if (!tripId) return json({ error: 'tripId erforderlich' }, { status: 400 });

	const trip = db.select().from(tripPlans).where(eq(tripPlans.id, tripId)).get();
	if (!trip) return json({ error: 'Trip nicht gefunden' }, { status: 404 });

	if (action === 'trash') {
		if (trip.deleted) {
			return json({ error: 'Trip ist bereits im Papierkorb' }, { status: 400 });
		}
		db.update(tripPlans)
			.set({ deleted: true, deletedAt: new Date().toISOString() })
			.where(eq(tripPlans.id, tripId))
			.run();
		logAudit({
			event,
			action: 'admin.trip.trash',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			detail: { tripId, title: trip.title }
		});
		return json({ success: true, message: `„${trip.title}“ in den Papierkorb verschoben` });
	}
	if (action === 'restore') {
		if (!trip.deleted) {
			return json({ error: 'Trip ist nicht im Papierkorb' }, { status: 400 });
		}
		db.update(tripPlans)
			.set({ deleted: false, deletedAt: null })
			.where(eq(tripPlans.id, tripId))
			.run();
		logAudit({
			event,
			action: 'admin.trip.restore',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			detail: { tripId, title: trip.title }
		});
		return json({ success: true, message: `„${trip.title}“ wiederhergestellt` });
	}
	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};

/** Endgültig löschen nur für Trips im Papierkorb. */
export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	assertAdmin(locals);
	if (!tripPlansHasSoftDeleteColumns()) {
		return json({ error: 'Trip-Papierkorb nicht verfügbar' }, { status: 503 });
	}
	let body: { tripId?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Ungültige Anfrage' }, { status: 400 });
	}
	const tripId = Number(body?.tripId);
	if (!tripId) return json({ error: 'tripId erforderlich' }, { status: 400 });

	const trip = db.select().from(tripPlans).where(eq(tripPlans.id, tripId)).get();
	if (!trip) return json({ error: 'Trip nicht gefunden' }, { status: 404 });
	if (!trip.deleted) {
		return json({ error: 'Nur Trips im Papierkorb können endgültig gelöscht werden' }, { status: 400 });
	}

	db.delete(tripDestinationVotes).where(eq(tripDestinationVotes.tripId, tripId)).run();
	db.delete(tripDateVotes).where(eq(tripDateVotes.tripId, tripId)).run();
	db.delete(tripDateOptions).where(eq(tripDateOptions.tripId, tripId)).run();
	db.delete(tripStopovers).where(eq(tripStopovers.tripId, tripId)).run();
	db.delete(tripDestinations).where(eq(tripDestinations.tripId, tripId)).run();
	db.delete(tripParticipants).where(eq(tripParticipants.tripId, tripId)).run();
	db.delete(tripPlans).where(eq(tripPlans.id, tripId)).run();

	logAudit({
		event,
		action: 'admin.trip.purge',
		actorUserId: locals.user!.id,
		actorUsername: locals.user!.username,
		detail: { tripId, title: trip.title }
	});
	return json({ success: true });
};
