import { readToken, writeToken } from './tokenStore';

/**
 * Notbremse gegen Start-Schleifen.
 *
 * Stürzt die App kurz nach dem Start ab, startet Android sie neu — und
 * wenn die Ursache am Start hängt (etwa ein Sprung zur Zielseite einer
 * Benachrichtigung), wiederholt sich das endlos: Der Splash flackert,
 * mehr passiert nie. Darum merkt sich die App den Zeitpunkt jedes
 * Starts. Folgen mehrere Starts sehr schnell aufeinander, lässt sie
 * alles Zusätzliche weg und startet nur noch nackt.
 */
const KEY_LAST = 'boot-last';
const KEY_FAST = 'boot-fast';

/** Zwei schnelle Neustarts in Folge gelten als Schleife. */
const FAST_MS = 6000;
const LIMIT = 2;

let suspected = false;

/** Ganz früh im Start aufrufen — vor allem, was schiefgehen kann. */
export async function noteBoot(now: number): Promise<void> {
	try {
		const last = Number(await readToken(KEY_LAST)) || 0;
		const fast = Number(await readToken(KEY_FAST)) || 0;
		const quick = last > 0 && now - last < FAST_MS;
		const next = quick ? fast + 1 : 0;
		suspected = next >= LIMIT;
		await writeToken(KEY_LAST, String(now));
		await writeToken(KEY_FAST, String(next));
	} catch {
		suspected = false;
	}
}

/** Hat die App gerade mehrfach schnell hintereinander gestartet? */
export const bootLoopSuspected = () => suspected;

/** Nach einem sauberen Start (App läuft sichtbar) wieder freigeben. */
export async function clearBootLoop(): Promise<void> {
	suspected = false;
	try {
		await writeToken(KEY_FAST, '0');
	} catch {
		/* egal */
	}
}
