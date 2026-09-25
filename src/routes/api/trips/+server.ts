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
	tripDateAnswers,
	tripStopovers
} from '$lib/server/db/schema';
import { logAudit } from '$lib/server/audit';
import { recordEvent } from '$lib/server/activity';
import { sendToUsersWithPref } from '$lib/server/push';
import {
	DATE_ANSWERS,
	answerDateOption,
	deadlineFromYmd,
	defaultDeadline,
	ensureOwnDateOption,
	evaluateTripLock,
	formatRange,
	isTripLocked,
	mirrorParticipationIntoPoll,
	unlockTrip,
	type DateAnswer
} from '$lib/server/tripDatePoll';

function parseCoord(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null;
	const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
	return Number.isFinite(n) ? n : null;
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
		// Frist der Terminumfrage: Formulardatum, sonst eine Woche ab jetzt.
		const deadlineRaw = String(body?.voteDeadline || '').trim();
		const voteDeadline = deadlineRaw ? deadlineFromYmd(deadlineRaw) : defaultDeadline();
		if (!voteDeadline) {
			return json({ error: 'Frist im Format JJJJ-MM-TT angeben' }, { status: 400 });
		}
		if (voteDeadline.slice(0, 10) > startDate) {
			return json({ error: 'Die Frist muss vor dem Trip liegen' }, { status: 400 });
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
				voteDeadline,
				createdBy: locals.user.id
			})
			.returning({ id: tripPlans.id })
			.get();
		// Das geplante Datum ist die erste Option der Umfrage; wer den Trip
		// anlegt, sagt dazu Ja.
		const ownOptionId = ensureOwnDateOption(created.id);
		db.insert(tripDateAnswers)
			.values({ tripId: created.id, dateOptionId: ownOptionId, userId: locals.user.id, answer: 'ja' })
			.run();

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
				body: `${formatRange(startDate, endDate)}. Abstimmen bis ${formatRange(voteDeadline.slice(0, 10), voteDeadline.slice(0, 10))} — sonst ohne dich.`,
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
		const deadlineRaw = String(body?.voteDeadline || '').trim();
		const voteDeadline = deadlineRaw ? deadlineFromYmd(deadlineRaw) : undefined;
		if (deadlineRaw && !voteDeadline) {
			return json({ error: 'Frist im Format JJJJ-MM-TT angeben' }, { status: 400 });
		}
		db.update(tripPlans)
			.set({
				title,
				startDate,
				endDate,
				notes: notes || null,
				...(voteDeadline ? { voteDeadline, deadlineHandledAt: null } : {})
			})
			.where(eq(tripPlans.id, tripId))
			.run();
		// Neues Datum ohne Fixierung: als Option nachtragen, damit die Umfrage
		// weiter alle Kandidaten zeigt.
		if (!isTripLocked(trip)) ensureOwnDateOption(tripId);
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
		// Ein Ziel-Vorschlag lässt sich direkt übernehmen — dann braucht es
		// keine erneute Ortssuche.
		const optionId = Number(body?.optionId);
		if (Number.isFinite(optionId) && optionId > 0) {
			const option = db
				.select()
				.from(tripDestinations)
				.where(and(eq(tripDestinations.id, optionId), eq(tripDestinations.tripId, tripId)))
				.get();
			if (!option) return json({ error: 'Vorschlag nicht gefunden' }, { status: 404 });
			db.update(tripPlans)
				.set({
					destinationLatitude: option.latitude ?? null,
					destinationLongitude: option.longitude ?? null,
					destinationLabel: [option.name, option.city].filter(Boolean).join(', ')
				})
				.where(eq(tripPlans.id, tripId))
				.run();
			logAudit({
				event,
				action: 'trip.destination.set',
				actorUserId: locals.user.id,
				actorUsername: locals.user.username,
				detail: { tripId, optionId, label: option.name }
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
		// „Dabei" ist ein Ja zum geplanten Datum — und vielleicht das dritte.
		mirrorParticipationIntoPoll(tripId, locals.user.id, true);
		const locked = evaluateTripLock(tripId, { force: false });
		return json({ success: true, locked });
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
		mirrorParticipationIntoPoll(tripId, locals.user.id, false);
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
		// Beide Arten liegen in derselben Tabelle: Ablauf-Vorschlag ('plan')
		// und Zielort-Vorschlag ('ziel'). Jede Person hat je Art eine Stimme.
		const kind = action === 'propose_destination' ? 'ziel' : 'plan';
		const text = String(body?.text ?? body?.name ?? '').trim();
		if (!text) {
			return json(
				{ error: kind === 'ziel' ? 'Name des Ziels fehlt' : 'Text für den Ablauf-Vorschlag ist erforderlich' },
				{ status: 400 }
			);
		}
		const lat = kind === 'ziel' ? parseCoord(body?.latitude) : null;
		const lon = kind === 'ziel' ? parseCoord(body?.longitude) : null;
		const inserted = db
			.insert(tripDestinations)
			.values({
				tripId,
				name: text,
				city: String(body?.city ?? '').trim(),
				note: String(body?.note ?? '').trim() || null,
				kind,
				latitude: lat,
				longitude: lon,
				proposedBy: locals.user.id
			})
			.returning({ id: tripDestinations.id })
			.get();
		// Wie beim Spot-Voting: eigener Vorschlag zählt direkt als eigener Vote.
		db.insert(tripDestinationVotes)
			.values({ tripId, destinationId: inserted.id, userId: locals.user.id, kind })
			.onConflictDoUpdate({
				target: [tripDestinationVotes.tripId, tripDestinationVotes.userId, tripDestinationVotes.kind],
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

		// Die Art kommt aus dem Vorschlag selbst — so kann eine Stimme fürs
		// Ziel die Stimme für den Ablauf nicht überschreiben.
		const kind = destination.kind ?? 'plan';
		const existing = db
			.select({ id: tripDestinationVotes.id })
			.from(tripDestinationVotes)
			.where(
				and(
					eq(tripDestinationVotes.tripId, tripId),
					eq(tripDestinationVotes.userId, locals.user.id),
					eq(tripDestinationVotes.kind, kind)
				)
			)
			.get();
		if (existing) {
			db.update(tripDestinationVotes)
				.set({ destinationId })
				.where(eq(tripDestinationVotes.id, existing.id))
				.run();
		} else {
			db.insert(tripDestinationVotes)
				.values({ tripId, destinationId, userId: locals.user.id, kind })
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
		if (isTripLocked(trip)) {
			return json({ error: 'Der Termin ist fix — neue Daten nur nach „Termin neu aufrollen".' }, { status: 400 });
		}
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
		db.insert(tripDateAnswers)
			.values({ tripId, dateOptionId: inserted.id, userId: locals.user.id, answer: 'ja' })
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

	/**
	 * Terminumfrage: ja / notfalls / nein je Datum. `vote_date_option` (Ja)
	 * und `remove_date_vote` bleiben für ältere App-Versionen bestehen.
	 */
	if (action === 'answer_date_option' || action === 'vote_date_option' || action === 'remove_date_vote') {
		const dateOptionId = Number(body?.dateOptionId);
		if (!Number.isFinite(dateOptionId)) {
			return json({ error: 'Datums-Option-ID erforderlich' }, { status: 400 });
		}
		if (action === 'remove_date_vote') {
			if (isTripLocked(trip)) {
				return json({ error: 'Der Termin ist fix — die Umfrage ist geschlossen.' }, { status: 400 });
			}
			db.delete(tripDateAnswers)
				.where(
					and(
						eq(tripDateAnswers.tripId, tripId),
						eq(tripDateAnswers.dateOptionId, dateOptionId),
						eq(tripDateAnswers.userId, locals.user.id)
					)
				)
				.run();
			logAudit({
				event,
				action: 'trip.date_option.vote.remove',
				actorUserId: locals.user.id,
				actorUsername: locals.user.username,
				detail: { tripId, dateOptionId }
			});
			return json({ success: true });
		}
		const answerRaw = action === 'vote_date_option' ? 'ja' : String(body?.answer || '').trim();
		if (!DATE_ANSWERS.includes(answerRaw as DateAnswer)) {
			return json({ error: 'Antwort muss ja, notfalls oder nein sein' }, { status: 400 });
		}
		const answer = answerRaw as DateAnswer;
		// Wer für den Trip abgesagt hat, stimmt nicht mehr über dessen Termin ab.
		const ownPart = db
			.select({ transportMode: tripParticipants.transportMode })
			.from(tripParticipants)
			.where(and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.userId, locals.user.id)))
			.get();
		if (ownPart?.transportMode === 'abgemeldet' && answer !== 'nein') {
			return json(
				{ error: 'Du hast für diesen Trip abgesagt — erst wieder auf „offen" stellen.' },
				{ status: 403 }
			);
		}
		let locked;
		try {
			locked = answerDateOption({ tripId, dateOptionId, userId: locals.user.id, answer }).locked;
		} catch (e) {
			return json({ error: e instanceof Error ? e.message : 'Antwort fehlgeschlagen' }, { status: 400 });
		}
		logAudit({
			event,
			action: 'trip.date_option.answer',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, dateOptionId, answer }
		});
		if (locked) {
			logAudit({
				event,
				action: 'trip.date.locked',
				actorUserId: locals.user.id,
				actorUsername: locals.user.username,
				detail: { tripId, startDate: locked.startDate, endDate: locked.endDate, yes: locked.yes }
			});
		}
		return json({ success: true, locked });
	}

	/** Termin neu aufrollen — Ersteller oder Admin, mit neuer Frist. */
	if (action === 'unlock_trip') {
		const canEdit = trip.createdBy === locals.user.id || locals.user.role === 'admin';
		if (!canEdit) {
			return json({ error: 'Nur Trip-Ersteller oder Admin kann den Termin neu aufrollen' }, { status: 403 });
		}
		const deadlineRaw = String(body?.voteDeadline || '').trim();
		const voteDeadline = deadlineRaw ? deadlineFromYmd(deadlineRaw) : defaultDeadline();
		if (!voteDeadline) {
			return json({ error: 'Frist im Format JJJJ-MM-TT angeben' }, { status: 400 });
		}
		unlockTrip(tripId, voteDeadline);
		const fristText = formatRange(voteDeadline.slice(0, 10), voteDeadline.slice(0, 10));
		logAudit({
			event,
			action: 'trip.date.unlock',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { tripId, voteDeadline }
		});
		recordEvent({
			kind: 'trip.new',
			actorUserId: locals.user.id,
			actorName: locals.user.username,
			title: `Termin neu aufgerollt: ${trip.title}`,
			body: `Abstimmen bis ${fristText}.`,
			url: `/trips?trip=${tripId}`
		});
		void sendToUsersWithPref('trips', {
			title: `Termin neu aufgerollt: ${trip.title}`,
			body: `${locals.user.username} hat die Terminumfrage wieder geöffnet — abstimmen bis ${fristText}.`,
			url: `/trips?trip=${tripId}`,
			tag: `trip-date-${tripId}`
		}).catch(() => undefined);
		return json({ success: true });
	}

	if (action === 'remove_plan_vote' || action === 'remove_destination_vote') {
		const kind = action === 'remove_destination_vote' ? 'ziel' : 'plan';
		const where = and(
			eq(tripDestinationVotes.tripId, tripId),
			eq(tripDestinationVotes.userId, locals.user.id),
			eq(tripDestinationVotes.kind, kind)
		);
		const existingVote = db
			.select({
				id: tripDestinationVotes.id,
				destinationId: tripDestinationVotes.destinationId
			})
			.from(tripDestinationVotes)
			.where(where)
			.get();

		db.delete(tripDestinationVotes).where(where).run();

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
