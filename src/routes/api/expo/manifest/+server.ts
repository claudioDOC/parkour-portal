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
	if (platform !== 'android') throw error(404, 'Nur Android');

	let manifestRaw: string;
	try {
		manifestRaw = readFileSync(join(UPDATES_DIR, platform, 'manifest.json'), 'utf8');
	} catch {
		throw error(404, 'Kein Update veröffentlicht');
	}
	const manifest = JSON.parse(manifestRaw);

	// Nur Updates für dieselbe Runtime — bei nativen Änderungen (neue
	// Berechtigung, neue Bibliothek) zählt die neue APK, nicht dieses Bundle.
	const clientRuntime = request.headers.get('expo-runtime-version');
	if (clientRuntime && clientRuntime !== manifest.runtimeVersion) {
		throw error(404, 'Keine Updates für diese Runtime-Version');
	}

	const protocol = request.headers.get('expo-protocol-version') ?? '0';
	const json = JSON.stringify(manifest);

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

	// Protokoll 1: multipart/mixed mit einem "manifest"-Teil (ohne Signatur).
	const boundary = 'ParkourPortalUpdate';
	const body =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="manifest"\r\n` +
		`Content-Type: application/json\r\n\r\n` +
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
