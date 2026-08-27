/**
 * Prüft die Ziel-Adresse eines Push-Abos.
 *
 * Die Adresse kommt vom Browser des Nutzers und wird später vom SERVER
 * aufgerufen. Ohne Prüfung liesse sich damit der Server als Bote
 * missbrauchen: Ein angemeldetes Mitglied könnte `http://127.0.0.1:…`
 * oder die Metadaten-Adresse einer Cloud eintragen und den Server dazu
 * bringen, interne Dienste anzusprechen (SSRF).
 *
 * Erlaubt sind darum nur HTTPS-Adressen der bekannten Push-Dienste.
 */
const ALLOWED_HOST_SUFFIXES = [
	// Chrome, Edge, Brave, Android
	'.googleapis.com',
	'fcm.googleapis.com',
	// Firefox
	'.push.services.mozilla.com',
	'push.services.mozilla.com',
	// Safari / iOS
	'.push.apple.com',
	'web.push.apple.com',
	// Windows / Edge (Legacy)
	'.notify.windows.com',
	'.windows.com'
];

export function isAllowedPushEndpoint(raw: string): boolean {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:') return false;
	// Adressen mit Zugangsdaten oder abweichendem Port sind nie legitim.
	if (url.username || url.password) return false;
	if (url.port && url.port !== '443') return false;

	const host = url.hostname.toLowerCase();
	// Rohe IP-Adressen schliessen private Ziele nicht aus — und kein
	// Push-Dienst braucht sie.
	if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return false;
	if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;

	return ALLOWED_HOST_SUFFIXES.some((suffix) =>
		suffix.startsWith('.') ? host.endsWith(suffix) : host === suffix
	);
}
