import { desc, eq, gt, sql } from 'drizzle-orm';
import { db } from './db';
import { activityEvents, activitySeen } from './db/schema';

/**
 * Aktivitäts-Feed: speist Glocke, roten Punkt und Live-Popups.
 * Fehler dürfen nie eine Aktion kippen — alles defensiv.
 */
export type ActivityKind =
	| 'challenge.new'
	| 'challenge.done'
	| 'spot.new'
	| 'trip.new'
	| 'trip.join'
	| 'trip.decline'
	| 'training.cancelled'
	| 'training.spot_fixed'
	| 'training.extra'
	| 'solo.logged';

export function recordEvent(params: {
	kind: ActivityKind;
	actorUserId?: number | null;
	actorName?: string | null;
	title: string;
	body?: string | null;
	url?: string | null;
}): void {
	try {
		db.insert(activityEvents)
			.values({
				kind: params.kind,
				actorUserId: params.actorUserId ?? null,
				actorName: params.actorName ?? null,
				title: params.title,
				body: params.body ?? null,
				url: params.url ?? null
			})
			.run();
	} catch {
		/* Feed ist Beiwerk — nie die Aktion scheitern lassen */
	}
}

export type FeedEntry = {
	id: number;
	kind: string;
	actorUserId: number | null;
	actorName: string | null;
	title: string;
	body: string | null;
	url: string | null;
	createdAt: string;
};

/** Letzte Ereignisse plus Zahl der ungelesenen für diesen User. */
export function getFeed(userId: number, limit = 30): { entries: FeedEntry[]; unread: number; latestId: number } {
	try {
		const entries = db
			.select()
			.from(activityEvents)
			.orderBy(desc(activityEvents.id))
			.limit(limit)
			.all() as FeedEntry[];

		const seen =
			db
				.select({ lastSeenEventId: activitySeen.lastSeenEventId })
				.from(activitySeen)
				.where(eq(activitySeen.userId, userId))
				.get()?.lastSeenEventId ?? 0;

		const unread =
			Number(
				db
					.select({ c: sql<number>`COUNT(*)` })
					.from(activityEvents)
					.where(gt(activityEvents.id, seen))
					.get()?.c ?? 0
			) || 0;

		return { entries, unread, latestId: entries[0]?.id ?? 0 };
	} catch {
		return { entries: [], unread: 0, latestId: 0 };
	}
}

/** Alles bis `eventId` als gesehen markieren. */
export function markSeen(userId: number, eventId: number): void {
	try {
		db.insert(activitySeen)
			.values({ userId, lastSeenEventId: eventId })
			.onConflictDoUpdate({
				target: activitySeen.userId,
				set: { lastSeenEventId: eventId, updatedAt: sql`(datetime('now'))` }
			})
			.run();
	} catch {
		/* egal */
	}
}
