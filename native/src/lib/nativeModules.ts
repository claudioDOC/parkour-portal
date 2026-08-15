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

function hasExpoModule(name: string): boolean {
	return Boolean((NativeModules as Record<string, unknown>)[name]);
}

/** Bild- und Videoauswahl. */
export function getImagePicker() {
	const mod = tryRequire(() => require('expo-image-picker') as typeof import('expo-image-picker'));
	if (!mod) return null;
	// Ohne native Seite werfen die Aufrufe zur Laufzeit — vorher abfangen.
	return hasExpoModule('ExponentImagePicker') || hasExpoModule('ExpoImagePicker') ? mod : null;
}

/** Standortbestimmung. */
export function getLocation() {
	const mod = tryRequire(() => require('expo-location') as typeof import('expo-location'));
	if (!mod) return null;
	return hasExpoModule('ExpoLocation') ? mod : null;
}

/**
 * Kurzbericht für die Anzeige unter „Mehr" — damit sich ohne Rätselraten
 * feststellen lässt, welche Bausteine die installierte App mitbringt.
 */
export function nativeReport(): string {
	const parts = [
		`Karte ${hasWebViewNative() ? '✓' : '✗'}`,
		`Fotos ${getImagePicker() ? '✓' : '✗'}`,
		`Standort ${getLocation() ? '✓' : '✗'}`
	];
	return parts.join(' · ');
}

/** Sind alle Zusatzmodule vorhanden? Steuert den Update-Hinweis. */
export const hasNativeExtras = () => hasWebViewNative();
