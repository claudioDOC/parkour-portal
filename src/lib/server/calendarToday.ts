/** Kalendertag für Trainings-Logik (CH) — vermeidet UTC-Drift bei `toISOString().split('T')[0]`. */
const APP_CALENDAR_TZ = 'Europe/Zurich';

export function todayYmdInAppTZ(date = new Date()): string {
	return new Intl.DateTimeFormat('sv-SE', {
		timeZone: APP_CALENDAR_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

/** Deutscher Wochentag eines Datums (Zürich) — für neue Trainingstermine. */
export function germanWeekdayInAppTZ(ymd: string): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const instant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
	const name = new Intl.DateTimeFormat('de-CH', {
		timeZone: APP_CALENDAR_TZ,
		weekday: 'long'
	}).format(instant);
	// „Montag" statt „Montag," je nach Umgebung — Satzzeichen abschneiden.
	return name.replace(/[^\p{L}]/gu, '');
}

/**
 * YYYY-MM-TT um `days` Tage verschieben. Reine UTC-Arithmetik auf dem
 * Kalendertag, also ohne Sommerzeit- oder Mitternachts-Drift.
 */
export function addDaysYmd(ymd: string, days: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Wie weit die Wetter-Prognose an Trainingskarten reicht (Tage ab heute). */
export const FORECAST_HORIZON_DAYS = 7;
