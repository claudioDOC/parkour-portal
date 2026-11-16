import { Platform } from 'react-native';
import { registerFcmDevice } from './api';
import { report } from './report';

/**
 * Firebase-Push der nativen App (ab APK 1.4):
 * - fragt beim ersten Start nativ um Erlaubnis (Android 13+),
 * - holt das FCM-Geräte-Token und meldet es beim Portal an,
 * - zeigt Benachrichtigungen auch im Vordergrund,
 * - Antippen öffnet die richtige Seite (data.url vom Server).
 *
 * Auf älteren APKs (ohne google-services) schlägt das Token-Holen fehl —
 * dann passiert einfach nichts. Nie die App deswegen stören.
 */
export async function setupPush(onOpenUrl: (url: string) => void): Promise<void> {
	// onOpenUrl darf NIEMALS navigieren — es meldet nur das Ziel. Sonst
	// läuft der Sprung, während der Splash noch läuft und es gar keine
	// Navigation gibt: Absturz, Neustart, Endlosschleife.
	if (Platform.OS !== 'android') return;
	let Notifications: typeof import('expo-notifications');
	try {
		Notifications = require('expo-notifications');
	} catch {
		return;
	}
	try {
		// Auch im Vordergrund als Banner zeigen.
		Notifications.setNotificationHandler({
			handleNotification: async () => ({
				shouldShowBanner: true,
				shouldShowList: true,
				shouldPlaySound: true,
				shouldSetBadge: false
			})
		});

		await Notifications.setNotificationChannelAsync('default', {
			name: 'Parkour Portal',
			importance: Notifications.AndroidImportance.HIGH,
			vibrationPattern: [0, 200, 100, 200]
		});

		const perm = await Notifications.getPermissionsAsync();
		const granted = perm.granted
			? true
			: (await Notifications.requestPermissionsAsync()).granted;
		if (!granted) {
			// Bisher still — dann fehlte im Admin jede Spur, warum jemand nie
			// eine Benachrichtigung bekommt (Marius, November 2026).
			void report('schritt', 'Push-Berechtigung verweigert — keine Benachrichtigungen');
			return;
		}

		const device = await Notifications.getDevicePushTokenAsync();
		const token = typeof device.data === 'string' ? device.data : '';
		if (token) await registerFcmDevice(token);

		// Google tauscht Geräte-Kennzeichen gelegentlich aus (Neuinstallation,
		// Datenwiederherstellung, Ablauf). Ohne das hier meldet sich die App
		// nie neu an — und die Benachrichtigungen bleiben stillschweigend weg.
		Notifications.addPushTokenListener((next) => {
			const fresh = typeof next.data === 'string' ? next.data : '';
			if (fresh) registerFcmDevice(fresh).catch(() => {});
		});

		// War die App zu, ist der Tipp schon passiert, bevor der Listener
		// steht — diese Antwort muss man ausdrücklich nachholen.
		try {
			const last = await Notifications.getLastNotificationResponseAsync();
			const coldUrl = last?.notification.request.content.data?.url;
			if (typeof coldUrl === 'string' && coldUrl.startsWith('/')) onOpenUrl(coldUrl);
		} catch {
			/* keine gespeicherte Antwort */
		}

		// Tippen auf eine Benachrichtigung → Ziel-Seite melden.
		// Der Rückruf läuft ausserhalb dieses try — ein Fehler darin würde
		// die App abschiessen. Darum hier noch einmal absichern.
		Notifications.addNotificationResponseReceivedListener((response) => {
			try {
				const url = response.notification.request.content.data?.url;
				if (typeof url === 'string' && url.startsWith('/')) onOpenUrl(url);
			} catch {
				/* Ziel nicht verwertbar — App läuft normal weiter */
			}
		});
	} catch {
		// Ältere APK ohne Firebase-Unterbau — still bleiben.
	}
}

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/**
 * Stand der Benachrichtigungs-Berechtigung, ohne etwas auszulösen — für den
 * Hinweis auf der Startseite. `denied` heisst: der Nutzer hat abgelehnt und
 * Android fragt nicht mehr; dann hilft nur der Weg in die Systemeinstellungen.
 */
export async function getPushStatus(): Promise<{ status: PushStatus; canAskAgain: boolean }> {
	if (Platform.OS !== 'android') return { status: 'unsupported', canAskAgain: false };
	try {
		const Notifications: typeof import('expo-notifications') = require('expo-notifications');
		const perm = await Notifications.getPermissionsAsync();
		if (perm.granted) return { status: 'granted', canAskAgain: false };
		return {
			status: perm.status === 'undetermined' ? 'undetermined' : 'denied',
			canAskAgain: perm.canAskAgain !== false
		};
	} catch {
		return { status: 'unsupported', canAskAgain: false };
	}
}
