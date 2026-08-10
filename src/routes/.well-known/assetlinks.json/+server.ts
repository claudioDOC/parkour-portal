import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Digital Asset Links für die Android-App (Trusted Web Activity).
 *
 * Android prüft diese Datei beim Start: stimmt der Fingerabdruck der App-Signatur
 * mit einem Eintrag überein, läuft die App ohne Browser-Adressleiste im Vollbild.
 * Sonst erscheint oben ein Chrome-Balken mit der URL.
 *
 * Gesetzt über Umgebungsvariablen (siehe docs/ANDROID-APP.md):
 *   ANDROID_PACKAGE_NAME       z. B. org.duckdns.matetraining.twa
 *   ANDROID_CERT_FINGERPRINTS  SHA-256, mit Doppelpunkten; mehrere per Komma
 *                              (Upload-Key UND Play-App-Signing-Key eintragen)
 */
export const GET: RequestHandler = async () => {
	const packageName = process.env.ANDROID_PACKAGE_NAME?.trim() || 'org.duckdns.matetraining.twa';
	const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? '')
		.split(',')
		.map((f) => f.trim().toUpperCase())
		.filter(Boolean);

	const body = [
		{
			relation: ['delegate_permission/common.handle_all_urls'],
			target: {
				namespace: 'android_app',
				package_name: packageName,
				sha256_cert_fingerprints: fingerprints
			}
		}
	];

	return json(body, {
		headers: {
			// Android cacht die Datei; kurze Zeit, damit ein Key-Wechsel schnell greift.
			'Cache-Control': 'public, max-age=300'
		}
	});
};
