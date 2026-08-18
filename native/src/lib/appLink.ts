/**
 * Übersetzt Portal-Adressen in App-Pfade.
 *
 * Die Benachrichtigungen tragen die Adresse der WEBSEITE („/training",
 * „/spots/4"). Die App heisst dieselben Seiten anders — ohne Übersetzung
 * landet ein Tipp auf einer unbekannten Route und der Bildschirm bleibt
 * leer. Alles Unbekannte führt bewusst zur Startseite statt ins Nichts.
 */
export function appPathFromPortalUrl(raw: string | null | undefined): string {
	if (!raw || !raw.startsWith('/')) return '/';
	// Query und Anker abtrennen — die App braucht sie nirgends.
	const path = raw.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

	const spot = path.match(/^\/spots\/(\d+)$/);
	if (spot) return `/spot/${spot[1]}`;

	const profile = path.match(/^\/profil\/(\d+)$/);
	if (profile) return `/profile/${profile[1]}`;

	switch (path) {
		case '/':
		case '/training':
			return '/';
		case '/statistik':
			return '/stats';
		case '/profil':
			return '/more';
		case '/spots':
		case '/challenges':
		case '/finder':
		case '/trips':
		case '/map':
		case '/settings':
		case '/admin':
			return path;
		default:
			return '/';
	}
}
