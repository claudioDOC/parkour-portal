import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	tripPlans,
	tripParticipants,
	tripDestinations,
	tripDestinationVotes,
	tripDateOptions,
	tripDateVotes,
	tripStopovers
} from '$lib/server/db/schema';
import { logAudit } from '$lib/server/audit';
import { recordEvent } from '$lib/server/activity';
import { sendToUsersWithPref } from '$lib/server/push';

function parseCoord(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null;
	const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
	return Number.isFinite(n) ? n : null;
}


/**
 * Terminabstimmung: Erreicht ein Vorschlag mehr als 50 % der stimmberechtigten
 * Teilnehmer (alle ausser abgemeldet/enthalten), wird er zum neuen Trip-Termin.
 * Der bisherige Termin wandert als Option zurück in die Liste, damit man
 * zurückwechseln kann. Gibt den übernommenen Vorschlag zurück, sonst null.
 */
function applyDateOptionIfMajority(tripId: number): { startDate: string; endDate: string } | null {
	const trip = db.select().from(tripPlans).where(eq(tripPlans.id, tripId)).get();
	if (!trip) return null;

	const eligible = db
		.select({ transportMode: tripParticipants.transportMode })
		.from(tripParticipants)
		.where(eq(tripParticipants.tripId, tripId))
		.all()
		.filter((p) => p.transportMode !== 'abgemeldet' && p.transportMode !== 'enthalten').length;
	if (eligible === 0) return null;

	const votes = db
		.select({ dateOptionId: tripDateVotes.dateOptionId })
		.from(tripDateVotes)
		.where(eq(tripDateVotes.tripId, tripId))
		.all();
	const tally = new Map<number, number>();
	for (const v of votes) tally.set(v.dateOptionId, (tally.get(v.dateOptionId) ?? 0) + 1);

	for (const [optionId, count] of tally) {
		if (count * 2 <= eligible) continue; // echte Mehrheit verlangt
		const option = db
			.select()
			.from(tripDateOptions)
			.where(and(eq(tripDateOptions.id, optionId), eq(tripDateOptions.tripId, tripId)))
			.get();
		if (!option) continue;
		if (option.startDate === trip.startDate && option.endDate === trip.endDate) continue;

		db.update(tripPlans)
			.set({ startDate: option.startDate, endDate: option.endDate })
			.where(eq(tripPlans.id, tripId))
			.run();

		// Alten Termin als Option erhalten, neuen aus der Liste nehmen —
		// sonst stimmt man über den bereits gültigen Termin ab.
		db.delete(tripDateVotes).where(eq(tripDateVotes.tripId, tripId)).run();
		db.delete(tripDateOptions).where(eq(tripDateOptions.id, optionId)).run();
		const oldStillListed = db
			.select({ id: tripDateOptions.id })
			.from(tripDateOptions)
			.where(
				and(
					eq(tripDateOptions.tripId, tripId),
					eq(tripDateOptions.startDate, trip.startDate),
					eq(tripDateOptions.endDate, trip.endDate)
				)
			)
			.get();
		if (!oldStillListed) {
			db.insert(tripDateOptions)
				.values({
					tripId,
					startDate: trip.startDate,
					endDate: trip.endDate,
					note: 'Vorheriger Termin',
					proposedBy: trip.createdBy
				})
				.run();
		}
		return { startDate: option.startDate, endDate: option.endDate };
	}
	return null;
}

