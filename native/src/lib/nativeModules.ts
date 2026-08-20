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
 * Video-Wiedergabe — ab App-Paket 1.8.
 *
 * Teuer gelernt: `require('expo-video')` fasst beim Laden sofort die
 * native Seite an. Fehlt sie (ältere Installation), ist das KEIN
 * abfangbarer JavaScript-Fehler — die App stürzt ab. Darum wird vorher
 * die installierte App-Version geprüft und nur ab 1.8 überhaupt geladen.
 */
export function getVideoModule() {
	if (!atLeastVersion(nativeVersionName(), '1.8.0')) return null;
	return tryRequire(() => require('expo-video') as typeof import('expo-video'));
}

/**
 * Nur die echte Version der installierten APK („1.8.0"), niemals die aus
 * dem Update-Paket — die ist nach jedem Update neu und sagt nichts über
 * die nativen Bausteine aus. Ohne Punkte-Format gilt sie als unbekannt.
 */
function nativeVersionName(): string | null {
	// Erst expo-application fragen — expo-constants liefert die native
	// Version nicht mehr zuverlässig, wodurch die Prüfung IMMER scheiterte
	// und die Video-Wiedergabe auch auf neuen Installationen ausblieb.
	const app = tryRequire(() => require('expo-application') as typeof import('expo-application'));
	if (app?.nativeApplicationVersion && /^\d+\.\d+/.test(app.nativeApplicationVersion)) {
		return app.nativeApplicationVersion;
	}
	const c = tryRequire(() => require('expo-constants').default as Record<string, unknown>);
	const v = c?.nativeAppVersion;
	return typeof v === 'string' && /^\d+\.\d+/.test(v) ? v : null;
}

/** Vergleicht „1.8.0" mit „1.7.0" — fehlende Angabe gilt als zu alt. */
function atLeastVersion(have: string | null, want: string): boolean {
	if (!have) return false;
	const a = have.split('.').map((n) => parseInt(n, 10) || 0);
	const b = want.split('.').map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const d = (a[i] ?? 0) - (b[i] ?? 0);
		if (d !== 0) return d > 0;
	}
	return true;
}

/**
 * Version der installierten App-Datei (nicht des Update-Pakets).
 * Kommt aus der nativen Seite; ohne sie bleibt es bei „unbekannt".
 */
export function installedAppVersion(): string | null {
	// expo-application ist die verlässliche Quelle; expo-constants liefert
	// nativeAppVersion in neueren Fassungen nicht mehr — darum stand in den
	// Fehlerberichten überall „unbekannt".
	const app = tryRequire(() => require('expo-application') as typeof import('expo-application'));
	if (app?.nativeApplicationVersion) return app.nativeApplicationVersion;
	const c = tryRequire(() => require('expo-constants').default as Record<string, unknown>);
	const native = c?.nativeAppVersion;
	if (typeof native === 'string' && native) return native;
	const cfg = c?.expoConfig as { version?: string } | undefined;
	return cfg?.version ?? null;
}

/** Build-Nummer der installierten App-Datei (versionCode). */
export function installedAppBuild(): string | null {
	const app = tryRequire(() => require('expo-application') as typeof import('expo-application'));
	if (app?.nativeBuildVersion) return String(app.nativeBuildVersion);
	const c = tryRequire(() => require('expo-constants').default as Record<string, unknown>);
	const build = c?.nativeBuildVersion;
	return typeof build === 'string' || typeof build === 'number' ? String(build) : null;
}

/**
 * Kurzbericht für die Anzeige unter „Mehr" — damit sich ohne Rätselraten
 * feststellen lässt, welche Bausteine die installierte App mitbringt.
 */
export function nativeReport(): string {
	const parts = [
		`Karte ${hasNativeMap() ? 'nativ' : hasWebViewNative() ? 'eingebettet' : '✗'}`,
		`Fotos ${getImagePicker() ? '✓' : '✗'}`,
		`Standort ${getLocation() ? '✓' : '✗'}`,
		`Video ${getVideoModule() ? '✓' : '✗'}`
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
