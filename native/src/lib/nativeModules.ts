/**
 * Native Zusatzmodule vorsichtig laden.
 *
 * Ältere Installationen der App enthalten diese Module noch nicht. Ein
 * direkter Import würde dort beim Start abstürzen. Darum werden sie erst
 * bei Bedarf geholt; fehlt eines, liefert die Funktion `null` und der
 * jeweilige Bildschirm zeigt einen Hinweis statt zu scheitern.
 */

function tryRequire<T>(load: () => T): T | null {
	try {
		return load();
	} catch {
		return null;
	}
}

/** Eingebettete Web-Ansicht (Karte). Fehlt vor App-Version 1.1.0. */
export const getWebView = () =>
	tryRequire(() => require('react-native-webview').WebView as React.ComponentType<Record<string, unknown>>);

/** Bild- und Videoauswahl. Fehlt vor App-Version 1.1.0. */
export const getImagePicker = () =>
	tryRequire(() => require('expo-image-picker') as typeof import('expo-image-picker'));

/** Standortbestimmung. Fehlt vor App-Version 1.1.0. */
export const getLocation = () =>
	tryRequire(() => require('expo-location') as typeof import('expo-location'));

/** Sind die Zusatzmodule vorhanden? Steuert Hinweise in der Oberfläche. */
export const hasNativeExtras = () => getWebView() !== null;