export const POST: RequestHandler = async (event) => {
	const { locals, request } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const action = String(body?.action || '');

	if (action === 'create_trip') {
		const title = String(body?.title || '').trim();
		const startDate = String(body?.startDate || '').trim();
		const endDate = String(body?.endDate || '').trim();
		const notes = String(body?.notes || '').trim();
		if (!title || !startDate || !endDate) {
			return json({ error: 'Titel, Start- und Enddatum sind erforderlich' }, { status: 400 });
		}
		if (endDate < startDate) {
			return json({ error: 'Enddatum darf nicht vor Startdatum liegen' }, { status: 400 });
		}
		const destLat = parseCoord(body?.destinationLatitude);
		const destLon = parseCoord(body?.destinationLongitude);
		const destLabel = String(body?.destinationLabel || '').trim() || null;
		let destinationLatitude: number | null = null;
		let destinationLongitude: number | null = null;
		let destinationLabel: string | null = null;
		if (destLat != null && destLon != null) {
			if (destLat < -90 || destLat > 90 || destLon < -180 || destLon > 180) {
				return json({ error: 'Ungültige Koordinaten für Kartenziel' }, { status: 400 });
			}
			destinationLatitude = destLat;
			destinationLongitude = destLon;
			destinationLabel = destLabel;
		} else if (destLat != null || destLon != null) {
			return json({ error: 'Kartenziel: Breite und Länge angeben oder beide weglassen' }, { status: 400 });
		}
		const created = db
			.insert(tripPlans)
			.values({
				title,
				startDate,
				endDate,
				notes: notes || null,
				destinationLatitude,
				destinationLongitude,
				destinationLabel,
				transportMode: 'auto',
				carCount: 0,
				seatsPerCar: 0,
				createdBy: locals.user.id
			})
			.returning({ id: tripPlans.id })
			.get();

		logAudit({
			event,
			action: 'trip.create',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId: created.id, title, startDate, endDate }
		});
		void sendToUsersWithPref(
			'trips',
			{
				title: `Neuer Trip: ${title}`,
				body: `${startDate} – ${endDate}. Bist du dabei?`,
				url: '/trips',
				tag: `trip-new-${created.id}`
			},
			undefined,
			{ excludeUserIds: [locals.user.id] }
		).catch(() => undefined);

		recordEvent({
			kind: 'trip.new',
			actorUserId: locals.user.id,
			actorName: locals.user.username,
			title: `Neuer Trip: ${title}`,
			body: `${startDate} – ${endDate} · von ${locals.user.username}`,
			url: '/trips'
		});

		return json({ success: true, tripId: created.id });
	}

	const tripId = Number(body?.tripId);
	if (!Number.isFinite(tripId)) return json({ error: 'Trip-ID erforderlich' }, { status: 400 });
	const trip = db.select().from(tripPlans).where(eq(tripPlans.id, tripId)).get();
	if (!trip) return json({ error: 'Trip nicht gefunden' }, { status: 404 });

	// Trip-Eckdaten ändern (Titel, Zeitraum, Notizen) — Ersteller oder Admin.
	if (action === 'edit_trip') {
		const canEdit = trip.createdBy === locals.user.id || locals.user.role === 'admin';
		if (!canEdit) {
			return json({ error: 'Nur Trip-Ersteller oder Admin kann den Trip bearbeiten' }, { status: 403 });
		}
		const title = String(body?.title || '').trim();
		const startDate = String(body?.startDate || '').trim();
		const endDate = String(body?.endDate || '').trim();
		const notes = String(body?.notes ?? '').trim();
		if (!title || !startDate || !endDate) {
			return json({ error: 'Titel, Start- und Enddatum sind erforderlich' }, { status: 400 });
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
			return json({ error: 'Datum im Format JJJJ-MM-TT angeben' }, { status: 400 });
		}
		if (endDate < startDate) {
			return json({ error: 'Enddatum darf nicht vor Startdatum liegen' }, { status: 400 });
		}
		db.update(tripPlans)
			.set({ title, startDate, endDate, notes: notes || null })
			.where(eq(tripPlans.id, tripId))
			.run();
		logAudit({
			event,
			action: 'trip.edit',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, title, startDate, endDate }
		});
		return json({ success: true });
	}

	if (action === 'set_trip_destination') {
		const canEdit = trip.createdBy === locals.user.id || locals.user.role === 'admin';
		if (!canEdit) {
			return json({ error: 'Nur Trip-Ersteller oder Admin kann das Kartenziel setzen' }, { status: 403 });
		}
		if (body?.clear === true) {
			db.update(tripPlans)
				.set({
					destinationLatitude: null,
					destinationLongitude: null,
					destinationLabel: null
				})
				.where(eq(tripPlans.id, tripId))
				.run();
			logAudit({
				event,
				action: 'trip.destination.clear',
				actorUserId: locals.user.id,
				actorUsername: locals.user.username,
				detail: { tripId }
			});
			return json({ success: true });
		}
		const lat = parseCoord(body?.latitude);
		const lon = parseCoord(body?.longitude);
		const label = String(body?.label || '').trim() || null;
		if (lat == null || lon == null) {
			return json({ error: 'Breiten- und Längengrad für das Ziel sind erforderlich' }, { status: 400 });
		}
		if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
			return json({ error: 'Ungültige Koordinaten' }, { status: 400 });
		}
		db.update(tripPlans)
			.set({
				destinationLatitude: lat,
				destinationLongitude: lon,
				destinationLabel: label
			})
			.where(eq(tripPlans.id, tripId))
			.run();
		logAudit({
			event,
			action: 'trip.destination.set',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, label }
		});
		return json({ success: true });
	}

	if (action === 'propose_stopover') {
		const label = String(body?.label || '').trim();
		const lat = parseCoord(body?.latitude);
		const lon = parseCoord(body?.longitude);
		if (!label || lat == null || lon == null) {
			return json({ error: 'Bezeichnung und Koordinaten für den Zwischenstopp sind erforderlich' }, { status: 400 });
		}
		if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
			return json({ error: 'Ungültige Koordinaten' }, { status: 400 });
		}
		const maxRow = db
			.select({
				mx: sql<number>`coalesce(max(${tripStopovers.sortOrder}), -1)`.mapWith(Number)
			})
			.from(tripStopovers)
			.where(eq(tripStopovers.tripId, tripId))
			.get();
		const sortOrder = (maxRow?.mx ?? -1) + 1;
		const inserted = db
			.insert(tripStopovers)
			.values({
				tripId,
				label,
				latitude: lat,
				longitude: lon,
				sortOrder,
				proposedBy: locals.user.id
			})
			.returning({ id: tripStopovers.id })
			.get();
		logAudit({
			event,
			action: 'trip.stopover.add',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, stopoverId: inserted.id, label }
		});
		return json({ success: true, stopoverId: inserted.id });
	}

	if (action === 'delete_stopover') {
		const stopoverId = Number(body?.stopoverId);
		if (!Number.isFinite(stopoverId)) {
			return json({ error: 'Zwischenstopp-ID erforderlich' }, { status: 400 });
		}
		const row = db.select().from(tripStopovers).where(eq(tripStopovers.id, stopoverId)).get();
		if (!row || row.tripId !== tripId) {
			return json({ error: 'Zwischenstopp nicht gefunden' }, { status: 404 });
		}
		if (row.proposedBy !== locals.user.id && locals.user.role !== 'admin') {
			return json({ error: 'Nur eigener Vorschlag oder Admin kann löschen' }, { status: 403 });
		}
		db.delete(tripStopovers).where(eq(tripStopovers.id, stopoverId)).run();
		logAudit({
			event,
			action: 'trip.stopover.delete',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, stopoverId }
		});
		return json({ success: true });
	}

	if (action === 'join_trip') {
		/**
		 * „dabei" oder „bedingt" (dabei, aber unter Vorbehalt — die
		 * Bedingung steht in der Notiz). Die alten Anreise-Werte werden
		 * weiterhin angenommen, damit ältere App-Versionen nicht brechen.
		 */
		const raw = String(body?.mode ?? body?.transportMode ?? 'dabei').trim();
		const transportMode = raw === 'bedingt' ? 'bedingt' : raw || 'dabei';
		const note = String(body?.note || '').trim();
		const existing = db
			.select({ id: tripParticipants.id })
			.from(tripParticipants)
			.where(and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.userId, locals.user.id)))
			.get();
		if (existing) {
			db.update(tripParticipants)
				.set({
					transportMode,
					decidedAt: sql`(datetime('now'))`,
					vehicleFrom: null,
					hasCar: false,
					seatsOffered: 0,
					note: note || null
				})
				.where(eq(tripParticipants.id, existing.id))
				.run();
		} else {
			db.insert(tripParticipants)
				.values({
					tripId,
					userId: locals.user.id,
					transportMode,
					decidedAt: sql`(datetime('now'))`,
					vehicleFrom: null,
					hasCar: false,
					seatsOffered: 0,
					note: note || null
				})
				.run();
		}
		logAudit({
			event,
			action: existing ? 'trip.join.update' : 'trip.join',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, transportMode }
		});
		return json({ success: true });
	}

	if (action === 'abstain_trip') {
		const existing = db
			.select({ id: tripParticipants.id })
			.from(tripParticipants)
			.where(and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.userId, locals.user.id)))
			.get();
		if (existing) {
			db.update(tripParticipants)
				.set({ transportMode: 'enthalten', decidedAt: sql`(datetime('now'))` })
				.where(eq(tripParticipants.id, existing.id))
				.run();
		} else {
			db.insert(tripParticipants)
				.values({
					tripId,
					userId: locals.user.id,
					transportMode: 'enthalten',
					decidedAt: sql`(datetime('now'))`
				})
				.run();
		}
		logAudit({
			event,
			action: 'trip.abstain',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId }
		});
		return json({ success: true });
	}

	if (action === 'decline_trip') {
		const note = String(body?.note || '').trim();
		const existing = db
			.select({ id: tripParticipants.id })
			.from(tripParticipants)
			.where(and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.userId, locals.user.id)))
			.get();
		if (existing) {
			db.update(tripParticipants)
				.set({
					transportMode: 'abgemeldet',
					decidedAt: sql`(datetime('now'))`,
					vehicleFrom: null,
					hasCar: false,
					seatsOffered: 0,
					note: note || null
				})
				.where(eq(tripParticipants.id, existing.id))
				.run();
		} else {
			db.insert(tripParticipants)
				.values({
					tripId,
					userId: locals.user.id,
					transportMode: 'abgemeldet',
					vehicleFrom: null,
					hasCar: false,
					seatsOffered: 0,
					note: note || null
				})
				.run();
		}
		logAudit({
			event,
			action: existing ? 'trip.decline.update' : 'trip.decline',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId }
		});
		return json({ success: true });
	}

	if (action === 'leave_trip') {
		db.delete(tripParticipants)
			.where(and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.userId, locals.user.id)))
			.run();
		logAudit({
			event,
			action: 'trip.leave',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId }
		});
		return json({ success: true });
	}

	if (action === 'propose_plan_option' || action === 'propose_destination') {
		const text = String(body?.text ?? body?.name ?? '').trim();
		if (!text) return json({ error: 'Text für den Ablauf-Vorschlag ist erforderlich' }, { status: 400 });
		const inserted = db
			.insert(tripDestinations)
			.values({ tripId, name: text, city: '', note: null, proposedBy: locals.user.id })
			.returning({ id: tripDestinations.id })
			.get();
		// Wie beim Spot-Voting: eigener Vorschlag zählt direkt als eigener Vote.
		db.insert(tripDestinationVotes)
			.values({ tripId, destinationId: inserted.id, userId: locals.user.id })
			.onConflictDoUpdate({
				target: [tripDestinationVotes.tripId, tripDestinationVotes.userId],
				set: { destinationId: inserted.id }
			})
			.run();
		logAudit({
			event,
			action: 'trip.destination.propose',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, destinationId: inserted.id, preview: text.slice(0, 120) }
		});
		return json({ success: true });
	}

	if (action === 'vote_plan_option' || action === 'vote_destination') {
		const destinationId = Number(body?.destinationId);
		if (!Number.isFinite(destinationId)) return json({ error: 'Ziel-ID erforderlich' }, { status: 400 });
		const destination = db
			.select()
			.from(tripDestinations)
			.where(and(eq(tripDestinations.id, destinationId), eq(tripDestinations.tripId, tripId)))
			.get();
		if (!destination) return json({ error: 'Ziel nicht gefunden' }, { status: 404 });

		const existing = db
			.select({ id: tripDestinationVotes.id })
			.from(tripDestinationVotes)
			.where(and(eq(tripDestinationVotes.tripId, tripId), eq(tripDestinationVotes.userId, locals.user.id)))
			.get();
		if (existing) {
			db.update(tripDestinationVotes)
				.set({ destinationId })
				.where(eq(tripDestinationVotes.id, existing.id))
				.run();
		} else {
			db.insert(tripDestinationVotes)
				.values({ tripId, destinationId, userId: locals.user.id })
				.run();
		}
		logAudit({
			event,
			action: existing ? 'trip.destination.vote.change' : 'trip.destination.vote',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, destinationId }
		});
		return json({ success: true });
	}

	if (action === 'propose_date_option') {
		const startDate = String(body?.startDate || '').trim();
		const endDate = String(body?.endDate || '').trim();
		const noteRaw = String(body?.note || '').trim();
		const note = noteRaw || null;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
			return json({ error: 'Start- und Enddatum im Format JJJJ-MM-TT erforderlich' }, { status: 400 });
		}
		if (endDate < startDate) {
			return json({ error: 'Enddatum darf nicht vor dem Startdatum liegen' }, { status: 400 });
		}
		const inserted = db
			.insert(tripDateOptions)
			.values({
				tripId,
				startDate,
				endDate,
				note,
				proposedBy: locals.user.id
			})
			.returning({ id: tripDateOptions.id })
			.get();
		db.insert(tripDateVotes)
			.values({ tripId, dateOptionId: inserted.id, userId: locals.user.id })
			.onConflictDoUpdate({
				target: [tripDateVotes.tripId, tripDateVotes.userId],
				set: { dateOptionId: inserted.id }
			})
			.run();
		logAudit({
			event,
			action: 'trip.date_option.propose',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, dateOptionId: inserted.id, startDate, endDate }
		});
		return json({ success: true });
	}

	if (action === 'vote_date_option') {
		const dateOptionId = Number(body?.dateOptionId);
		if (!Number.isFinite(dateOptionId)) {
			return json({ error: 'Datums-Option-ID erforderlich' }, { status: 400 });
		}
		const option = db
			.select()
			.from(tripDateOptions)
			.where(and(eq(tripDateOptions.id, dateOptionId), eq(tripDateOptions.tripId, tripId)))
			.get();
		if (!option) return json({ error: 'Datums-Vorschlag nicht gefunden' }, { status: 404 });

		const existing = db
			.select({ id: tripDateVotes.id })
			.from(tripDateVotes)
			.where(and(eq(tripDateVotes.tripId, tripId), eq(tripDateVotes.userId, locals.user.id)))
			.get();
		if (existing) {
			db.update(tripDateVotes)
				.set({ dateOptionId })
				.where(eq(tripDateVotes.id, existing.id))
				.run();
		} else {
			db.insert(tripDateVotes)
				.values({ tripId, dateOptionId, userId: locals.user.id })
				.run();
		}
		logAudit({
			event,
			action: existing ? 'trip.date_option.vote.change' : 'trip.date_option.vote',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, dateOptionId }
		});

		const adopted = applyDateOptionIfMajority(tripId);
		if (adopted) {
			const fmt = (d: string) =>
				new Date(d + 'T12:00:00').toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
			const range =
				adopted.startDate === adopted.endDate
					? fmt(adopted.startDate)
					: `${fmt(adopted.startDate)} – ${fmt(adopted.endDate)}`;
			logAudit({
				event,
				action: 'trip.date.adopted',
				actorUserId: locals.user.id,
				actorUsername: locals.user.username,
				detail: { tripId, ...adopted }
			});
			recordEvent({
				kind: 'trip.new',
				actorUserId: null,
				actorName: null,
				title: `Neuer Termin: ${trip.title}`,
				body: `${range} — Mehrheit hat entschieden.`,
				url: `/trips?trip=${tripId}`
			});
			void sendToUsersWithPref('trips', {
				title: `Trip-Termin geändert: ${trip.title}`,
				body: `Neuer Termin: ${range}`,
				url: `/trips?trip=${tripId}`,
				tag: `trip-date-${tripId}`
			}).catch(() => undefined);
			return json({ success: true, adopted });
		}
		return json({ success: true });
	}

	if (action === 'remove_date_vote') {
		const existingVote = db
			.select({
				id: tripDateVotes.id,
				dateOptionId: tripDateVotes.dateOptionId
			})
			.from(tripDateVotes)
			.where(and(eq(tripDateVotes.tripId, tripId), eq(tripDateVotes.userId, locals.user.id)))
			.get();

		db.delete(tripDateVotes)
			.where(and(eq(tripDateVotes.tripId, tripId), eq(tripDateVotes.userId, locals.user.id)))
			.run();

		if (existingVote) {
			const remaining = db
				.select({ id: tripDateVotes.id })
				.from(tripDateVotes)
				.where(
					and(
						eq(tripDateVotes.tripId, tripId),
						eq(tripDateVotes.dateOptionId, existingVote.dateOptionId)
					)
				)
				.limit(1)
				.get();
			if (!remaining) {
				db.delete(tripDateOptions).where(eq(tripDateOptions.id, existingVote.dateOptionId)).run();
			}
		}

		logAudit({
			event,
			action: 'trip.date_option.vote.remove',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId }
		});
		return json({ success: true });
	}

	if (action === 'remove_plan_vote') {
		const existingVote = db
			.select({
				id: tripDestinationVotes.id,
				destinationId: tripDestinationVotes.destinationId
			})
			.from(tripDestinationVotes)
			.where(and(eq(tripDestinationVotes.tripId, tripId), eq(tripDestinationVotes.userId, locals.user.id)))
			.get();

		db.delete(tripDestinationVotes)
			.where(and(eq(tripDestinationVotes.tripId, tripId), eq(tripDestinationVotes.userId, locals.user.id)))
			.run();

		// Wenn danach niemand mehr diesen Ablauf gevotet hat, Vorschlag entfernen.
		if (existingVote) {
			const remaining = db
				.select({ id: tripDestinationVotes.id })
				.from(tripDestinationVotes)
				.where(
					and(
						eq(tripDestinationVotes.tripId, tripId),
						eq(tripDestinationVotes.destinationId, existingVote.destinationId)
					)
				)
				.limit(1)
				.get();
			if (!remaining) {
				db.delete(tripDestinations).where(eq(tripDestinations.id, existingVote.destinationId)).run();
			}
		}

		logAudit({
			event,
			action: 'trip.destination.vote.remove',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId }
		});
		return json({ success: true });
	}

	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};
