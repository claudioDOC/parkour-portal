import { db } from '$lib/server/db';
import {
	tripPlans,
	tripParticipants,
	tripDestinations,
	tripDestinationVotes,
	tripDateOptions,
	tripDateAnswers,
	tripStopovers,
	users
} from '$lib/server/db/schema';
import { asc, and, eq, gte, sql } from 'drizzle-orm';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';
import { tripPlansHasSoftDeleteColumns } from '$lib/server/tripPlansTableColumns';
import { MIN_YES, isRestrictedView, parseDbDatetime, rankTally, type DateAnswer } from '$lib/server/tripDatePoll';

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
			voteDeadline: tripPlans.voteDeadline,
			dateLockedAt: tripPlans.dateLockedAt,
			lockedDateOptionId: tripPlans.lockedDateOptionId,
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

		// Terminumfrage: je Datum ja / notfalls / nein, mit Namen.
		const answersRaw = db
			.select({
				dateOptionId: tripDateAnswers.dateOptionId,
				userId: tripDateAnswers.userId,
				username: users.username,
				answer: tripDateAnswers.answer
			})
			.from(tripDateAnswers)
			.innerJoin(users, eq(tripDateAnswers.userId, users.id))
			.where(and(eq(tripDateAnswers.tripId, plan.id), usersNotDeletedCondition()))
			.all();
		const dateOptionsWithVotes = dateOptionsRaw.map((d) => {
			const mine = answersRaw.filter((a) => a.dateOptionId === d.id);
			const names = (kind: DateAnswer) =>
				mine.filter((a) => a.answer === kind).map((a) => a.username).sort((a, b) => a.localeCompare(b, 'de'));
			const yesNames = names('ja');
			const maybeNames = names('notfalls');
			const noNames = names('nein');
			const my = mine.find((a) => a.userId === user!.id);
			return {
				...d,
				/** Alte Clients lesen `voteCount` — entspricht den Ja-Stimmen. */
				voteCount: yesNames.length,
				yesCount: yesNames.length,
				maybeCount: maybeNames.length,
				noCount: noNames.length,
				yesNames,
				maybeNames,
				noNames,
				myAnswer: (my?.answer ?? null) as DateAnswer | null,
				sameAsPlanned: d.startDate === plan.startDate && d.endDate === plan.endDate,
				isLocked: plan.lockedDateOptionId === d.id
			};
		});
		const ranked = rankTally(
			dateOptionsWithVotes.map((d) => ({
				optionId: d.id,
				startDate: d.startDate,
				endDate: d.endDate,
				yes: d.yesCount,
				maybe: d.maybeCount,
				no: d.noCount
			}))
		);
		const rankIndex = new Map(ranked.map((r, i) => [r.optionId, i]));
		dateOptionsWithVotes.sort((a, b) => (rankIndex.get(a.id) ?? 0) - (rankIndex.get(b.id) ?? 0));
		const leader = ranked[0] ?? null;
		const dateLocked = Boolean(plan.dateLockedAt);
		const deadlineDate = parseDbDatetime(plan.voteDeadline);
		const deadlinePassed = deadlineDate ? Date.now() >= deadlineDate.getTime() : false;
		// Alte Felder für ältere Clients — Mehrheit gibt es nicht mehr, die
		// Hürde heisst jetzt MIN_YES.
		const eligibleVoters = activeUsers.length;
		const votesNeeded = MIN_YES;
		const answeredUserIds = new Set(answersRaw.map((a) => a.userId));
		const respondedIds = new Set<number>(answeredUserIds);
		for (const p of participants) if (p.transportMode !== 'enthalten') respondedIds.add(p.userId);
		const silentMembers = activeUsers
			.filter((u) => !respondedIds.has(u.id))
			.map((u) => ({ userId: u.id, username: u.username }));
		const restricted = isRestrictedView(plan, user!.id);

		const myParticipation = participants.find((p) => p.userId === user!.id) || null;
		const myVotes = votesRaw.filter((v) => v.userId === user!.id);
		const planIds = new Set(destinations.filter((d) => (d.kind ?? 'plan') !== 'ziel').map((d) => d.id));
		const myPlanVote = myVotes.find((v) => planIds.has(v.destinationId)) || null;
		const myPlaceVote = myVotes.find((v) => !planIds.has(v.destinationId)) || null;
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
			/** Alte Clients: die eigene Ja-Stimme auf dem bestplatzierten Datum. */
			myVoteDateOptionId: dateOptionsWithVotes.find((d) => d.myAnswer === 'ja')?.id ?? null,
			poll: {
				minYes: MIN_YES,
				deadline: plan.voteDeadline,
				deadlinePassed,
				locked: dateLocked,
				lockedAt: plan.dateLockedAt,
				lockedOptionId: plan.lockedDateOptionId,
				leaderOptionId: leader?.optionId ?? null,
				leaderYes: leader?.yes ?? 0,
				silentMembers,
				hasResponded: respondedIds.has(user!.id),
				canUnlock: user?.role === 'admin' || plan.createdBy === user!.id
			},
			restricted,
			joinedCount,
			conditionalCount,
			abstainedCount,
			declinedCount,
			pendingCount
		};
	});

	// Wer die Frist verschlafen hat, sieht nur Titel und Datum — der Rest
	// kommt mit der Zusage. Zähler bleiben, damit die Karte nicht leer wirkt.
	const visibleTrips = plansWithDetails.map((t) => {
		if (!t.restricted) return t;
		return {
			...t,
			notes: null,
			destinationLatitude: null,
			destinationLongitude: null,
			destinationLabel: null,
			participants: [],
			memberStates: [],
			destinations: [],
			placeOptions: [],
			dateOptions: [],
			stopovers: [],
			myParticipation: null,
			myVoteDestinationId: null,
			myVotePlaceId: null,
			myVoteDateOptionId: null,
			poll: { ...t.poll, silentMembers: [] }
		};
	});

	return {
		trips: visibleTrips,
		activeUsers,
		user: { id: user.id },
		isAdmin: user?.role === 'admin'
	};
};
