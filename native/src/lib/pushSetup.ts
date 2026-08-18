import { Platform } from 'react-native';
import { registerFcmDevice } from './api';

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
		if (!granted) return;

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

		// Tippen auf eine Benachrichtigung → Ziel-Seite öffnen.
		Notifications.addNotificationResponseReceivedListener((response) => {
			const url = response.notification.request.content.data?.url;
			if (typeof url === 'string' && url.startsWith('/')) onOpenUrl(url);
		});
	} catch {
		// Ältere APK ohne Firebase-Unterbau — still bleiben.
	}
}
