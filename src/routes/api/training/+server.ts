import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	absences,
	trainingSessions,
	trainingSpotVotes,
	spots,
	trainingSessionRsvp,
	trainingSessionWeekdayOverride,
	sessionGuests
} from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { logAudit } from '$lib/server/audit';
import { sendToUsersWithPref } from '$lib/server/push';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';
import { todayYmdInAppTZ, germanWeekdayInAppTZ } from '$lib/server/calendarToday';
import { recordEvent } from '$lib/server/activity';
import { desc } from 'drizzle-orm';

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const { action, sessionId, reason, spotId } = body;

	/**
	 * Zusatztraining eintragen — jedes Mitglied darf das, wie beim Anlegen
	 * von Spots oder Challenges. Der Termin landet in derselben Tabelle wie
	 * die festen Dienstag/Donnerstag-Trainings; damit funktionieren
	 * An-/Abmeldung, Spot-Voting, Gäste und Kalender ohne Sonderweg.
	 */
	if (action === 'create_extra') {
		const date = String(body?.date ?? '').trim();
		const timeStart = String(body?.timeStart ?? '18:15').trim();
		const timeEnd = String(body?.timeEnd ?? '20:15').trim();
		const note = String(body?.note ?? '').trim().slice(0, 200);

		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return json({ error: 'Datum im Format JJJJ-MM-TT angeben' }, { status: 400 });
		}
		const today = todayYmdInAppTZ();
		if (date < today) {
			return json({ error: 'Das Datum liegt in der Vergangenheit' }, { status: 400 });
		}
		const maxDate = new Date(Date.parse(`${today}T12:00:00Z`) + 120 * 86_400_000)
			.toISOString()
			.slice(0, 10);
		if (date > maxDate) {
			return json({ error: 'Höchstens 120 Tage im Voraus' }, { status: 400 });
		}
		const timeOk = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
		if (!timeOk(timeStart) || !timeOk(timeEnd)) {
			return json({ error: 'Zeiten im Format HH:MM angeben' }, { status: 400 });
		}
		if (timeEnd <= timeStart) {
			return json({ error: 'Ende muss nach dem Beginn liegen' }, { status: 400 });
		}

		const clash = db
			.select({ id: trainingSessions.id })
			.from(trainingSessions)
			.where(and(eq(trainingSessions.date, date), eq(trainingSessions.timeStart, timeStart)))
			.get();
		if (clash) {
			return json({ error: 'Zu dieser Zeit gibt es an dem Tag schon ein Training' }, { status: 400 });
		}

		const ins = db
			.insert(trainingSessions)
			.values({
				date,
				dayOfWeek: germanWeekdayInAppTZ(date),
				timeStart,
				timeEnd,
				isExtra: true,
				createdBy: locals.user.id,
				note: note || null
			})
			.run();
		const newId = Number(ins.lastInsertRowid);

		// Wer den Termin einträgt, ist offensichtlich dabei — sonst stünde der
		// Ersteller selbst unter „noch keine Antwort".
		if (isTrainingAttendanceSchemaReady()) {
			db.insert(trainingSessionRsvp).values({ sessionId: newId, userId: locals.user.id }).run();
		}

		const pretty = new Date(`${date}T12:00:00`).toLocaleDateString('de-CH', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		});

		logAudit({
			event,
			action: 'training.extra.create',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId: newId, date, timeStart, timeEnd, note }
		});
		recordEvent({
			kind: 'training.extra',
			actorUserId: locals.user.id,
			actorName: locals.user.username,
			title: 'Zusatztraining',
			body: `${pretty}, ${timeStart}–${timeEnd}${note ? ` · ${note}` : ''}`,
			url: '/training'
		});
		void sendToUsersWithPref(
			'trainingReminder',
			{
				title: `Zusatztraining — ${pretty}`,
				body: `${timeStart}–${timeEnd} · von ${locals.user.username}${note ? ` · ${note}` : ''}`,
				url: '/training',
				tag: `training-extra-${newId}`
			},
			undefined,
			{ excludeUserIds: [locals.user.id] }
		).catch(() => undefined);

		return json({ success: true, sessionId: newId });
	}

	/** Zusatztraining wieder entfernen — nur Ersteller oder Admin. */
	if (action === 'delete_extra') {
		const target = db
			.select()
			.from(trainingSessions)
			.where(eq(trainingSessions.id, Number(sessionId)))
			.get();
		if (!target) return json({ error: 'Training nicht gefunden' }, { status: 404 });
		if (!target.isExtra) {
			return json({ error: 'Nur Zusatztrainings lassen sich entfernen' }, { status: 400 });
		}
		if (target.createdBy !== locals.user.id && locals.user.role !== 'admin') {
			return json({ error: 'Keine Berechtigung' }, { status: 403 });
		}
		// Anmeldungen und Stimmen hängen daran — erst die, dann der Termin.
		db.delete(trainingSpotVotes).where(eq(trainingSpotVotes.sessionId, target.id)).run();
		db.delete(absences).where(eq(absences.sessionId, target.id)).run();
		db.delete(sessionGuests).where(eq(sessionGuests.sessionId, target.id)).run();
		if (isTrainingAttendanceSchemaReady()) {
			db.delete(trainingSessionRsvp).where(eq(trainingSessionRsvp.sessionId, target.id)).run();
			db.delete(trainingSessionWeekdayOverride)
				.where(eq(trainingSessionWeekdayOverride.sessionId, target.id))
				.run();
		}
		db.delete(trainingSessions).where(eq(trainingSessions.id, target.id)).run();

		logAudit({
			event,
			action: 'training.extra.delete',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId: target.id, date: target.date }
		});
		return json({ success: true });
	}

	if (!sessionId) {
		return json({ error: 'Session-ID erforderlich' }, { status: 400 });
	}

	const session = db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();
	if (!session) {
		return json({ error: 'Training nicht gefunden' }, { status: 404 });
	}
	if (session.cancelled) {
		return json({ error: 'Dieses Training ist abgesagt' }, { status: 400 });
	}

	if (action === 'absence') {
		// Beim Zusatztraining soll die Absage ein Tipp sein: Der Termin ist
		// freiwillig, ein Pflicht-Grund würde nur dazu führen, dass gar nicht
		// geantwortet wird. Beim festen Termin bleibt der Grund Pflicht.
		if (session.isExtra) {
			if (reason && reason.trim().length > 0 && reason.trim().length < 10) {
				return json({ error: 'Grund entweder weglassen oder mind. 10 Zeichen' }, { status: 400 });
			}
		} else if (!reason || reason.trim().length < 10) {
			return json({ error: 'Grund ist erforderlich (mind. 10 Zeichen)' }, { status: 400 });
		}

		const existing = db.select().from(absences)
			.where(and(eq(absences.userId, locals.user.id), eq(absences.sessionId, sessionId)))
			.get();

		if (existing) {
			return json({ error: 'Bereits als zieht nicht eingetragen' }, { status: 400 });
		}

		db.insert(absences).values({
			userId: locals.user.id,
			sessionId,
			reason: reason?.trim() ? reason.trim() : 'Kann nicht'
		}).run();

		if (isTrainingAttendanceSchemaReady()) {
			db.delete(trainingSessionRsvp)
				.where(
					and(
						eq(trainingSessionRsvp.userId, locals.user.id),
						eq(trainingSessionRsvp.sessionId, sessionId)
					)
				)
				.run();

			db.delete(trainingSessionWeekdayOverride)
				.where(
					and(
						eq(trainingSessionWeekdayOverride.userId, locals.user.id),
						eq(trainingSessionWeekdayOverride.sessionId, sessionId)
					)
				)
				.run();
		}

		logAudit({
			event,
			action: 'training.absence',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId, date: session.date, dayOfWeek: session.dayOfWeek }
		});
		return json({ success: true });
	}

	if (action === 'cancel_absence') {
		db.delete(absences)
			.where(and(eq(absences.userId, locals.user.id), eq(absences.sessionId, sessionId)))
			.run();

		logAudit({
			event,
			action: 'training.absence.cancel',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId, date: session.date }
		});
		return json({ success: true });
	}

	if (action === 'weekday_override_yes') {
		if (!isTrainingAttendanceSchemaReady()) {
			return json(
				{ error: 'Datenbank-Migration fehlt (0002/0003). Admin: drizzle-SQL auf Server-DB anwenden.' },
				{ status: 503 }
			);
		}
		if (locals.user.trainingAttendance !== 'implicit') {
			return json({ error: 'Nur mit Standard-Trainingsmodus (nicht Opt-in)' }, { status: 400 });
		}
		if (!locals.user.autoAbsentWeekdays.includes(session.dayOfWeek)) {
			return json({ error: 'Für diesen Wochentag gibt es keine Admin-Standard-Abmeldung' }, { status: 400 });
		}
		const existingOv = db
			.select()
			.from(trainingSessionWeekdayOverride)
			.where(
				and(
					eq(trainingSessionWeekdayOverride.userId, locals.user.id),
					eq(trainingSessionWeekdayOverride.sessionId, sessionId)
				)
			)
			.get();
		if (!existingOv) {
			db.insert(trainingSessionWeekdayOverride)
				.values({ userId: locals.user.id, sessionId })
				.run();
		}
		logAudit({
			event,
			action: 'training.weekday_override_yes',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId, date: session.date, dayOfWeek: session.dayOfWeek }
		});
		return json({ success: true });
	}

	if (action === 'weekday_override_no') {
		if (!isTrainingAttendanceSchemaReady()) {
			return json(
				{ error: 'Datenbank-Migration fehlt (0002/0003). Admin: drizzle-SQL auf Server-DB anwenden.' },
				{ status: 503 }
			);
		}
		db.delete(trainingSessionWeekdayOverride)
			.where(
				and(
					eq(trainingSessionWeekdayOverride.userId, locals.user.id),
					eq(trainingSessionWeekdayOverride.sessionId, sessionId)
				)
			)
			.run();
		logAudit({
			event,
			action: 'training.weekday_override_no',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId, date: session.date }
		});
		return json({ success: true });
	}

	if (action === 'rsvp_yes') {
		if (!isTrainingAttendanceSchemaReady()) {
			return json(
				{ error: 'Datenbank-Migration fehlt (0002). Admin: drizzle-SQL auf Server-DB anwenden.' },
				{ status: 503 }
			);
		}
		// Bei Zusatztrainings sagt JEDE Person ausdrücklich zu — sonst gälte
		// jede:r als dabei, der nur nichts gemacht hat. Für die festen
		// Termine bleibt es beim bisherigen Modus.
		if (!session.isExtra && locals.user.trainingAttendance !== 'opt_in') {
			return json({ error: 'Zusage nur für Opt-in-Accounts' }, { status: 400 });
		}
		const absent = db.select().from(absences)
			.where(and(eq(absences.userId, locals.user.id), eq(absences.sessionId, sessionId)))
			.get();
		if (absent) {
			// Beim Zusatztraining ist „Dabei!" die klarere Aussage — die frühere
			// Abmeldung fällt damit weg, statt die Zusage zu blockieren.
			if (!session.isExtra) {
				return json({ error: 'Zuerst Abmeldung zurücknehmen' }, { status: 400 });
			}
			db.delete(absences)
				.where(and(eq(absences.userId, locals.user.id), eq(absences.sessionId, sessionId)))
				.run();
		}
		const existingRsvp = db.select().from(trainingSessionRsvp)
			.where(and(
				eq(trainingSessionRsvp.userId, locals.user.id),
				eq(trainingSessionRsvp.sessionId, sessionId)
			))
			.get();
		if (!existingRsvp) {
			db.insert(trainingSessionRsvp).values({
				userId: locals.user.id,
				sessionId
			}).run();
		}
		logAudit({
			event,
			action: 'training.rsvp_yes',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId, date: session.date }
		});
		return json({ success: true });
	}

	if (action === 'rsvp_no') {
		if (!isTrainingAttendanceSchemaReady()) {
			return json(
				{ error: 'Datenbank-Migration fehlt (0002). Admin: drizzle-SQL auf Server-DB anwenden.' },
				{ status: 503 }
			);
		}
		if (!session.isExtra && locals.user.trainingAttendance !== 'opt_in') {
			return json({ error: 'Nur für Opt-in-Accounts' }, { status: 400 });
		}
		db.delete(trainingSessionRsvp)
			.where(and(
				eq(trainingSessionRsvp.userId, locals.user.id),
				eq(trainingSessionRsvp.sessionId, sessionId)
			))
			.run();
		logAudit({
			event,
			action: 'training.rsvp_no',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId, date: session.date }
		});
		return json({ success: true });
	}

	if (action === 'vote_spot') {
		if (!spotId) {
			return json({ error: 'Spot-ID erforderlich' }, { status: 400 });
		}

		const spot = db.select().from(spots).where(eq(spots.id, spotId)).get();
		if (!spot) {
			return json({ error: 'Spot nicht gefunden' }, { status: 404 });
		}

		const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
		const deadline = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
		if (new Date() > deadline) {
			return json({ error: 'Voting ist geschlossen (2h vor Training)' }, { status: 400 });
		}

		const existing = db.select().from(trainingSpotVotes)
			.where(and(
				eq(trainingSpotVotes.userId, locals.user.id),
				eq(trainingSpotVotes.sessionId, sessionId)
			))
			.get();

		if (existing) {
			db.update(trainingSpotVotes)
				.set({ spotId })
				.where(eq(trainingSpotVotes.id, existing.id))
				.run();
		} else {
			db.insert(trainingSpotVotes).values({
				userId: locals.user.id,
				sessionId,
				spotId
			}).run();
		}

		logAudit({
			event,
			action: existing ? 'training.spot_vote.change' : 'training.spot_vote',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId, spotId, spotName: spot.name, date: session.date }
		});

		// Erste Stimme der Session = Voting eröffnet → alle informieren.
		if (!existing) {
			const voteCount = db
				.select()
				.from(trainingSpotVotes)
				.where(eq(trainingSpotVotes.sessionId, sessionId))
				.all().length;
			if (voteCount === 1) {
				const dateLabel = new Date(`${session.date}T12:00:00`).toLocaleDateString('de-CH', {
					weekday: 'long',
					day: 'numeric',
					month: 'long'
				});
				void sendToUsersWithPref(
					'spotVoting',
					{
						title: 'Spot-Voting eröffnet 🗳️',
						body: `${locals.user.username} schlägt ${spot.name} fürs Training am ${dateLabel} vor — stimm mit ab!`,
						url: '/training',
						tag: `spot-voting-${sessionId}`
					},
					undefined,
					{ excludeUserIds: [locals.user.id] }
				).catch(() => undefined);
			}
		}
		return json({ success: true });
	}

	if (action === 'remove_vote') {
		db.delete(trainingSpotVotes)
			.where(and(
				eq(trainingSpotVotes.userId, locals.user.id),
				eq(trainingSpotVotes.sessionId, sessionId)
			))
			.run();

		logAudit({
			event,
			action: 'training.spot_vote.remove',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { sessionId, date: session.date }
		});
		return json({ success: true });
	}

	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};

export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const { sessionId } = await request.json();

	const session = db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();

	db.delete(absences)
		.where(and(eq(absences.userId, locals.user.id), eq(absences.sessionId, sessionId)))
		.run();

	logAudit({
		event,
		action: 'training.absence.cancel',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { sessionId, date: session?.date, via: 'delete_endpoint' }
	});

	return json({ success: true });
};
