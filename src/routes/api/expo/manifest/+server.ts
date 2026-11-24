import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Update-Server für die native App (Expo-Updates-Protokoll).
 *
 * Die App fragt hier bei jedem Start an; liegt ein neueres Bundle unter
 * data/expo-updates/android/, lädt sie es und startet damit — so bekommen
 * alle Installationen jede Änderung automatisch vom eigenen Container.
 *
 * Das Manifest (inkl. aller Datei-Hashes) wird von native/scripts/
 * deploy-update.mjs beim Veröffentlichen fertig erzeugt; hier wird es nur
 * ausgeliefert. Kein Login nötig — die App hat beim ersten Start noch keins.
 */
const UPDATES_DIR = join(process.cwd(), 'data', 'expo-updates');

export const GET: RequestHandler = async ({ request }) => {
	const platform = request.headers.get('expo-platform') ?? 'android';
	// Android-APK und sideloadete iOS-App teilen sich denselben Kanal.
	if (platform !== 'android' && platform !== 'ios') throw error(404, 'Plattform unbekannt');

	let manifestRaw: string;
	try {
		manifestRaw = readFileSync(join(UPDATES_DIR, platform, 'manifest.json'), 'utf8');
	} catch {
		throw error(404, 'Kein Update veröffentlicht');
	}
	const manifest = JSON.parse(manifestRaw);
	const manifestRuntime: string = manifest.runtimeVersion;

	/**
	 * Auch ältere Installationen beliefern.
	 *
	 * Früher bekam eine App nur Updates ihrer exakten Runtime — dadurch blieb
	 * eine alte Installation für immer auf dem Stand ihrer APK stehen, ohne
	 * dass es jemand merkte. Die App lädt native Zusatzmodule inzwischen
	 * vorsichtig (siehe native/src/lib/nativeModules.ts) und zeigt einen
	 * Hinweis statt abzustürzen, wenn eines fehlt. Darum darf jede Runtime
	 * aus COMPATIBLE_RUNTIMES dasselbe Bundle bekommen.
	 */
	const COMPATIBLE_RUNTIMES = ['1.0.0', '1.1.0'];
	const clientRuntime = request.headers.get('expo-runtime-version');
	if (
		clientRuntime &&
		clientRuntime !== manifest.runtimeVersion &&
		!COMPATIBLE_RUNTIMES.includes(clientRuntime)
	) {
		throw error(404, 'Keine Updates für diese Runtime-Version');
	}

	/**
	 * Entscheidend: Die App prüft die Runtime SELBST noch einmal und wirft
	 * ein Update weg, dessen `runtimeVersion` nicht exakt zu ihrer passt.
	 * Ein Server, der nur mit 200 antwortet, reicht also nicht — das
	 * Manifest muss die Runtime des Anfragenden tragen.
	 */
	if (clientRuntime && COMPATIBLE_RUNTIMES.includes(clientRuntime)) {
		manifest.runtimeVersion = clientRuntime;
	}

	const protocol = request.headers.get('expo-protocol-version') ?? '0';
	let json = JSON.stringify(manifest);

	/**
	 * Signierte Auslieferung: Apps ab der signierten APK schicken
	 * `expo-expect-signature` und nehmen nur ein Manifest an, dessen
	 * Signatur zu ihrem eingebauten Zertifikat passt. Signiert wird beim
	 * Veröffentlichen (deploy-update.mjs) — der private Schlüssel liegt
	 * nicht beim Server, hier wird nur die fertige Signatur mitgeschickt.
	 * Dafür muss das Manifest Byte für Byte so bleiben, wie es signiert
	 * wurde; das passt, solange die App dieselbe Runtime hat wie das Update
	 * (ältere Runtimes prüfen keine Signatur und bekommen das angepasste,
	 * unsignierte Manifest wie bisher).
	 */
	let signature: string | null = null;
	if (request.headers.has('expo-expect-signature') && manifest.runtimeVersion === manifestRuntime) {
		try {
			const signedBody = readFileSync(join(UPDATES_DIR, platform, 'manifest.signed.json'), 'utf8');
			const sig = readFileSync(join(UPDATES_DIR, platform, 'manifest.sig'), 'utf8').trim();
			// Gehören Signatur und Manifest zum selben Update?
			if ((JSON.parse(signedBody) as { id?: string }).id === manifest.id && sig) {
				json = signedBody;
				signature = sig;
			}
		} catch {
			/* noch kein signiertes Update veröffentlicht */
		}
	}

	if (protocol === '0') {
		return new Response(json, {
			headers: {
				'content-type': 'application/json',
				'expo-protocol-version': '0',
				'expo-sfv-version': '0',
				'cache-control': 'private, max-age=0'
			}
		});
	}

	// Protokoll 1: multipart/mixed mit einem "manifest"-Teil (signiert, wenn verlangt).
	const boundary = 'ParkourPortalUpdate';
	const body =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="manifest"\r\n` +
		`Content-Type: application/json; charset=utf-8\r\n` +
		(signature ? `expo-signature: ${signature}\r\n` : '') +
		`\r\n` +
		`${json}\r\n` +
		`--${boundary}--\r\n`;

	return new Response(body, {
		headers: {
			'content-type': `multipart/mixed; boundary=${boundary}`,
			'expo-protocol-version': '1',
			'expo-sfv-version': '0',
			'cache-control': 'private, max-age=0'
		}
	});
};
