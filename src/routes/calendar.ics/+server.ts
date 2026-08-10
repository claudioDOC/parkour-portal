import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { spots, trainingSessions, trainingSpotVotes, tripPlans } from '$lib/server/db/schema';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';
import { sql } from 'drizzle-orm';

/**
 * iCal-Abo für Kalender-Apps: kommende Trainings (inkl. Absagen) und Trips.
 *
 * Kalender-Apps können keine Header setzen — der Schlüssel kommt deshalb als
 * `?key=` und wird gegen PUBLIC_STATUS_API_KEY(S) geprüft (gleiche Schlüssel
 * wie die Status-API). Abo-Link steht in den Einstellungen.
 */

function configuredKeys(): string[] {
	const raw = process.env.PUBLIC_STATUS_API_KEYS ?? process.env.PUBLIC_STATUS_API_KEY ?? '';
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

/** RFC-5545-Textescaping: Backslash, Semikolon, Komma, Zeilenumbruch. */
function esc(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** "2026-08-12" + "18:15" → "20260812T181500" (Wandzeit, TZID macht den Rest). */
function icsLocal(dateStr: string, timeStr: string): string {
	return `${dateStr.replaceAll('-', '')}T${timeStr.replace(':', '')}00`;
}

function icsDate(dateStr: string): string {
	return dateStr.replaceAll('-', '');
}

function addDaysYmd(ymd: string, days: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const GET: RequestHandler = async ({ url }) => {
	const keys = configuredKeys();
	if (keys.length === 0) throw error(503, 'PUBLIC_STATUS_API_KEY ist nicht gesetzt');
	const provided = url.searchParams.get('key')?.trim() ?? '';
	if (!provided || !keys.includes(provided)) throw error(401, 'Unauthorized');

	const today = todayYmdInAppTZ();
	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Parkour Portal//Kalender//DE',
		'CALSCALE:GREGORIAN',
		'X-WR-CALNAME:Parkour Portal',
		'X-WR-TIMEZONE:Europe/Zurich'
	];

	const sessions = db
		.select()
		.from(trainingSessions)
		.where(gte(trainingSessions.date, addDaysYmd(today, -7)))
		.orderBy(trainingSessions.date)
		.limit(40)
		.all();

	for (const s of sessions) {
		// Aktueller Spitzenreiter im Spot-Voting als Ort — Momentaufnahme,
		// Kalender-Apps aktualisieren das Abo ohnehin regelmässig.
		const leader = db
			.select({
				name: spots.name,
				city: spots.city,
				c: sql<number>`COUNT(*)`.as('c')
			})
			.from(trainingSpotVotes)
			.innerJoin(spots, eq(spots.id, trainingSpotVotes.spotId))
			.where(eq(trainingSpotVotes.sessionId, s.id))
			.groupBy(trainingSpotVotes.spotId)
			.orderBy(sql`c DESC`)
			.limit(1)
			.get();

		const cancelled = Boolean(s.cancelled);
		lines.push(
			'BEGIN:VEVENT',
			`UID:training-${s.id}@parkour-portal`,
			`DTSTAMP:${icsDate(today)}T000000Z`,
			`DTSTART;TZID=Europe/Zurich:${icsLocal(s.date, s.timeStart)}`,
			`DTEND;TZID=Europe/Zurich:${icsLocal(s.date, s.timeEnd)}`,
			`SUMMARY:${esc(cancelled ? 'ABGESAGT: Parkour Training' : 'Parkour Training')}`,
			...(leader ? [`LOCATION:${esc(`${leader.name}, ${leader.city}`)}`] : []),
			...(cancelled ? ['STATUS:CANCELLED'] : []),
			`DESCRIPTION:${esc(
				leader
					? `Aktueller Spot-Favorit: ${leader.name} (${leader.city}). Details im Portal.`
					: 'Spot wird per Voting bestimmt — Details im Portal.'
			)}`,
			'END:VEVENT'
		);
	}

	const trips = db
		.select()
		.from(tripPlans)
		.where(and(eq(tripPlans.deleted, false), gte(tripPlans.endDate, today)))
		.all();

	for (const t of trips) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:trip-${t.id}@parkour-portal`,
			`DTSTAMP:${icsDate(today)}T000000Z`,
			`DTSTART;VALUE=DATE:${icsDate(t.startDate)}`,
			// DTEND ist exklusiv — letzter Tag + 1
			`DTEND;VALUE=DATE:${icsDate(addDaysYmd(t.endDate, 1))}`,
			`SUMMARY:${esc(`Parkour-Trip: ${t.title}`)}`,
			...(t.destinationLabel ? [`LOCATION:${esc(t.destinationLabel)}`] : []),
			'END:VEVENT'
		);
	}

	lines.push('END:VCALENDAR');

	return new Response(lines.join('\r\n') + '\r\n', {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Cache-Control': 'public, max-age=900'
		}
	});
};
