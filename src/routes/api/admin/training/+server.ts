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
	trainingSessionRsvp
} from '$lib/server/db/schema';
import { eq, gte, asc, and } from 'drizzle-orm';
import { logAudit } from '$lib/server/audit';
import { filterAttendingUsers } from '$lib/server/trainingAttendance';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

export const GET: RequestHandler = async ({ locals }) => {
	assertAdmin(locals);

	const today = new Date().toISOString().split('T')[0];
	const sessions = db.select().from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(8)
		.all();

	const allUsers = db
		.select({
			id: users.id,
			username: users.username,
			active: users.active,
			trainingAttendance: users.trainingAttendance
		})
		.from(users)
		.all();

	const result = sessions.map((session) => {
		const sessionAbsences = db.select({
			id: absences.id,
			userId: absences.userId,
			username: users.username,
			reason: absences.reason
		})
			.from(absences)
			.innerJoin(users, eq(absences.userId, users.id))
			.where(eq(absences.sessionId, session.id))
			.all();

		const hiddenUsers = db.select({
			id: sessionHiddenUsers.id,
			userId: sessionHiddenUsers.userId,
			username: users.username
		})
			.from(sessionHiddenUsers)
			.innerJoin(users, eq(sessionHiddenUsers.userId, users.id))
			.where(eq(sessionHiddenUsers.sessionId, session.id))
			.all();

		const absentUserIds = new Set(sessionAbsences.map((a) => a.userId));
		const hiddenUserIds = new Set(hiddenUsers.map((h) => h.userId));
		const rsvpUserIds = new Set(
			db
				.select({ userId: trainingSessionRsvp.userId })
				.from(trainingSessionRsvp)
				.where(eq(trainingSessionRsvp.sessionId, session.id))
				.all()
				.map((r) => r.userId)
		);
		const attending = filterAttendingUsers(allUsers, absentUserIds, hiddenUserIds, rsvpUserIds);

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
			.where(eq(trainingSpotVotes.sessionId, session.id))
			.all();

		const guests = db.select()
			.from(sessionGuests)
			.where(eq(sessionGuests.sessionId, session.id))
			.all();

		return {
			...session,
			absences: sessionAbsences,
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

	const { type, sessionId, name } = await request.json();

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

	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};

export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	assertAdmin(locals);

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
		const existing = db.select().from(sessionHiddenUsers)
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
};
