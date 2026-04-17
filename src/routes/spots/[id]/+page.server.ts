import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	spots,
	votes,
	users,
	spotImages,
	spotParkingLocations,
	spotChallenges,
	spotChallengeCompletions
} from '$lib/server/db/schema';
import { eq, sql, and, asc, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { getNextOpenSessionId } from '$lib/server/training';
import { asNum } from '$lib/server/asSqlNumber';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';
import { isSpotChallengesSchemaReady } from '$lib/server/spotChallengesSchemaReady';
import { spotsParkingTableExists, spotsTableHasMicrospotColumns } from '$lib/server/spotsTableColumns';

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	return 2 * R * Math.asin(Math.sqrt(a));
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const spotId = parseInt(params.id);
	const hasMicro = spotsTableHasMicrospotColumns();

	const spot = db
		.select({
			id: spots.id,
			name: spots.name,
			city: spots.city,
			latitude: spots.latitude,
			longitude: spots.longitude,
			isMicro: hasMicro ? spots.isMicro : sql<boolean>`0`.as('is_micro'),
			parentSpotId: hasMicro ? spots.parentSpotId : sql<number | null>`NULL`.as('parent_spot_id'),
			lighting: spots.lighting,
			techniques: spots.techniques,
			goodWeather: spots.goodWeather,
			description: spots.description,
			addedBy: spots.addedBy,
			addedByName: users.username,
			deleted: spots.deleted,
			createdAt: spots.createdAt
		})
		.from(spots)
		.innerJoin(users, eq(spots.addedBy, users.id))
		.where(eq(spots.id, spotId))
		.get();

	if (!spot) {
		throw error(404, 'Spot nicht gefunden');
	}

	const stats = db.select({
		avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`,
		voteCount: sql<number>`COUNT(${votes.id})`
	})
		.from(votes)
		.where(eq(votes.spotId, spotId))
		.get();

	let userVote: number | null = null;
	if (locals.user) {
		const existing = db.select().from(votes)
			.where(and(eq(votes.userId, locals.user.id), eq(votes.spotId, spotId)))
			.get();
		if (existing) userVote = existing.score;
	}

	const images = db.select({
		id: spotImages.id,
		filename: spotImages.filename,
		uploadedBy: spotImages.uploadedBy
	})
		.from(spotImages)
		.where(eq(spotImages.spotId, spotId))
		.all();

	const parkingLocations = spotsParkingTableExists()
		? db
				.select({
					id: spotParkingLocations.id,
					name: spotParkingLocations.name,
					latitude: spotParkingLocations.latitude,
					longitude: spotParkingLocations.longitude
				})
				.from(spotParkingLocations)
				.where(eq(spotParkingLocations.spotId, spotId))
				.orderBy(asc(spotParkingLocations.id))
				.all()
		: [];

	const challengesSchemaReady = isSpotChallengesSchemaReady();
	const challenges = challengesSchemaReady
		? db
				.select({
					id: spotChallenges.id,
					title: spotChallenges.title,
					description: spotChallenges.description,
					createdAt: spotChallenges.createdAt,
					createdBy: spotChallenges.createdBy,
					createdByName: users.username
				})
				.from(spotChallenges)
				.innerJoin(users, eq(spotChallenges.createdBy, users.id))
				.where(
					and(
						eq(spotChallenges.spotId, spotId),
						eq(spotChallenges.deleted, false),
						usersNotDeletedCondition()
					)
				)
				.orderBy(asc(spotChallenges.createdAt))
				.all()
		: [];

	const participants = challengesSchemaReady
		? db
				.select({
					id: users.id,
					username: users.username
				})
				.from(users)
				.where(and(eq(users.active, true), usersNotDeletedCondition()))
				.orderBy(asc(users.username))
				.all()
		: [];

	const challengeIds = challenges.map((c) => c.id);
	const completions =
		challengesSchemaReady && challengeIds.length > 0
			? db
					.select({
						challengeId: spotChallengeCompletions.challengeId,
						userId: spotChallengeCompletions.userId,
						username: users.username
					})
					.from(spotChallengeCompletions)
					.innerJoin(users, eq(spotChallengeCompletions.userId, users.id))
					.where(and(inArray(spotChallengeCompletions.challengeId, challengeIds), usersNotDeletedCondition()))
					.orderBy(asc(users.username))
					.all()
			: [];

	const parentSpot =
		hasMicro && spot.parentSpotId
			? db
					.select({ id: spots.id, name: spots.name, city: spots.city })
					.from(spots)
					.where(eq(spots.id, spot.parentSpotId))
					.get()
			: null;
	const parentSpotWithDistance =
		parentSpot && spot.latitude != null && spot.longitude != null
			? (() => {
					const parentCoords = db
						.select({ latitude: spots.latitude, longitude: spots.longitude })
						.from(spots)
						.where(eq(spots.id, parentSpot.id))
						.get();
					if (parentCoords?.latitude == null || parentCoords.longitude == null) {
						return { ...parentSpot, distanceMeters: null };
					}
					return {
						...parentSpot,
						distanceMeters: Math.round(
							distanceMeters(spot.latitude as number, spot.longitude as number, parentCoords.latitude, parentCoords.longitude)
						)
					};
				})()
			: parentSpot
				? { ...parentSpot, distanceMeters: null }
				: null;

	const parentCandidates = hasMicro
		? db
				.select({
					id: spots.id,
					name: spots.name,
					city: spots.city,
					isMicro: spots.isMicro
				})
				.from(spots)
				.where(and(eq(spots.deleted, false), sql`${spots.id} != ${spot.id}`))
				.all()
				.filter((s) => !s.isMicro)
				.sort((a, b) => a.name.localeCompare(b.name, 'de'))
		: [];

	const childMicroSpots = hasMicro
		? db
				.select({
					id: spots.id,
					name: spots.name,
					city: spots.city,
					latitude: spots.latitude,
					longitude: spots.longitude
				})
				.from(spots)
				.where(
					and(
						eq(spots.deleted, false),
						eq(spots.isMicro, true),
						eq(spots.parentSpotId, spot.id)
					)
				)
				.all()
				.map((s) => ({
					id: s.id,
					name: s.name,
					city: s.city,
					distanceMeters:
						spot.latitude != null &&
						spot.longitude != null &&
						s.latitude != null &&
						s.longitude != null
							? Math.round(distanceMeters(spot.latitude, spot.longitude, s.latitude, s.longitude))
							: null
				}))
				.sort((a, b) => {
					if (a.distanceMeters == null && b.distanceMeters == null) {
						return a.name.localeCompare(b.name, 'de');
					}
					if (a.distanceMeters == null) return 1;
					if (b.distanceMeters == null) return -1;
					if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
					return a.name.localeCompare(b.name, 'de');
				})
		: [];

	const nearbySpots =
		spot.latitude != null && spot.longitude != null
			? db
					.select({
						id: spots.id,
						name: spots.name,
						city: spots.city,
						latitude: spots.latitude,
						longitude: spots.longitude,
						isMicro: hasMicro ? spots.isMicro : sql<boolean>`0`.as('is_micro')
					})
					.from(spots)
					.where(and(eq(spots.deleted, false), sql`${spots.id} != ${spot.id}`))
					.all()
					.filter((s) => s.latitude != null && s.longitude != null)
					.map((s) => ({
						id: s.id,
						name: s.name,
						city: s.city,
						isMicro: Boolean(s.isMicro),
						distanceMeters: Math.round(
							distanceMeters(spot.latitude as number, spot.longitude as number, s.latitude as number, s.longitude as number)
						)
					}))
					.filter((s) => s.distanceMeters <= 100)
					.sort((a, b) => a.distanceMeters - b.distanceMeters)
			: [];

	const mapMarkers: Array<{
		id: number;
		name: string;
		city: string;
		lat: number;
		lon: number;
		kind: 'main' | 'micro' | 'nearby' | 'parent' | 'parking';
	}> = [];

	if (spot.latitude != null && spot.longitude != null) {
		mapMarkers.push({
			id: spot.id,
			name: spot.name,
			city: spot.city,
			lat: spot.latitude,
			lon: spot.longitude,
			kind: 'main'
		});
	}

	if (parentSpot) {
		const pCoords = db
			.select({ latitude: spots.latitude, longitude: spots.longitude })
			.from(spots)
			.where(eq(spots.id, parentSpot.id))
			.get();
		if (pCoords?.latitude != null && pCoords.longitude != null) {
			mapMarkers.push({
				id: parentSpot.id,
				name: parentSpot.name,
				city: parentSpot.city,
				lat: pCoords.latitude,
				lon: pCoords.longitude,
				kind: 'parent'
			});
		}
	}

	const childMicroWithCoords = hasMicro
		? db
				.select({
					id: spots.id,
					name: spots.name,
					city: spots.city,
					latitude: spots.latitude,
					longitude: spots.longitude
				})
				.from(spots)
				.where(
					and(
						eq(spots.deleted, false),
						eq(spots.isMicro, true),
						eq(spots.parentSpotId, spot.id)
					)
				)
				.all()
		: [];
	for (const m of childMicroWithCoords) {
		if (m.latitude == null || m.longitude == null) continue;
		mapMarkers.push({
			id: m.id,
			name: m.name,
			city: m.city,
			lat: m.latitude,
			lon: m.longitude,
			kind: 'micro'
		});
	}

	for (const p of parkingLocations) {
		mapMarkers.push({
			id: p.id,
			name: p.name || 'Parkplatz',
			city: spot.city,
			lat: p.latitude,
			lon: p.longitude,
			kind: 'parking'
		});
	}

	return {
		spot,
		avgScore: asNum(stats?.avgScore ?? 0),
		voteCount: asNum(stats?.voteCount ?? 0),
		userVote,
		images: images.map((img) => ({ ...img, url: `/uploads/${img.filename}` })),
		parkingLocations,
		challenges: challenges.map((challenge) => {
			const doneBy = completions
				.filter((c) => c.challengeId === challenge.id)
				.map((c) => ({ userId: c.userId, username: c.username }));
			const doneIds = new Set(doneBy.map((d) => d.userId));
			const openBy = participants.filter((p) => !doneIds.has(p.id));
			return {
				...challenge,
				doneCount: doneBy.length,
				openCount: openBy.length,
				doneBy,
				openBy
			};
		}),
		parentSpot: parentSpotWithDistance,
		childMicroSpots,
		nearbySpots,
		mapMarkers,
		parentCandidates,
		user: locals.user,
		nextOpenSessionId: getNextOpenSessionId()
	};
};
