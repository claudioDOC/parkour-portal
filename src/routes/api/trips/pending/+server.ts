import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { tripDateOptions, tripParticipants, tripPlans, users } from '$lib/server/db/schema';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

/** Nach so vielen Tagen wird eine Enthaltung erneut abgefragt. */
const ABSTAIN_DAYS = 3;

/**
 * Erster kommender Trip, zu dem der User noch nichts gesagt hat (oder dessen
 * Enthaltung abgelaufen ist). Grundlage für den Entscheidungs-Dialog.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const today = todayYmdInAppTZ();
	const trips = db
		.select({
			id: tripPlans.id,
			title: tripPlans.title,
			startDate: tripPlans.startDate,
			endDate: tripPlans.endDate,
			notes: tripPlans.notes,
			destinationLabel: tripPlans.destinationLabel,
			createdBy: tripPlans.createdBy,
			createdAt: tripPlans.createdAt,
			voteDeadline: tripPlans.voteDeadline,
			dateLockedAt: tripPlans.dateLockedAt
		})
		.from(tripPlans)
		.where(and(eq(tripPlans.deleted, false), gte(tripPlans.endDate, today)))
		.orderBy(asc(tripPlans.startDate))
		.all();

	for (const trip of trips) {
		const part = db
			.select({
				transportMode: tripParticipants.transportMode,
				decidedAt: tripParticipants.decidedAt
			})
			.from(tripParticipants)
			.where(and(eq(tripParticipants.tripId, trip.id), eq(tripParticipants.userId, locals.user.id)))
			.get();

		// Noch gar nichts gesagt → fragen.
		let needsDecision = !part;
		// Enthalten und älter als ABSTAIN_DAYS → erneut fragen.
		if (part?.transportMode === 'enthalten') {
			const decided = part.decidedAt ? Date.parse(part.decidedAt.replace(' ', 'T') + 'Z') : 0;
			needsDecision = !decided || Date.now() - decided > ABSTAIN_DAYS * 86_400_000;
		}
		if (!needsDecision) continue;

		const creator = db
			.select({ username: users.username })
			.from(users)
			.where(eq(users.id, trip.createdBy))
			.get();

		const counts = db
			.select({ transportMode: tripParticipants.transportMode })
			.from(tripParticipants)
			.where(eq(tripParticipants.tripId, trip.id))
			.all();

		const optionCount = db
			.select({ id: tripDateOptions.id })
			.from(tripDateOptions)
			.where(eq(tripDateOptions.tripId, trip.id))
			.all().length;

		return json({
			trip: {
				...trip,
				/** Umfrage offen: mehrere Daten, noch nicht fix → in der App abstimmen statt nur Ja/Nein. */
				pollOpen: !trip.dateLockedAt && optionCount > 1,
				optionCount,
				creatorName: creator?.username ?? null,
				inCount: counts.filter((c) => c.transportMode !== 'abgemeldet' && c.transportMode !== 'enthalten').length,
				outCount: counts.filter((c) => c.transportMode === 'abgemeldet').length
			}
		});
	}

	return json({ trip: null });
};
