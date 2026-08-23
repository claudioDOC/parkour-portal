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

/**
 * Letzte Seite merken und nach einem Neustart wieder öffnen.
 *
 * Android beendet Apps im Hintergrund, wenn der Speicher knapp wird —
 * wer kurz in die Karten-App wechselt, landet danach wieder auf der
 * Startseite und muss seinen Spot neu suchen. Darum wird der Pfad
 * gemerkt und beim nächsten Start wiederhergestellt, solange er frisch
 * ist (30 Minuten).
 */
const KEY_ROUTE = 'last-route';
const ROUTE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Tabs merken wir NICHT: Sie sind einen Fingertipp entfernt, und nach
 * einem Update-Neustart wieder in „Mehr" statt auf der Startseite zu
 * landen, wirkt wie ein Fehler. Gemerkt wird nur, was Arbeit kostet —
 * eine Spot-Seite, ein Formular, eine Detailansicht.
 */
const TAB_ROUTES = ['/', '/finder', '/spots', '/challenges', '/more'];

export async function rememberRoute(path: string, now: number): Promise<void> {
	if (!path || path.startsWith('/login')) return;
	if (TAB_ROUTES.includes(path)) return;
	try {
		await writeToken(KEY_ROUTE, `${now}|${path}`);
	} catch {
		/* egal */
	}
}

/** Zuletzt besuchte Seite, falls sie noch frisch ist. */
export async function takeRememberedRoute(now: number): Promise<string | null> {
	try {
		const raw = await readToken(KEY_ROUTE);
		if (!raw) return null;
		await writeToken(KEY_ROUTE, '');
		const [stamp, ...rest] = raw.split('|');
		const path = rest.join('|');
		if (!path || now - Number(stamp) > ROUTE_MAX_AGE_MS) return null;
		return path;
	} catch {
		return null;
	}
}
