import { Platform, Dimensions } from 'react-native';
import * as Updates from 'expo-updates';
import { installedAppVersion, installedAppBuild } from './nativeModules';
import { BASE_URL, getToken } from './api';

/**
 * Fehlerberichte an den Server.
 *
 * Vorher gab es nichts dergleichen: Stürzte die App bei jemand anderem
 * ab, liess sich nur raten — wir wussten nicht einmal, welche App-Version
 * oder welches Android die Person hat. Jede Meldung trägt darum den
 * vollen Kontext: App-Version und Build, Android-Fassung, Gerät,
 * Update-Stand, Bildschirm und eine Sitzungs-Kennung, die alle Meldungen
 * eines App-Starts zusammenhält.
 */
type Kind = 'start' | 'crash' | 'error' | 'schritt';

/** Eine Kennung je App-Start — ohne sie liessen sich Meldungen nicht paaren. */
const sessionId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

let currentRoute = '/';
export function setReportRoute(path: string) {
	currentRoute = path || '/';
}

function tryRequire<T>(load: () => T): T | null {
	try {
		return load();
	} catch {
		return null;
	}
}

/** Gerätedaten: erst expo-device, sonst die Angaben aus React Native. */
function deviceFacts() {
	const androidConstants = (Platform.constants ?? {}) as Record<string, unknown>;
	const dev = tryRequire(() => require('expo-device') as typeof import('expo-device'));
	const win = Dimensions.get('window');
	const model =
		dev?.modelName ?? (typeof androidConstants.Model === 'string' ? androidConstants.Model : null);
	const manufacturer =
		dev?.manufacturer ??
		(typeof androidConstants.Manufacturer === 'string' ? androidConstants.Manufacturer : null);
	const osVersion =
		dev?.osVersion ??
		(typeof androidConstants.Release === 'string' ? androidConstants.Release : String(Platform.Version));
	return {
		os: Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : Platform.OS,
		osVersion,
		model,
		manufacturer,
		device: [
			manufacturer,
			model,
			`API ${Platform.Version}`,
			`${Math.round(win.width)}×${Math.round(win.height)}`,
			dev?.totalMemory ? `${Math.round(dev.totalMemory / 1024 / 1024 / 1024)} GB RAM` : null,
			dev?.isDevice === false ? 'Emulator' : null
		]
			.filter(Boolean)
			.join(' · ')
	};
}

/** Welche nativen Bausteine hat diese Installation? Erklärt viele Abstürze. */
function moduleFacts(): string {
	// Namen müssen wörtlich dastehen — der Bündler löst require() nur so auf.
	const has = (load: () => unknown) => {
		try {
			load();
			return '✓';
		} catch {
			return '✗';
		}
	};
	return [
		`Installer ${has(() => require('expo-intent-launcher'))}`,
		`Video ${has(() => require('expo-video'))}`,
		`Karte ${has(() => require('@maplibre/maplibre-react-native'))}`,
		`Fotos ${has(() => require('expo-image-picker'))}`,
		`Standort ${has(() => require('expo-location'))}`
	].join(' · ');
}

function appFacts() {
	return {
		appVersion: installedAppVersion() ?? 'unbekannt',
		appBuild: installedAppBuild(),
		runtimeVersion:
			typeof Updates.runtimeVersion === 'string' ? Updates.runtimeVersion : null,
		updateId: Updates.updateId ?? 'eingebaut',
		updateCreatedAt: Updates.createdAt ? new Date(Updates.createdAt).toISOString() : null,
		channel: Updates.channel ?? null
	};
}

export async function report(kind: Kind, message: string, extra?: unknown): Promise<void> {
	try {
		const token = await getToken().catch(() => null);
		const app = appFacts();
		const dev = deviceFacts();
		const extraText =
			extra instanceof Error
				? extra.message
				: extra != null
					? JSON.stringify(extra)
					: null;
		await fetch(`${BASE_URL || 'https://matetraining.duckdns.org'}/api/v1/client-log`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(token ? { authorization: `Bearer ${token}` } : {})
			},
			body: JSON.stringify({
				kind,
				message: String(message).slice(0, 4000),
				platform: Platform.OS,
				route: currentRoute,
				sessionId,
				...app,
				...dev,
				stack: extra instanceof Error ? String(extra.stack ?? '').slice(0, 4000) : null,
				extra: [
					extraText,
					`Bausteine: ${moduleFacts()}`,
					app.updateCreatedAt ? `Stand vom ${app.updateCreatedAt}` : null
				]
					.filter(Boolean)
					.join(' · ')
					.slice(0, 4000)
			})
		});
	} catch {
		// Offline oder Server weg — ein Bericht darf nie stören.
	}
}

/**
 * Fängt alles ab, was sonst wortlos die App beendet. Der bisherige
 * Handler wird danach weiterhin aufgerufen, damit sich am Verhalten
 * nichts ändert — es wird nur zusätzlich gemeldet.
 */
export function installCrashReporter(): void {
	const globalAny = globalThis as unknown as {
		ErrorUtils?: {
			getGlobalHandler: () => (e: unknown, isFatal?: boolean) => void;
			setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void;
		};
	};
	const utils = globalAny.ErrorUtils;
	if (!utils) return;
	const previous = utils.getGlobalHandler();
	utils.setGlobalHandler((e, isFatal) => {
		const err = e instanceof Error ? e : new Error(String(e));
		void report(isFatal ? 'crash' : 'error', `${isFatal ? 'Absturz' : 'Fehler'}: ${err.message}`, err);
		previous(e, isFatal);
	});
}
