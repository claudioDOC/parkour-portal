import { NativeModules, UIManager, TurboModuleRegistry } from 'react-native';

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

/**
 * Modul-Suche, die auf alter UND neuer Architektur funktioniert.
 * Unter der neuen Architektur sind Module nicht mehr über NativeModules
 * aufzählbar — TurboModuleRegistry.get fällt aber auf Brücken-Module
 * zurück und findet beides.
 */
function moduleExists(name: string): boolean {
	try {
		if (TurboModuleRegistry.get(name)) return true;
	} catch {
		/* weiter unten prüfen */
	}
	try {
		if ((NativeModules as Record<string, unknown>)[name]) return true;
	} catch {
		/* weiter unten prüfen */
	}
	try {
		return Boolean(UIManager.getViewManagerConfig?.(name));
	} catch {
		return false;
	}
}

/** Ist die native Web-Ansicht vorhanden? */
export function hasWebViewNative(): boolean {
	return moduleExists('RNCWebView') || moduleExists('RNCWebViewModule');
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
 * Version der installierten App-Datei (nicht des Update-Pakets).
 * Kommt aus der nativen Seite; ohne sie bleibt es bei „unbekannt".
 */
export function installedAppVersion(): string | null {
	const c = tryRequire(() => require('expo-constants').default as Record<string, unknown>);
	const native = c?.nativeAppVersion ?? c?.nativeBuildVersion;
	if (typeof native === 'string' && native) return native;
	const cfg = c?.expoConfig as { version?: string } | undefined;
	return cfg?.version ?? null;
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
	return (
		moduleExists('MLRNModule') ||
		moduleExists('MLRNLogModule') ||
		moduleExists('MLRNCameraModule') ||
		moduleExists('MLRNMapView')
	);
}

/** Sind alle Zusatzmodule vorhanden? Steuert den Update-Hinweis. */
export const hasNativeExtras = () => hasWebViewNative();
