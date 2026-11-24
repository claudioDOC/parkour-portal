import * as Updates from 'expo-updates';
import { readToken, writeToken } from './tokenStore';
import { report } from './report';

/**
 * Neustart für ein geladenes Update — sauber und nachvollziehbar.
 *
 * Gemeldet wurde: Nach „Jetzt neu starten" ging die App einfach zu, statt
 * mit der neuen Version wieder aufzugehen. `Updates.reloadAsync()` baut
 * die JS-Seite neu auf, während native Ansichten (Karte, Video,
 * Webansicht) noch stehen — reisst eine davon beim Neuaufbau, beendet
 * Android die ganze App. Darum:
 *
 *  1. Vormerken, dass ein Neustart angefordert ist (übersteht auch einen
 *     Absturz) und das dem Server melden.
 *  2. Den ganzen Bildschirm abbauen — RootLayout zeigt nur noch
 *     „Neue Version wird gestartet …", jede Karte und jedes Video wird
 *     regulär entfernt.
 *  3. Erst dann neu starten.
 *
 * Beim nächsten Start meldet `reportRestartOutcome()`, ob der Neustart
 * geklappt hat (restartCount > 0) oder die App zu war und von Hand
 * geöffnet wurde — samt Fehlern aus dem Protokoll von expo-updates.
 */

const KEY = 'update-restart';

let setCurtain: ((on: boolean) => void) | null = null;

/** RootLayout meldet hier, wie es den Bildschirm abbaut. */
export function registerRestartCurtain(fn: (on: boolean) => void): () => void {
	setCurtain = fn;
	return () => {
		if (setCurtain === fn) setCurtain = null;
	};
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function restartForUpdate(source: 'hinweis' | 'mehr'): Promise<void> {
	const from = Updates.updateId ?? 'eingebaut';
	try {
		await writeToken(KEY, JSON.stringify({ at: Date.now(), from, source }));
	} catch {
		/* ohne Vermerk nur ohne Auswertung */
	}
	// Die Meldung soll ankommen, bevor neu gestartet wird — aber nie bremsen.
	await Promise.race([report('schritt', 'Neustart für Update angefordert', { quelle: source }), wait(1500)]);

	setCurtain?.(true);
	// Zwei, drei Bilder Zeit, damit React Karte & Co. wirklich abbaut.
	await wait(400);
	try {
		await Updates.reloadAsync();
	} catch (e) {
		setCurtain?.(false);
		try {
			await writeToken(KEY, '');
		} catch {
			/* egal */
		}
		void report(
			'error',
			`Neustart fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
			e instanceof Error ? e : undefined
		);
		throw e;
	}
}

/** Beim Start aufrufen: Kam die App aus einem angeforderten Neustart? */
export async function reportRestartOutcome(restartCount: number): Promise<void> {
	let raw: string | null = null;
	try {
		raw = await readToken(KEY);
	} catch {
		return;
	}
	if (!raw) return;
	try {
		await writeToken(KEY, '');
	} catch {
		/* egal */
	}
	let info: { at: number; from: string; source: string };
	try {
		info = JSON.parse(raw);
	} catch {
		return;
	}
	const ageMs = Date.now() - info.at;
	if (!(ageMs >= 0) || ageMs > 6 * 3600_000) return;

	let fehler: string[] = [];
	try {
		const entries = await Updates.readLogEntriesAsync(Math.min(ageMs + 60_000, 3600_000));
		fehler = entries
			.filter((e) => e.level === 'error' || e.level === 'fatal')
			.slice(-5)
			.map((e) =>
				[`${e.code}: ${e.message}`, ...(e.stacktrace ?? []).slice(0, 3)].join(' | ').slice(0, 400)
			);
	} catch {
		/* Protokoll nicht lesbar */
	}

	const ok = restartCount > 0;
	void report(ok ? 'schritt' : 'error', ok ? 'Neustart für Update geklappt' : 'Neustart für Update: App war zu, von Hand neu geöffnet', {
		quelle: info.source,
		vorher: info.from,
		jetzt: Updates.updateId ?? 'eingebaut',
		sekunden: Math.round(ageMs / 1000),
		restartCount,
		notstart: Updates.isEmergencyLaunch ? (Updates.emergencyLaunchReason ?? 'ja') : null,
		fehler
	});
}
