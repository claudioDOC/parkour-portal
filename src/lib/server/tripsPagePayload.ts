import { db } from '$lib/server/db';
import {
	tripPlans,
	tripParticipants,
	tripDestinations,
	tripDestinationVotes,
	tripDateOptions,
	tripDateVotes,
	tripStopovers,
	users
} from '$lib/server/db/schema';
import { asc, and, eq, gte, sql } from 'drizzle-orm';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';
import { tripPlansHasSoftDeleteColumns } from '$lib/server/tripPlansTableColumns';

/** Viewer für den Trips-Payload — Web und API v1 nutzen dasselbe. */
export type TripsViewer = { id: number; role?: string | null };

/** Kompletter Payload der Trips-Seite, gemeinsam für Web und /api/v1/trips. */
export function buildTripsPagePayload(user: TripsViewer) {
	const activeUsers = db
		.select({ id: users.id, username: users.username, avatar: users.avatar })
		.from(users)
		.where(usersNotDeletedCondition())
		.orderBy(asc(users.username))
		.all()
		.map((u) => ({ ...u, avatar: u.avatar ? `/uploads/${u.avatar}` : null }));

	const today = new Date().toISOString().slice(0, 10);
	const hasTripTrash = tripPlansHasSoftDeleteColumns();
	const plans = db
		.select({
			id: tripPlans.id,
			title: tripPlans.title,
			startDate: tripPlans.startDate,
			endDate: tripPlans.endDate,
			notes: tripPlans.notes,
			destinationLatitude: tripPlans.destinationLatitude,
			destinationLongitude: tripPlans.destinationLongitude,
			destinationLabel: tripPlans.destinationLabel,
			transportMode: tripPlans.transportMode,
			carCount: tripPlans.carCount,
			seatsPerCar: tripPlans.seatsPerCar,
			createdBy: tripPlans.createdBy,
			createdAt: tripPlans.createdAt,
			deleted: hasTripTrash ? tripPlans.deleted : sql<boolean>`0`.as('deleted')
		})
		.from(tripPlans)
		.where(
			hasTripTrash
				? and(gte(tripPlans.endDate, today), eq(tripPlans.deleted, false))
				: gte(tripPlans.endDate, today)
		)
		.orderBy(asc(tripPlans.startDate))
		.all();

	const plansWithDetails = plans.map((plan) => {
		const participants = db
			.select({
				userId: tripParticipants.userId,
				username: users.username,
				transportMode: tripParticipants.transportMode,
				hasCar: tripParticipants.hasCar,
				seatsOffered: tripParticipants.seatsOffered,
				note: tripParticipants.note
			})
			.from(tripParticipants)
			.innerJoin(users, eq(tripParticipants.userId, users.id))
			.where(eq(tripParticipants.tripId, plan.id))
			.all();

		const destinations = db
			.select({
				id: tripDestinations.id,
				name: tripDestinations.name,
				city: tripDestinations.city,
				note: tripDestinations.note,
				kind: tripDestinations.kind,
				latitude: tripDestinations.latitude,
				longitude: tripDestinations.longitude,
				proposedBy: tripDestinations.proposedBy,
				proposedByName: users.username
			})
			.from(tripDestinations)
			.innerJoin(users, eq(tripDestinations.proposedBy, users.id))
			.where(eq(tripDestinations.tripId, plan.id))
			.orderBy(asc(tripDestinations.createdAt))
			.all();

		const votesRaw = db
			.select({
				id: tripDestinationVotes.id,
				destinationId: tripDestinationVotes.destinationId,
				userId: tripDestinationVotes.userId,
				username: users.username
			})
			.from(tripDestinationVotes)
			.innerJoin(users, eq(tripDestinationVotes.userId, users.id))
			.where(eq(tripDestinationVotes.tripId, plan.id))
			.all();

		const voteCountByDestination = new Map<number, number>();
		for (const v of votesRaw) {
			voteCountByDestination.set(v.destinationId, (voteCountByDestination.get(v.destinationId) || 0) + 1);
		}
		const withVotes = destinations
			.map((d) => ({
				...d,
				voteCount: voteCountByDestination.get(d.id) || 0
			}))
			.sort((a, b) => b.voteCount - a.voteCount || a.name.localeCompare(b.name, 'de'));
		// Ablauf und Zielort teilen sich die Tabelle, sind aber zwei
		// getrennte Abstimmungen.
		const destinationsWithVotes = withVotes.filter((d) => (d.kind ?? 'plan') !== 'ziel');
		const placeOptions = withVotes.filter((d) => d.kind === 'ziel');

		const stopovers = db
			.select({
				id: tripStopovers.id,
				label: tripStopovers.label,
				latitude: tripStopovers.latitude,
				longitude: tripStopovers.longitude,
				sortOrder: tripStopovers.sortOrder,
				proposedBy: tripStopovers.proposedBy,
				proposedByName: users.username
			})
			.from(tripStopovers)
			.innerJoin(users, eq(tripStopovers.proposedBy, users.id))
			.where(eq(tripStopovers.tripId, plan.id))
			.orderBy(asc(tripStopovers.sortOrder), asc(tripStopovers.id))
			.all();

		const dateOptionsRaw = db
			.select({
				id: tripDateOptions.id,
				startDate: tripDateOptions.startDate,
				endDate: tripDateOptions.endDate,
				note: tripDateOptions.note,
				proposedBy: tripDateOptions.proposedBy,
				proposedByName: users.username
			})
			.from(tripDateOptions)
			.innerJoin(users, eq(tripDateOptions.proposedBy, users.id))
			.where(eq(tripDateOptions.tripId, plan.id))
			.orderBy(asc(tripDateOptions.createdAt))
			.all();

		const dateVotesRaw = db
			.select({
				id: tripDateVotes.id,
				dateOptionId: tripDateVotes.dateOptionId,
				userId: tripDateVotes.userId
			})
			.from(tripDateVotes)
			.where(eq(tripDateVotes.tripId, plan.id))
			.all();

		const voteCountByDateOption = new Map<number, number>();
		for (const v of dateVotesRaw) {
			voteCountByDateOption.set(v.dateOptionId, (voteCountByDateOption.get(v.dateOptionId) || 0) + 1);
		}
		// Stimmberechtigt: alle Teilnehmer ausser abgemeldet/enthalten.
		// Über 50 % davon ersetzen den Trip-Termin (siehe API).
		const eligibleVoters = participants.filter(
			(p) => p.transportMode !== 'abgemeldet' && p.transportMode !== 'enthalten'
		).length;
		const votesNeeded = eligibleVoters > 0 ? Math.floor(eligibleVoters / 2) + 1 : 0;

		const dateOptionsWithVotes = dateOptionsRaw
			.map((d) => ({
				...d,
				voteCount: voteCountByDateOption.get(d.id) || 0,
				sameAsPlanned: d.startDate === plan.startDate && d.endDate === plan.endDate
			}))
			.sort((a, b) => b.voteCount - a.voteCount || a.startDate.localeCompare(b.startDate));

		const myParticipation = participants.find((p) => p.userId === user!.id) || null;
		const myVotes = votesRaw.filter((v) => v.userId === user!.id);
		const planIds = new Set(destinations.filter((d) => (d.kind ?? 'plan') !== 'ziel').map((d) => d.id));
		const myPlanVote = myVotes.find((v) => planIds.has(v.destinationId)) || null;
		const myPlaceVote = myVotes.find((v) => !planIds.has(v.destinationId)) || null;
		const myDateVote = dateVotesRaw.find((v) => v.userId === user!.id) || null;
		const participantByUser = new Map(participants.map((p) => [p.userId, p]));
		const memberStates = activeUsers.map((u) => {
			const row = participantByUser.get(u.id);
			if (!row)
				return {
					userId: u.id,
					username: u.username,
					avatar: u.avatar,
					status: 'pending' as const,
					transportMode: null,
					note: null as string | null
				};
			const note = row.note?.trim() ? row.note.trim() : null;
			/**
			 * Aus dem alten Anreise-Feld ist ein Status geworden:
			 * dabei · bedingt (dabei, aber unter Vorbehalt) · enthalten ·
			 * abgemeldet. Alte Einträge („mitfahrt", „zug" …) sind schlicht
			 * Zusagen und werden als „dabei" gelesen.
			 */
			const status =
				row.transportMode === 'abgemeldet'
					? ('declined' as const)
					: row.transportMode === 'enthalten'
						? ('abstained' as const)
						: row.transportMode === 'bedingt'
							? ('conditional' as const)
							: ('joined' as const);
			return {
				userId: u.id,
				username: u.username,
				avatar: u.avatar,
				status,
				transportMode: row.transportMode,
				note
			};
		});
		const joinedCount = memberStates.filter((m) => m.status === 'joined').length;
		const conditionalCount = memberStates.filter((m) => m.status === 'conditional').length;
		const abstainedCount = memberStates.filter((m) => m.status === 'abstained').length;
		const declinedCount = memberStates.filter((m) => m.status === 'declined').length;
		const pendingCount = memberStates.filter((m) => m.status === 'pending').length;

		return {
			...plan,
			participants,
			memberStates,
			destinations: destinationsWithVotes,
			placeOptions,
			dateOptions: dateOptionsWithVotes,
			eligibleVoters,
			votesNeeded,
			stopovers,
			myParticipation,
			myVoteDestinationId: myPlanVote?.destinationId ?? null,
			myVotePlaceId: myPlaceVote?.destinationId ?? null,
			myVoteDateOptionId: myDateVote?.dateOptionId ?? null,
			joinedCount,
			conditionalCount,
			abstainedCount,
			declinedCount,
			pendingCount
		};
	});

	return {
		trips: plansWithDetails,
		activeUsers,
		user: { id: user.id },
		isAdmin: user?.role === 'admin'
	};
};
