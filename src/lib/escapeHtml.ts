/**
 * Maskiert HTML-Sonderzeichen.
 *
 * Gebraucht überall dort, wo Text per `innerHTML` in die Seite kommt —
 * bei Leaflet ist das der Normalfall (`bindPopup`, `divIcon`). Ein
 * Spot-Name oder Benutzername darf dort niemals roh landen: Sonst wird
 * aus einem Namen wie `<img src=x onerror=…>` ausführbarer Code.
 */
export function escapeHtml(value: string | null | undefined): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
