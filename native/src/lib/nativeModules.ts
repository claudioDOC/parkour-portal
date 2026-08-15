import { NativeModules, UIManager } from 'react-native';

/**
 * Prüft, ob die nativen Zusatzmodule wirklich vorhanden sind.
 *
 * Wichtig und vorher falsch gemacht: `require('react-native-webview')`
 * gelingt IMMER, weil der JavaScript-Teil fest im Update-Paket steckt.
 * Nur der native Gegenpart fehlt in älteren Installationen. Deshalb wird
 * hier die native Seite geprüft — der View-Manager beziehungsweise das
 * registrierte Modul —, nicht der JavaScript-Import.
 */

function tryRequire<T>(load: () => T): T | null {
	try {
		return load();
	} catch {
		return null;
	}
}

/** Ist der native View-Manager der Web-Ansicht registriert? */
export function hasWebViewNative(): boolean {
	try {
		const cfg = UIManager.getViewManagerConfig?.('RNCWebView');
		if (cfg) return true;
	} catch {
		/* ältere Architektur meldet hier einen Fehler */
	}
	// Neue Architektur registriert stattdessen ein Modul.
	return Boolean(
		(NativeModules as Record<string, unknown>).RNCWebView ??
			(NativeModules as Record<string, unknown>).RNCWebViewModule
	);
}

/** Eingebettete Web-Ansicht (Karte) — nur wenn die native Seite existiert. */
export function getWebView() {
	if (!hasWebViewNative()) return null;
	return tryRequire(
		() => require('react-native-webview').WebView as React.ComponentType<Record<string, unknown>>
	);
}

/**
 * Expo-Module tauchen NICHT in NativeModules auf — sie hängen an einer
 * eigenen Registry. Eine Vorab-Prüfung darüber meldet fälschlich „fehlt".
 * Darum werden sie einfach geladen; scheitert der native Teil, meldet
 * sich das beim Aufruf und wird dort abgefangen.
 */
export function getImagePicker() {
	return tryRequire(() => require('expo-image-picker') as typeof import('expo-image-picker'));
}

export function getLocation() {
	return tryRequire(() => require('expo-location') as typeof import('expo-location'));
}

/**
 * Kurzbericht für die Anzeige unter „Mehr" — damit sich ohne Rätselraten
 * feststellen lässt, welche Bausteine die installierte App mitbringt.
 */
export function nativeReport(): string {
	const parts = [
		`Karte ${hasNativeMap() ? 'nativ' : hasWebViewNative() ? 'eingebettet' : '✗'}`,
		`Fotos ${getImagePicker() ? '✓' : '✗'}`,
		`Standort ${getLocation() ? '✓' : '✗'}`
	];
	return parts.join(' · ');
}

/** Echte native Karte (MapLibre) — ab App-Paket 1.3. */
export function getNativeMap() {
	return tryRequire(() => require('@maplibre/maplibre-react-native'));
}

export function hasNativeMap(): boolean {
	if (getNativeMap() === null) return false;
	/**
	 * Bewusst streng: Es muss BEIDES da sein — ein registriertes MLRN-Modul
	 * UND der View-Manager der Kartenansicht. Eine lockerere Prüfung hatte
	 * fälschlich „nativ" gemeldet, woraufhin die App beim Zeichnen abstürzte.
	 */
	let hasModule = false;
	try {
		hasModule = Object.keys(NativeModules).some((k) => k.startsWith('MLRN'));
	} catch {
		hasModule = false;
	}
	if (!hasModule) return false;
	try {
		return Boolean(
			UIManager.getViewManagerConfig?.('MLRNMapView') ??
				UIManager.getViewManagerConfig?.('MLRNAndroidTextureMapView')
		);
	} catch {
		return false;
	}
}

/** Sind alle Zusatzmodule vorhanden? Steuert den Update-Hinweis. */
export const hasNativeExtras = () => hasWebViewNative();
