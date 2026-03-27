import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { trainingSessions, trainingSpotVotes, absences, spots, users } from '$lib/server/db/schema';
import { eq, gte, asc, and, sql } from 'drizzle-orm';

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

	const allUsers = db.select({ id: users.id, username: users.username, active: users.active })
		.from(users).all();

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

		const absentUserIds = new Set(sessionAbsences.map((a) => a.userId));
		const attending = allUsers.filter((u) => !absentUserIds.has(u.id));

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

		return {
			...session,
			absences: sessionAbsences,
			attending,
			spotVotes
		};
	});

	return json({ sessions: result });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	assertAdmin(locals);

	const { type, id, userId, sessionId } = await request.json();

	if (type === 'spot_vote' && id) {
		db.delete(trainingSpotVotes).where(eq(trainingSpotVotes.id, id)).run();
		return json({ success: true });
	}

	if (type === 'force_absence' && userId && sessionId) {
		const existing = db.select().from(absences)
			.where(and(eq(absences.userId, userId), eq(absences.sessionId, sessionId)))
			.get();
		if (!existing) {
			db.insert(absences).values({
				userId,
				sessionId,
				reason: 'Vom Admin entfernt'
			}).run();
		}
		return json({ success: true });
	}

	if (type === 'remove_absence' && id) {
		db.delete(absences).where(eq(absences.id, id)).run();
		return json({ success: true });
	}

	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};
