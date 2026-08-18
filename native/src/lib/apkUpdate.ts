import { Platform } from 'react-native';
import * as Application from 'expo-application';

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
	if (!result?.uri) throw new Error('Download fehlgeschlagen');

	const contentUri = await FileSystem.getContentUriAsync(result.uri);
	await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
		data: contentUri,
		flags: 1 // FLAG_GRANT_READ_URI_PERMISSION
	});
}
