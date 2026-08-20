import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { installedAppVersion } from './nativeModules';
import { BASE_URL, getToken } from './api';

/**
 * Fehlerberichte an den Server.
 *
 * Vorher gab es nichts dergleichen: Stürzte die App bei jemand anderem
 * ab, liess sich nur raten — wir wussten nicht einmal, welche App-Version
 * die Person installiert hat. Jetzt meldet die App beim Start ihre
 * Eckdaten und schickt jeden unbehandelten Fehler mit.
 *
 * Bewusst sparsam: kurze Texte, keine Inhalte, kein eigener Speicher.
 */
type Kind = 'start' | 'crash' | 'error' | 'schritt';

let device = '';
export function setDeviceHint(hint: string) {
	device = hint;
}

export async function report(kind: Kind, message: string, extra?: unknown): Promise<void> {
	try {
		const token = await getToken().catch(() => null);
		await fetch(`${BASE_URL || 'https://matetraining.duckdns.org'}/api/v1/client-log`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(token ? { authorization: `Bearer ${token}` } : {})
			},
			body: JSON.stringify({
				kind,
				message: String(message).slice(0, 4000),
				platform: Platform.OS,
				appVersion: installedAppVersion() ?? 'unbekannt',
				runtimeVersion: Updates.runtimeVersion ?? null,
				updateId: Updates.updateId ?? 'eingebaut',
				device,
				stack: extra instanceof Error ? String(extra.stack ?? '').slice(0, 4000) : null,
				extra:
					extra && !(extra instanceof Error)
						? JSON.stringify(extra).slice(0, 4000)
						: extra instanceof Error
							? String(extra.message)
							: null
			})
		});
	} catch {
		// Offline oder Server weg — ein Bericht darf nie stören.
	}
}

/**
 * Fängt alles ab, was sonst wortlos die App beendet. Der bisherige
 * Handler wird danach weiterhin aufgerufen, damit sich am Verhalten
 * nichts ändert — es wird nur zusätzlich gemeldet.
 */
export function installCrashReporter(): void {
	const globalAny = globalThis as unknown as {
		ErrorUtils?: {
			getGlobalHandler: () => (e: unknown, isFatal?: boolean) => void;
			setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void;
		};
	};
	const utils = globalAny.ErrorUtils;
	if (!utils) return;
	const previous = utils.getGlobalHandler();
	utils.setGlobalHandler((e, isFatal) => {
		const err = e instanceof Error ? e : new Error(String(e));
		void report(isFatal ? 'crash' : 'error', `${isFatal ? 'Absturz' : 'Fehler'}: ${err.message}`, err);
		previous(e, isFatal);
	});
}
