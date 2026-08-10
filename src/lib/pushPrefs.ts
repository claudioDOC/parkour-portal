/**
 * Push-Einstellungen pro User. Werden als JSON in `users.push_prefs` abgelegt;
 * fehlende Schlüssel fallen auf die Defaults zurück.
 */

export type PushPrefs = {
	/** Erinnerung am Vorabend an das nächste Training. */
	trainingReminder: boolean;
	/** Am Trainingstag um 16:15, sobald der Spot feststeht (Voting-Schluss). */
	spotFix: boolean;
	/** Erinnerung am Trainingstag, wenn noch keine Zu-/Absage vorliegt (nur opt_in). */
	trainingRsvpReminder: boolean;
	/** Neue Challenge an einem Spot. */
	challenges: boolean;
	/** Neue Trips und Terminabstimmungen. */
	trips: boolean;
};

export const DEFAULT_PUSH_PREFS: PushPrefs = {
	trainingReminder: true,
	spotFix: true,
	trainingRsvpReminder: true,
	challenges: true,
	trips: true
};

export const PUSH_PREF_LABELS: Record<keyof PushPrefs, { title: string; hint: string }> = {
	trainingReminder: {
		title: 'Training-Erinnerung',
		hint: 'Am Vorabend um 18:00: Erinnerung an das Training am nächsten Tag.'
	},
	spotFix: {
		title: 'Spot fix',
		hint: 'Am Trainingstag um 16:15: welcher Spot gewonnen hat (Voting-Schluss).'
	},
	trainingRsvpReminder: {
		title: 'Erinnerung an Zu-/Absage',
		hint: 'Am Trainingstag am Morgen, falls du dich noch nicht eingetragen hast.'
	},
	challenges: {
		title: 'Neue Challenges',
		hint: 'Wenn jemand eine neue Challenge an einem Spot erstellt.'
	},
	trips: {
		title: 'Trips',
		hint: 'Neue Trips und offene Terminabstimmungen.'
	}
};

export const PUSH_PREF_KEYS = Object.keys(DEFAULT_PUSH_PREFS) as (keyof PushPrefs)[];

/** Tolerant gegenüber leerem, kaputtem oder unvollständigem JSON. */
export function parsePushPrefs(raw: string | null | undefined): PushPrefs {
	if (!raw) return { ...DEFAULT_PUSH_PREFS };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ...DEFAULT_PUSH_PREFS };
	}
	if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PUSH_PREFS };
	const obj = parsed as Record<string, unknown>;
	const result = { ...DEFAULT_PUSH_PREFS };
	for (const key of PUSH_PREF_KEYS) {
		if (typeof obj[key] === 'boolean') result[key] = obj[key] as boolean;
	}
	return result;
}

/** Nimmt beliebige Eingaben entgegen und gibt nur bekannte Schlüssel zurück. */
export function sanitizePushPrefs(input: unknown, current: PushPrefs): PushPrefs {
	if (!input || typeof input !== 'object') return current;
	const obj = input as Record<string, unknown>;
	const result = { ...current };
	for (const key of PUSH_PREF_KEYS) {
		if (typeof obj[key] === 'boolean') result[key] = obj[key] as boolean;
	}
	return result;
}
