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
