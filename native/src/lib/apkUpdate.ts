import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { report } from './report';

/**
 * Selbst-Aktualisierung der APK.
 *
 * Inhalts-Updates kommen automatisch über expo-updates. Ändert sich aber
 * etwas Natives (Symbole, Berechtigungen, neue Gerätefunktionen), braucht
 * es zwingend eine neue APK — Android erlaubt kein Austauschen nativer
 * Teile zur Laufzeit. Statt alle zum Browser zu schicken, lädt die App
 * die neue Datei selbst herunter und öffnet Androids Installer.
 */
export type ApkInfo = {
	version: string;
	versionCode: number;
	available: boolean;
	sizeBytes: number;
	url: string;
};

/** Höhere Version verfügbar? Vergleich über die Versionsnummer (Code). */
export async function checkApkUpdate(baseUrl: string): Promise<ApkInfo | null> {
	if (Platform.OS !== 'android') return null;
	try {
		const res = await fetch(`${baseUrl}/api/v1/app-version`);
		if (!res.ok) return null;
		const info = (await res.json()) as ApkInfo;
		if (!info.available) return null;
		const installed = Number(Application.nativeBuildVersion ?? '0');
		return info.versionCode > installed ? info : null;
	} catch {
		return null;
	}
}

/**
 * Lädt die APK und startet Androids Installationsdialog.
 * Beim ersten Mal fragt Android einmalig nach der Erlaubnis, Apps aus
 * dieser App zu installieren — danach nie wieder.
 */
export async function downloadAndInstallApk(
	info: ApkInfo,
	onProgress?: (percent: number) => void
): Promise<void> {
	const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
	const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');

	void report('schritt', `Update gestartet auf Version ${info.version}`, {
		sizeMB: Math.round(info.sizeBytes / 1048576)
	});

	const target = `${FileSystem.cacheDirectory}parkour-portal-${info.version}.apk`;
	// Alte Teildownloads verwerfen, sonst installiert Android womöglich Müll.
	try {
		await FileSystem.deleteAsync(target, { idempotent: true });
	} catch {
		/* egal */
	}

	const task = FileSystem.createDownloadResumable(info.url, target, {}, (p) => {
		if (onProgress && p.totalBytesExpectedToWrite > 0) {
			onProgress(Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100));
		}
	});
	const result = await task.downloadAsync();
	if (!result?.uri) {
		void report('error', 'Update: Download lieferte keine Datei');
		throw new Error('Download fehlgeschlagen');
	}
	void report('schritt', 'Update: Datei geladen');

	// Kam weniger an als angekündigt, ist die Datei kaputt — Androids
	// Installer meldet das nicht, er tut einfach nichts.
	try {
		const stat = await FileSystem.getInfoAsync(result.uri);
		const got = stat.exists && 'size' in stat ? (stat.size as number) : 0;
		if (info.sizeBytes > 0 && got > 0 && got < info.sizeBytes * 0.98) {
			throw new Error(
				`Download unvollständig (${Math.round(got / 1048576)} von ${Math.round(info.sizeBytes / 1048576)} MB). Bitte mit stabilem WLAN erneut versuchen.`
			);
		}
	} catch (e) {
		if (e instanceof Error && e.message.startsWith('Download unvollständig')) throw e;
		// Grössenprüfung nicht möglich — trotzdem weiter versuchen.
	}

	const contentUri = await FileSystem.getContentUriAsync(result.uri);

	// FLAG_GRANT_READ_URI_PERMISSION (1) + FLAG_ACTIVITY_NEW_TASK (0x10000000).
	const FLAGS = 1 | 0x10000000;

	// Erst der reguläre Weg: „Datei öffnen" mit dem APK-Typ. Der frühere
	// Aufruf INSTALL_PACKAGE gilt seit Android 10 als überholt — viele
	// Geräte tun damit schlicht NICHTS, die App wirkt dann eingefroren.
	try {
		await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
			data: contentUri,
			type: 'application/vnd.android.package-archive',
			flags: FLAGS
		});
		void report('schritt', 'Update: Installationsdialog geöffnet');
		return;
	} catch (e) {
		void report('error', 'Update: Öffnen der Datei schlug fehl', e);
	}

	try {
		await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
			data: contentUri,
			flags: FLAGS
		});
	} catch (e) {
		void report('error', 'Update: Installation blockiert', e);
		throw new Error('INSTALL_BLOCKED');
	}
}

/**
 * Öffnet die Android-Einstellung „Unbekannte Apps installieren" für diese
 * App. Ohne diese Erlaubnis öffnet sich gar kein Installationsdialog.
 */
export async function openInstallPermissionSettings(): Promise<void> {
	const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
	const pkg = Application.applicationId ?? 'org.duckdns.matetraining.app';
	await IntentLauncher.startActivityAsync(
		'android.settings.MANAGE_UNKNOWN_APP_SOURCES',
		{ data: `package:${pkg}` }
	);
}
