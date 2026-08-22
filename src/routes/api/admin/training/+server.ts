import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	trainingSessions,
	trainingSpotVotes,
	absences,
	spots,
	users,
	sessionGuests,
	sessionHiddenUsers,
	trainingSessionRsvp,
	trainingSessionWeekdayOverride
} from '$lib/server/db/schema';
import { eq, gte, asc, and } from 'drizzle-orm';
import { logAudit } from '$lib/server/audit';
import {
	filterAttendingUsers,
	normalizeUserForAttendance,
	computeEffectiveAbsentUserIds,
	buildAbsenceListForSession
} from '$lib/server/trainingAttendance';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';
import { andWithUsersNotDeleted, usersNotDeletedCondition } from '$lib/server/usersWhere';
import { jsonFromSqliteOrSchemaError } from '$lib/server/sqliteAdminErrors';
import { sendToUsers } from '$lib/server/push';
import { recordEvent } from '$lib/server/activity';
import { attendingUserIds as getAttendingUserIdsForSession } from '$lib/server/pushScheduler';

function formatDateCh(dateStr: string): string {
	return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-CH', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
}

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

export const GET: RequestHandler = async ({ locals }) => {
	assertAdmin(locals);

	const pastCutoff = new Date();
	pastCutoff.setDate(pastCutoff.getDate() - 21);
	const cutoffStr = pastCutoff.toISOString().split('T')[0];
	const sessions = db
		.select()
		.from(trainingSessions)
		.where(gte(trainingSessions.date, cutoffStr))
		.orderBy(asc(trainingSessions.date))
		.limit(48)
		.all();

	const schemaOk = isTrainingAttendanceSchemaReady();
	const allUsers = schemaOk
		? db
				.select({
					id: users.id,
					username: users.username,
					active: users.active,
					trainingAttendance: users.trainingAttendance,
					autoAbsentWeekdays: users.autoAbsentWeekdays
				})
				.from(users)
				.where(usersNotDeletedCondition())
				.all()
				.map(normalizeUserForAttendance)
		: db
				.select({ id: users.id, username: users.username, active: users.active })
				.from(users)
				.where(usersNotDeletedCondition())
				.all()
				.map((u) => ({
					id: u.id,
					username: u.username,
					active: u.active ?? true,
					trainingAttendance: 'implicit' as const,
					autoAbsentWeekdays: [] as string[]
				}));

	const result = sessions.map((session) => {
		const sessionAbsences = db.select({
			id: absences.id,
			userId: absences.userId,
			username: users.username,
			reason: absences.reason
		})
			.from(absences)
			.innerJoin(users, eq(absences.userId, users.id))
			.where(andWithUsersNotDeleted(eq(absences.sessionId, session.id)))
			.all();

		const hiddenUsers = db.select({
			id: sessionHiddenUsers.id,
			userId: sessionHiddenUsers.userId,
			username: users.username
		})
			.from(sessionHiddenUsers)
			.innerJoin(users, eq(sessionHiddenUsers.userId, users.id))
			.where(andWithUsersNotDeleted(eq(sessionHiddenUsers.sessionId, session.id)))
			.all();

		const dbAbsentIds = new Set(sessionAbsences.map((a) => a.userId));
		const hiddenUserIds = new Set(hiddenUsers.map((h) => h.userId));
		let attending;
		let absencesForList;

		if (!schemaOk) {
			const rsvpEmpty = new Set<number>();
			attending = filterAttendingUsers(allUsers, dbAbsentIds, hiddenUserIds, rsvpEmpty);
			absencesForList = sessionAbsences.map((a) => ({
				id: a.id,
				userId: a.userId,
				username: a.username,
				reason: a.reason,
				virtual: false as const
			}));
		} else {
			const overrideUserIds = new Set(
				db
					.select({ userId: trainingSessionWeekdayOverride.userId })
					.from(trainingSessionWeekdayOverride)
					.where(eq(trainingSessionWeekdayOverride.sessionId, session.id))
					.all()
					.map((r) => r.userId)
			);
			const effectiveAbsentIds = computeEffectiveAbsentUserIds(
				allUsers,
				session.dayOfWeek,
				dbAbsentIds,
				overrideUserIds
			);
			const rsvpUserIds = new Set(
				db
					.select({ userId: trainingSessionRsvp.userId })
					.from(trainingSessionRsvp)
					.where(eq(trainingSessionRsvp.sessionId, session.id))
					.all()
					.map((r) => r.userId)
			);
			attending = filterAttendingUsers(allUsers, effectiveAbsentIds, hiddenUserIds, rsvpUserIds);
			absencesForList = buildAbsenceListForSession(
				allUsers,
				sessionAbsences,
				effectiveAbsentIds,
				dbAbsentIds,
				session.dayOfWeek
			);
		}

		const spotVotes = db.select({
			id: trainingSpotVotes.id,
			spotName: spots.name,
			spotCity: spots.city,
			username: users.username,
			userId: trainingSpotVotes.userId
		})
			.from(trainingSpotVotes)
			.innerJoin(spots, eq(trainingSpotVotes.spotId, spots.id))
			.innerJoin(users, eq(trainingSpotVotes.userId, users.id))
			.where(andWithUsersNotDeleted(eq(trainingSpotVotes.sessionId, session.id)))
			.all();

		const guests = db.select()
			.from(sessionGuests)
			.where(eq(sessionGuests.sessionId, session.id))
			.all();

		return {
			...session,
			absences: absencesForList,
			attending,
			spotVotes,
			guests,
			hiddenUsers
		};
	});

	return json({ sessions: result });
};

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	assertAdmin(locals);

	try {
		const body = await request.json();
		const { type, sessionId, name } = body;
		const userId = typeof body.userId === 'number' ? body.userId : Number(body.userId);
		const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';

		if (type === 'add_guest' && sessionId && name?.trim()) {
			db.insert(sessionGuests).values({
				sessionId,
				name: name.trim()
			}).run();
			logAudit({
				event,
				action: 'admin.training.guest_add',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { sessionId, guestName: name.trim() }
			});
			return json({ success: true });
		}

		/** Nachträgliche Abmeldung (z. B. nicht erschienen) — zählt in der Statistik wie eine normale Abmeldung */
		if (type === 'add_absence' && sessionId && Number.isFinite(userId) && userId > 0) {
			const session = db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();
			if (!session) {
				return json({ error: 'Training nicht gefunden' }, { status: 404 });
			}
			const target = db
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.id, userId), usersNotDeletedCondition()))
				.get();
			if (!target) {
				return json({ error: 'User nicht gefunden' }, { status: 404 });
			}
			const existing = db
				.select({ id: absences.id })
				.from(absences)
				.where(and(eq(absences.sessionId, sessionId), eq(absences.userId, userId)))
				.get();
			if (existing) {
				return json({ error: 'Für diesen User besteht schon ein Abwesenheits-Eintrag' }, { status: 400 });
			}
			const reason =
				reasonRaw ||
				'Nicht erschienen (Admin)';
			db.insert(absences).values({ sessionId, userId, reason }).run();
			if (isTrainingAttendanceSchemaReady()) {
				db.delete(trainingSessionRsvp)
					.where(and(eq(trainingSessionRsvp.sessionId, sessionId), eq(trainingSessionRsvp.userId, userId)))
					.run();
			}
			logAudit({
				event,
				action: 'admin.training.add_absence',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				targetUserId: userId,
				detail: { sessionId, reason }
			});
			return json({ success: true });
		}

		/**
		 * Nachträglich als anwesend eintragen — vor allem für Zusatztrainings,
		 * wo nur die ausdrückliche Zusage zählt: Wer da war, es aber nie
		 * angeklickt hat, kann so von einem Admin nachgetragen werden.
		 */
		if ((type === 'add_rsvp' || type === 'remove_rsvp') && sessionId && Number.isFinite(userId) && userId > 0) {
			if (!isTrainingAttendanceSchemaReady()) {
				return json({ error: 'Datenbank-Migration fehlt (0002)' }, { status: 503 });
			}
			const session = db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();
			if (!session) {
				return json({ error: 'Training nicht gefunden' }, { status: 404 });
			}
			const target = db
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.id, userId), usersNotDeletedCondition()))
				.get();
			if (!target) {
				return json({ error: 'User nicht gefunden' }, { status: 404 });
			}
			if (type === 'remove_rsvp') {
				db.delete(trainingSessionRsvp)
					.where(and(eq(trainingSessionRsvp.sessionId, sessionId), eq(trainingSessionRsvp.userId, userId)))
					.run();
			} else {
				// Eine Zusage schliesst eine Abmeldung aus — sonst stünde die
				// Person gleichzeitig in beiden Listen.
				db.delete(absences)
					.where(and(eq(absences.sessionId, sessionId), eq(absences.userId, userId)))
					.run();
				const existing = db
					.select({ id: trainingSessionRsvp.id })
					.from(trainingSessionRsvp)
					.where(and(eq(trainingSessionRsvp.sessionId, sessionId), eq(trainingSessionRsvp.userId, userId)))
					.get();
				if (!existing) {
					db.insert(trainingSessionRsvp).values({ sessionId, userId }).run();
				}
			}
			logAudit({
				event,
				action: type === 'add_rsvp' ? 'admin.training.add_rsvp' : 'admin.training.remove_rsvp',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				targetUserId: userId,
				detail: { sessionId, date: session.date }
			});
			return json({ success: true });
		}

		/** Training absagen/aufheben — bei Absage geht ein Push an alle Mitziehenden. */
		if ((type === 'cancel_session' || type === 'uncancel_session') && sessionId) {
			const session = db
				.select()
				.from(trainingSessions)
				.where(eq(trainingSessions.id, sessionId))
				.get();
			if (!session) {
				return json({ error: 'Training nicht gefunden' }, { status: 404 });
			}
			const cancel = type === 'cancel_session';
			if (Boolean(session.cancelled) === cancel) {
				return json({ error: cancel ? 'Bereits abgesagt' : 'Ist nicht abgesagt' }, { status: 400 });
			}
			db.update(trainingSessions)
				.set({ cancelled: cancel })
				.where(eq(trainingSessions.id, sessionId))
				.run();
			logAudit({
				event,
				action: cancel ? 'admin.training.cancel' : 'admin.training.uncancel',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { sessionId, date: session.date, reason: reasonRaw || undefined }
			});

			recordEvent({
				kind: cancel ? 'training.cancelled' : 'training.spot_fixed',
				actorUserId: locals.user!.id,
				actorName: locals.user!.username,
				title: cancel
					? `Training abgesagt — ${formatDateCh(session.date)}`
					: `Absage aufgehoben — ${formatDateCh(session.date)}`,
				body: cancel && reasonRaw ? reasonRaw : null,
				url: '/training'
			});

			let sent = 0;
			if (cancel) {
				// Bewusst ohne Einstellungs-Filter: eine Absage muss jeden erreichen.
				const attending = getAttendingUserIdsForSession(sessionId, session.dayOfWeek);
				sent = await sendToUsers(attending, {
					title: `Training abgesagt — ${session.dayOfWeek}`,
					body:
						`${formatDateCh(session.date)} findet nicht statt.` +
						(reasonRaw ? ` Grund: ${reasonRaw}` : ''),
					url: '/training',
					tag: `training-cancel-${sessionId}`
				});
			}
			return json({ success: true, sent });
		}

		/** Spot festlegen/zurücksetzen — übersteuert das Voting (auch nach Schluss). */
		if (type === 'set_spot' && sessionId) {
			const session = db
				.select()
				.from(trainingSessions)
				.where(eq(trainingSessions.id, sessionId))
				.get();
			if (!session) return json({ error: 'Training nicht gefunden' }, { status: 404 });

			const rawSpotId = body.spotId;
			const spotId =
				rawSpotId === null || rawSpotId === '' || rawSpotId === undefined ? null : Number(rawSpotId);
			if (spotId !== null && (!Number.isFinite(spotId) || spotId <= 0)) {
				return json({ error: 'Spot ungültig' }, { status: 400 });
			}

			let spotName: string | null = null;
			let spotCity: string | null = null;
			if (spotId !== null) {
				const spot = db
					.select({ name: spots.name, city: spots.city })
					.from(spots)
					.where(and(eq(spots.id, spotId), eq(spots.deleted, false)))
					.get();
				if (!spot) return json({ error: 'Spot nicht gefunden' }, { status: 404 });
				spotName = spot.name;
				spotCity = spot.city;
			}

			db.update(trainingSessions)
				.set({ overrideSpotId: spotId })
				.where(eq(trainingSessions.id, sessionId))
				.run();

			logAudit({
				event,
				action: spotId === null ? 'admin.training.spot_reset' : 'admin.training.spot_override',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { sessionId, date: session.date, spotId, spotName }
			});

			let sent = 0;
			if (spotId !== null && !session.cancelled) {
				recordEvent({
					kind: 'training.spot_fixed',
					actorUserId: locals.user!.id,
					actorName: locals.user!.username,
					title: `Spot geändert: ${spotName}`,
					body: `${formatDateCh(session.date)} · ${spotCity}`,
					url: '/training'
				});
				// Spot-Änderung muss jeden erreichen — bewusst ohne Einstellungs-Filter.
				const attending = getAttendingUserIdsForSession(sessionId, session.dayOfWeek);
				sent = await sendToUsers(attending, {
					title: `Neuer Spot — ${formatDateCh(session.date)}`,
					body: `${spotName} (${spotCity}). Training ${session.timeStart} Uhr.`,
					url: '/training',
					tag: `training-spot-${sessionId}`
				});
			}
			return json({ success: true, sent });
		}

		return json({ error: 'Ungültige Aktion' }, { status: 400 });
	} catch (e) {
		console.error('POST /api/admin/training', e);
		const mapped = jsonFromSqliteOrSchemaError(e);
		if (mapped) return mapped;
		return json({ error: 'Training-Aktion fehlgeschlagen.' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	assertAdmin(locals);

	try {
		const { type, id, userId, sessionId } = await request.json();

		if (type === 'spot_vote' && id) {
			db.delete(trainingSpotVotes).where(eq(trainingSpotVotes.id, id)).run();
			logAudit({
				event,
				action: 'admin.training.spot_vote_remove',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { voteId: id }
			});
			return json({ success: true });
		}

		if (type === 'hide_user' && userId && sessionId) {
			const existing = db
				.select()
				.from(sessionHiddenUsers)
				.where(and(eq(sessionHiddenUsers.userId, userId), eq(sessionHiddenUsers.sessionId, sessionId)))
				.get();
			if (!existing) {
				db.insert(sessionHiddenUsers).values({ sessionId, userId }).run();
			}
			logAudit({
				event,
				action: 'admin.training.hide_user',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				targetUserId: userId,
				detail: { sessionId }
			});
			return json({ success: true });
		}

		if (type === 'unhide_user' && id) {
			db.delete(sessionHiddenUsers).where(eq(sessionHiddenUsers.id, id)).run();
			logAudit({
				event,
				action: 'admin.training.unhide_user',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { hiddenEntryId: id }
			});
			return json({ success: true });
		}

		if (type === 'remove_absence' && id) {
			db.delete(absences).where(eq(absences.id, id)).run();
			logAudit({
				event,
				action: 'admin.training.remove_absence',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { absenceId: id }
			});
			return json({ success: true });
		}

		if (type === 'remove_guest' && id) {
			db.delete(sessionGuests).where(eq(sessionGuests.id, id)).run();
			logAudit({
				event,
				action: 'admin.training.remove_guest',
				actorUserId: locals.user!.id,
				actorUsername: locals.user!.username,
				detail: { guestId: id }
			});
			return json({ success: true });
		}

		return json({ error: 'Ungültige Aktion' }, { status: 400 });
	} catch (e) {
		console.error('DELETE /api/admin/training', e);
		const mapped = jsonFromSqliteOrSchemaError(e);
		if (mapped) return mapped;
		return json({ error: 'Training-Aktion fehlgeschlagen.' }, { status: 500 });
	}
};
