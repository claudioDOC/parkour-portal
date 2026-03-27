import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { votes, trainingSpotVotes, absences, spots, trainingSessions, users } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

export const GET: RequestHandler = async ({ url, locals }) => {
	assertAdmin(locals);

	const userId = parseInt(url.searchParams.get('userId') || '');
	if (!userId) return json({ error: 'User-ID erforderlich' }, { status: 400 });

	const spotVotes = db.select({
		id: votes.id,
		spotName: spots.name,
		spotCity: spots.city,
		score: votes.score,
		createdAt: votes.createdAt
	})
		.from(votes)
		.innerJoin(spots, eq(votes.spotId, spots.id))
		.where(eq(votes.userId, userId))
		.all();

	const trainingVotes = db.select({
		id: trainingSpotVotes.id,
		spotName: spots.name,
		sessionDate: trainingSessions.date,
		sessionDay: trainingSessions.dayOfWeek,
		createdAt: trainingSpotVotes.createdAt
	})
		.from(trainingSpotVotes)
		.innerJoin(spots, eq(trainingSpotVotes.spotId, spots.id))
		.innerJoin(trainingSessions, eq(trainingSpotVotes.sessionId, trainingSessions.id))
		.where(eq(trainingSpotVotes.userId, userId))
		.all();

	const userAbsences = db.select({
		id: absences.id,
		sessionDate: trainingSessions.date,
		sessionDay: trainingSessions.dayOfWeek,
		reason: absences.reason,
		createdAt: absences.createdAt
	})
		.from(absences)
		.innerJoin(trainingSessions, eq(absences.sessionId, trainingSessions.id))
		.where(eq(absences.userId, userId))
		.all();

	return json({ spotVotes, trainingVotes, absences: userAbsences });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	assertAdmin(locals);

	const { type, id } = await request.json();

	if (!type || !id) {
		return json({ error: 'Typ und ID erforderlich' }, { status: 400 });
	}

	if (type === 'spot_vote') {
		db.delete(votes).where(eq(votes.id, id)).run();
		return json({ success: true });
	}

	if (type === 'training_vote') {
		db.delete(trainingSpotVotes).where(eq(trainingSpotVotes.id, id)).run();
		return json({ success: true });
	}

	if (type === 'absence') {
		db.delete(absences).where(eq(absences.id, id)).run();
		return json({ success: true });
	}

	return json({ error: 'Ungültiger Typ' }, { status: 400 });
};
