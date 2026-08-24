import { db } from './db';
import { spotChallenges, spotImages, spots, trainingSessions, trainingSpotVotes, votes } from './db/schema';
import { asNum } from './asSqlNumber';
import { and, asc, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { todayYmdInAppTZ } from './calendarToday';

/**
 * Spots mit Koordinaten samt Bewertung, Bild und Challenge-Zahl für die
 * Karte. Liegt hier und nicht in einem Seiten-Loader, weil die Karte im
 * Portal keine eigene Seite mehr ist, sondern die zweite Ansicht der
 * Spots-Seite — wie im Spots-Tab der App.
 */
export function buildSpotMapPayload() {
	const rows = db
		.select({
			id: spots.id,
			name: spots.name,
			city: spots.city,
			latitude: spots.latitude,
			longitude: spots.longitude,
			isMicro: spots.isMicro,
			avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`.as('avg_score'),
			voteCount: sql<number>`COUNT(${votes.id})`.as('vote_count')
		})
		.from(spots)
		.leftJoin(votes, eq(spots.id, votes.spotId))
		.where(
			and(eq(spots.deleted, false), isNotNull(spots.latitude), isNotNull(spots.longitude))
		)
		.groupBy(spots.id)
		.orderBy(asc(spots.city), asc(spots.name))
		.all();

	// Spot mit den meisten Votes fürs nächste (nicht abgesagte) Training —
	// bekommt auf der Karte den Trainings-Pin.
	let nextTrainingSpotId: number | null = null;
	const today = todayYmdInAppTZ();
	const nextSession = db
		.select()
		.from(trainingSessions)
		.where(and(gte(trainingSessions.date, today), eq(trainingSessions.cancelled, false)))
		.orderBy(asc(trainingSessions.date))
		.limit(1)
		.get();
	if (nextSession) {
		const top = db
			.select({ spotId: trainingSpotVotes.spotId, c: sql<number>`COUNT(*)`.as('c') })
			.from(trainingSpotVotes)
			.where(eq(trainingSpotVotes.sessionId, nextSession.id))
			.groupBy(trainingSpotVotes.spotId)
			.orderBy(desc(sql`c`))
			.limit(1)
			.get();
		nextTrainingSpotId = top?.spotId ?? null;
	}

	const mapSpots = rows
		.filter(
			(s) =>
				s.latitude != null &&
				s.longitude != null &&
				Number.isFinite(s.latitude) &&
				Number.isFinite(s.longitude)
		)
		.map((s) => {
			let challengeCount = 0;
			try {
				challengeCount = Number(
					db
						.select({ c: sql<number>`COUNT(*)` })
						.from(spotChallenges)
						.where(and(eq(spotChallenges.spotId, s.id), eq(spotChallenges.deleted, false)))
						.get()?.c ?? 0
				);
			} catch {
				/* Challenge-Schema evtl. nicht bereit */
			}
			const firstImage = db
				.select({ filename: spotImages.filename })
				.from(spotImages)
				.where(eq(spotImages.spotId, s.id))
				.orderBy(asc(spotImages.id))
				.get();
			return {
				id: s.id,
				name: s.name,
				city: s.city,
				latitude: s.latitude,
				longitude: s.longitude,
				isMicro: Boolean(s.isMicro),
				avgScore: asNum(s.avgScore),
				voteCount: asNum(s.voteCount),
				thumbnail: firstImage ? `/uploads/${firstImage.filename}` : null,
				challengeCount
			};
		});

	return { spots: mapSpots, nextTrainingSpotId };
}
