import { db } from '$lib/server/db';
import { spotImages, spots, trainingSessions, trainingSpotVotes, votes } from '$lib/server/db/schema';
import { and, asc, eq, lt, sql } from 'drizzle-orm';

/** Endungen, aus denen sich ein Vorschaubild rechnen lässt (keine Videos). */
const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;

/**
 * Platzhalter für die nächste Trainingskarte.
 *
 * Hinter der Karte liegt das Foto des gesetzten oder meistgewählten Spots.
 * Solange noch niemand abgestimmt hat — oder der führende Spot noch kein
 * Foto hat — blieb die Karte leer. Stattdessen zeigen Web und App dann die
 * drei Spots, an denen die Gruppe am häufigsten trainiert hat,
 * schwarz-weiss nebeneinander: Das sieht nach euren Spots aus, ohne einen
 * bestimmten als gewählt vorzutäuschen.
 *
 * „Häufigst trainiert" zählt wie die Statistik: gesetzter Spot, sonst der
 * Spot mit den meisten Stimmen (bei Gleichstand die kleinere Spot-ID).
 * Reicht das für drei Bilder nicht, füllen die bestbewerteten Spots auf.
 *
 * Liefert die Bildpfade (`/uploads/…`); die Schwarz-Weiss-Fassung holen
 * Web und App mit `?w=480&gray=1`.
 */
export function placeholderSpotImages(today: string, limit = 3): string[] {
	// Erstes Foto (kein Video) je noch vorhandenem Spot.
	const firstImage = new Map<number, string>();
	for (const r of db
		.select({ spotId: spotImages.spotId, filename: spotImages.filename })
		.from(spotImages)
		.innerJoin(spots, eq(spots.id, spotImages.spotId))
		.where(eq(spots.deleted, false))
		.orderBy(asc(spotImages.id))
		.all()) {
		if (!firstImage.has(r.spotId) && IMAGE_FILE.test(r.filename)) firstImage.set(r.spotId, r.filename);
	}
	if (firstImage.size === 0) return [];

	const past = db
		.select({ id: trainingSessions.id, overrideSpotId: trainingSessions.overrideSpotId })
		.from(trainingSessions)
		.where(and(lt(trainingSessions.date, today), eq(trainingSessions.cancelled, false)))
		.all();

	const topVoted = new Map<number, number>();
	for (const r of db
		.select({
			sessionId: trainingSpotVotes.sessionId,
			spotId: trainingSpotVotes.spotId,
			n: sql<number>`COUNT(*)`.as('n')
		})
		.from(trainingSpotVotes)
		.groupBy(trainingSpotVotes.sessionId, trainingSpotVotes.spotId)
		.orderBy(asc(trainingSpotVotes.sessionId), sql`n DESC`, asc(trainingSpotVotes.spotId))
		.all()) {
		if (!topVoted.has(r.sessionId)) topVoted.set(r.sessionId, r.spotId);
	}

	const trained = new Map<number, number>();
	for (const s of past) {
		const spotId = s.overrideSpotId ?? topVoted.get(s.id);
		if (spotId != null) trained.set(spotId, (trained.get(spotId) ?? 0) + 1);
	}

	const rating = new Map<number, number>(
		db
			.select({ spotId: votes.spotId, avg: sql<number>`AVG(${votes.score})` })
			.from(votes)
			.groupBy(votes.spotId)
			.all()
			.map((r) => [r.spotId, Number(r.avg) || 0])
	);

	return [...firstImage.keys()]
		.sort(
			(a, b) =>
				(trained.get(b) ?? 0) - (trained.get(a) ?? 0) ||
				(rating.get(b) ?? 0) - (rating.get(a) ?? 0) ||
				a - b
		)
		.slice(0, limit)
		.map((spotId) => `/uploads/${firstImage.get(spotId)}`);
}
