import { createHmac, timingSafeEqual } from 'node:crypto';
import { derivedSecret } from '$lib/server/auth';
import { getSessionUserCheckRow } from '$lib/server/userCoreQuery';

/**
 * Persönlicher Kalender-Link je Mitglied.
 *
 * Vorher bekamen alle denselben Schlüssel — denselben, der auch die
 * Status-Schnittstelle öffnet (wer ist abgemeldet und warum). Er liess
 * sich keinem Konto entziehen: Wer das Portal verliess, behielt ihn.
 *
 * Jetzt: `<userId>.<Prüfsumme>`. Die Prüfsumme hängt an der
 * Sitzungsversion des Kontos — „Auf allen Geräten abmelden" und ein
 * Passwortwechsel machen den alten Link damit ungültig, und ein
 * deaktiviertes oder gelöschtes Konto bekommt keinen Kalender mehr.
 * Nichts davon steht in der Datenbank; die Prüfsumme wird nachgerechnet.
 */

const SIG_LEN = 32;

function signature(userId: number, sessionVersion: number): string {
	return createHmac('sha256', derivedSecret('calendar-feed'))
		.update(`${userId}:${sessionVersion}`)
		.digest('base64url')
		.slice(0, SIG_LEN);
}

/** Link für dieses Konto, oder null (Konto inaktiv/gelöscht, ORIGIN fehlt). */
export function calendarUrlFor(userId: number, origin: string): string | null {
	const row = getSessionUserCheckRow(userId);
	if (!row || !row.active || row.deleted) return null;
	const base = origin.replace(/\/$/, '');
	if (!base) return null;
	const token = `${userId}.${signature(userId, Number(row.sessionVersion ?? 0))}`;
	return `${base}/calendar.ics?key=${token}`;
}

/** Konto zum Link-Schlüssel — nur wenn Prüfsumme stimmt und Konto aktiv ist. */
export function userIdForCalendarKey(key: string): number | null {
	const m = /^(\d{1,9})\.([A-Za-z0-9_-]{32})$/.exec(key);
	if (!m) return null;
	const userId = Number(m[1]);
	const row = getSessionUserCheckRow(userId);
	if (!row || !row.active || row.deleted) return null;
	const expected = Buffer.from(signature(userId, Number(row.sessionVersion ?? 0)));
	const given = Buffer.from(m[2]);
	return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}
