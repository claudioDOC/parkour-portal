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

	const ok = restartCount > 0;
	let fehler: string[] = [];
	/** Ging es schief, der ganze Ablauf rund um den Neustart (alle Stufen). */
	let ablauf: string[] = [];
	try {
		const entries = await Updates.readLogEntriesAsync(Math.min(ageMs + 60_000, 3600_000));
		fehler = entries
			.filter((e) => e.level === 'error' || e.level === 'fatal')
			.slice(-5)
			.map((e) =>
				[`${e.code}: ${e.message}`, ...(e.stacktrace ?? []).slice(0, 3)].join(' | ').slice(0, 400)
			);
		if (!ok) {
			ablauf = entries
				.filter((e) => e.timestamp >= info.at - 5_000 && !e.message.includes('embeddedAssetFileMap'))
				.slice(0, 25)
				.map((e) =>
					`${Math.round((e.timestamp - info.at) / 100) / 10}s ${e.level} ${e.code}: ${e.message}`.slice(0, 180)
				);
		}
	} catch {
		/* Protokoll nicht lesbar */
	}

	void report(ok ? 'schritt' : 'error', ok ? 'Neustart für Update geklappt' : 'Neustart für Update: App war zu, von Hand neu geöffnet', {
		quelle: info.source,
		vorher: info.from,
		jetzt: Updates.updateId ?? 'eingebaut',
		sekunden: Math.round(ageMs / 1000),
		restartCount,
		notstart: Updates.isEmergencyLaunch ? (Updates.emergencyLaunchReason ?? 'ja') : null,
		fehler,
		...(ok ? {} : { ablauf })
	});
}

const KEY_LOG_SENT = 'restart-log-sent';

/**
 * Was geschah nach dem letzten Neustart-Befehl? Liest das Protokoll von
 * expo-updates (bleibt einen Tag auf dem Gerät) und schickt die Einträge
 * ab dem letzten „Restart" — ohne die lange Liste eingebauter Dateien, die
 * vorher alles andere verdrängt hat. Jeder Neustart wird nur einmal
 * gemeldet.
 */
export async function reportRecentRestartLog(): Promise<void> {
	try {
		const entries = await Updates.readLogEntriesAsync(3 * 3600_000);
		const restarts = entries.filter((e) => e.message.includes('Updates state change: Restart'));
		const last = restarts.reduce<number>((m, e) => Math.max(m, e.timestamp), 0);
		if (!last) return;
		const sent = Number(await readToken(KEY_LOG_SENT).catch(() => null)) || 0;
		if (sent >= last) return;
		await writeToken(KEY_LOG_SENT, String(last));
		const after = entries
			.filter((e) => e.timestamp >= last - 1_000 && !e.message.includes('embeddedAssetFileMap'))
			.sort((a, b) => a.timestamp - b.timestamp)
			.slice(0, 30)
			.map((e) =>
				[
					`${Math.round((e.timestamp - last) / 100) / 10}s ${e.level} ${e.code}: ${e.message}`.slice(0, 160),
					...(e.stacktrace ?? []).slice(0, 2).map((l) => l.slice(0, 120))
				].join(' | ')
			);
		void report('schritt', 'Protokoll nach dem letzten Neustart-Befehl', {
			neustartUm: new Date(last).toISOString(),
			eintraege: after
		});
	} catch {
		/* Protokoll nicht lesbar */
	}
}
