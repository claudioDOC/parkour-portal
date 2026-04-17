import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
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

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const activeUsers = db
		.select({ id: users.id, username: users.username })
		.from(users)
		.where(usersNotDeletedCondition())
		.orderBy(asc(users.username))
		.all();

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
		const destinationsWithVotes = destinations
			.map((d) => ({
				...d,
				voteCount: voteCountByDestination.get(d.id) || 0
			}))
			.sort((a, b) => b.voteCount - a.voteCount || a.name.localeCompare(b.name, 'de'));

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
		const dateOptionsWithVotes = dateOptionsRaw
			.map((d) => ({
				...d,
				voteCount: voteCountByDateOption.get(d.id) || 0,
				sameAsPlanned: d.startDate === plan.startDate && d.endDate === plan.endDate
			}))
			.sort((a, b) => b.voteCount - a.voteCount || a.startDate.localeCompare(b.startDate));

		const myParticipation = participants.find((p) => p.userId === locals.user!.id) || null;
		const myVote = votesRaw.find((v) => v.userId === locals.user!.id) || null;
		const myDateVote = dateVotesRaw.find((v) => v.userId === locals.user!.id) || null;
		const participantByUser = new Map(participants.map((p) => [p.userId, p]));
		const memberStates = activeUsers.map((u) => {
			const row = participantByUser.get(u.id);
			if (!row)
				return {
					userId: u.id,
					username: u.username,
					status: 'pending' as const,
					transportMode: null,
					note: null as string | null
				};
			const note = row.note?.trim() ? row.note.trim() : null;
			if (row.transportMode === 'abgemeldet') {
				return {
					userId: u.id,
					username: u.username,
					status: 'declined' as const,
					transportMode: row.transportMode,
					note
				};
			}
			return {
				userId: u.id,
				username: u.username,
				status: 'joined' as const,
				transportMode: row.transportMode,
				note
			};
		});
		const joinedCount = memberStates.filter((m) => m.status === 'joined').length;
		const declinedCount = memberStates.filter((m) => m.status === 'declined').length;
		const pendingCount = memberStates.filter((m) => m.status === 'pending').length;

		return {
			...plan,
			participants,
			memberStates,
			destinations: destinationsWithVotes,
			dateOptions: dateOptionsWithVotes,
			stopovers,
			myParticipation,
			myVoteDestinationId: myVote?.destinationId ?? null,
			myVoteDateOptionId: myDateVote?.dateOptionId ?? null,
			joinedCount,
			declinedCount,
			pendingCount
		};
	});

	return {
		trips: plansWithDetails,
		activeUsers,
		user: { id: locals.user.id },
		isAdmin: locals.user?.role === 'admin'
	};
};
