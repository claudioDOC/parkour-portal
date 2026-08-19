import { useEffect, useState, createContext, useContext } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, AppState, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { useFonts } from 'expo-font';
import { Teko_500Medium, Teko_600SemiBold } from '@expo-google-fonts/teko';
import {
	PlusJakartaSans_400Regular,
	PlusJakartaSans_500Medium,
	PlusJakartaSans_600SemiBold,
	PlusJakartaSans_700Bold
} from '@expo-google-fonts/plus-jakarta-sans';
import { THEMES, DEFAULT_THEME, isThemeId, type UiThemeId, type ThemeColors } from '../lib/theme';
import { ThemeProvider, useTheme } from '../lib/themeContext';
import { getMe, getToken, logout, type Me } from '../lib/api';
import { loadPrefs } from '../lib/prefs';
import { checkApkUpdate, downloadAndInstallApk, openInstallPermissionSettings } from '../lib/apkUpdate';
import { readToken, writeToken } from '../lib/tokenStore';
import { BASE_URL } from '../lib/api';
import { setupPush } from '../lib/pushSetup';
import { appPathFromPortalUrl } from '../lib/appLink';
import { noteBoot, bootLoopSuspected, clearBootLoop } from '../lib/bootGuard';
import { clearDataCache } from '../lib/store';
import { ActivityProvider } from '../lib/activity';
import { Splash } from '../lib/Splash';

/**
 * Auth-Kontext: hält den eingeloggten User. Beim Start wird das gespeicherte
 * Token gegen /api/v1/me geprüft — ist es ungültig, landet man im Login.
 */
type AuthContextValue = {
	me: Me | null;
	setMe: (me: Me | null) => void;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
	me: null,
	setMe: () => {},
	signOut: async () => {}
});

export const useAuth = () => useContext(AuthContext);

/**
 * Updates vom eigenen Server: bei jedem App-Start und bei Rückkehr in den
 * Vordergrund wird matetraining.duckdns.org gefragt, ob ein neues Bundle
 * vorliegt. Wenn ja: laden und sofort neu starten — alle haben immer
 * dieselbe Version, ohne Store und ohne Zutun.
 */
function useSelfHostedUpdates() {
	useEffect(() => {
		if (__DEV__) return;
		let busy = false;
		const check = async () => {
			if (busy) return;
			busy = true;
			try {
				const result = await Updates.checkForUpdateAsync();
				if (result.isAvailable) {
					await Updates.fetchUpdateAsync();
					await Updates.reloadAsync();
				}
			} catch {
				// Offline oder Server nicht erreichbar — beim nächsten Mal wieder.
			} finally {
				busy = false;
			}
		};
		check();
		const sub = AppState.addEventListener('change', (state) => {
			if (state === 'active') check();
		});
		return () => sub.remove();
	}, []);
}

/** Vollbild-Hinweis während des APK-Downloads — sonst wirkt die App tot. */
function InstallOverlay({ percent, colors }: { percent: number; colors: ThemeColors }) {
	return (
		<View
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: 'rgba(0,0,0,0.82)',
				alignItems: 'center',
				justifyContent: 'center',
				padding: 32,
				gap: 14
			}}
		>
			<ActivityIndicator size="large" color={colors.accent} />
			<Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>
				{`Neue App-Version wird geladen … ${percent}%`}
			</Text>
			<Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' }}>
				Rund 64 MB. Danach fragt Android, ob es installieren darf — bitte
				bestätigen. Die App bleibt so lange offen.
			</Text>
		</View>
	);
}

/**
 * Steckt IN den Providern, damit die Animations-Einstellung sofort
 * wirkt: ohne Animationen werden Seitenwechsel hart geschnitten.
 */
function AppStack({ bg }: { bg: string }) {
	const { motion } = useTheme();
	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: bg },
				animation: motion ? 'slide_from_right' : 'none'
			}}
		>
			<Stack.Screen name="(tabs)" />
			<Stack.Screen name="login" options={{ animation: motion ? 'fade' : 'none' }} />
			<Stack.Screen
				name="activity"
				options={{ animation: motion ? 'slide_from_bottom' : 'none' }}
			/>
		</Stack>
	);
}

export default function RootLayout() {
	const [me, setMe] = useState<Me | null>(null);
	const [ready, setReady] = useState(false);
	const [splashDone, setSplashDone] = useState(false);
	/** Ziel einer angetippten Benachrichtigung, bis die Navigation steht. */
	const [pendingLink, setPendingLink] = useState<string | null>(null);
	/** Fortschritt der APK-Installation in Prozent; null = läuft nicht. */
	const [installing, setInstalling] = useState<number | null>(null);
	// Theme folgt dem Profil (uiTheme), wie data-theme auf der Website.
	const [themeId, setThemeId] = useState<UiThemeId>(DEFAULT_THEME);
	useEffect(() => {
		setThemeId(isThemeId(me?.uiTheme) ? (me!.uiTheme as UiThemeId) : DEFAULT_THEME);
	}, [me]);
	const colors = THEMES[themeId];
	// Schriften der Website (Teko + Plus Jakarta Sans) — Teil der App-Identität.
	const [fontsReady] = useFonts({
		Teko_500Medium,
		Teko_600SemiBold,
		PlusJakartaSans_400Regular,
		PlusJakartaSans_500Medium,
		PlusJakartaSans_600SemiBold,
		PlusJakartaSans_700Bold
	});
	/**
	 * Schriften dürfen den Start nie blockieren: nach 2,5 s geht es auch
	 * ohne sie weiter (System-Schrift), sonst bliebe ein schwarzer Schirm.
	 */
	const [fontTimeout, setFontTimeout] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setFontTimeout(true), 2500);
		return () => clearTimeout(t);
	}, []);
	const fontsLoaded = fontsReady || fontTimeout;

	const segments = useSegments();
	const router = useRouter();

	useSelfHostedUpdates();

	useEffect(() => {
		(async () => {
			try {
				// Erst zählen, dann alles andere: nur so greift die Notbremse
				// auch dann, wenn der Rest des Starts abstürzt.
				await noteBoot(Date.now());
				// Einstellungen (Startseite, Schriftgrösse) VOR dem ersten Render.
				await loadPrefs();
				const token = await getToken();
				if (token) setMe(await getMe());
			} catch {
				// Token abgelaufen/ungültig → Login
			} finally {
				setReady(true);
			}
		})();
	}, []);

	/**
	 * Lädt und installiert die neue APK — mit sichtbarem Fortschritt.
	 * Ohne Anzeige wirkte die App während des 64-MB-Downloads eingefroren
	 * („grau"), und blieb Androids Installationsdialog aus, stand man
	 * ratlos da.
	 */
	const startApkInstall = (apk: Parameters<typeof downloadAndInstallApk>[0]) => {
		setInstalling(0);
		downloadAndInstallApk(apk, (p) => setInstalling(p))
			.then(() => setInstalling(null))
			.catch((e) => {
				setInstalling(null);
				const blocked = e instanceof Error && e.message === 'INSTALL_BLOCKED';
				Alert.alert(
					blocked ? 'Installation blockiert' : 'Fehler',
					blocked
						? 'Android erlaubt dieser App nicht, Apps zu installieren. Die Einstellung öffnet sich jetzt — dort „Aus dieser Quelle zulassen" einschalten und den Vorgang wiederholen.'
						: e instanceof Error
							? e.message
							: 'Download fehlgeschlagen',
					blocked
						? [
								{ text: 'Abbrechen', style: 'cancel' },
								{
									text: 'Einstellung öffnen',
									onPress: () => {
										openInstallPermissionSettings().catch(() => {});
									}
								}
							]
						: [{ text: 'OK' }]
				);
			});
	};

	// Neue App-Version (native Änderungen) höflich anbieten: höchstens
	// einmal am Tag, und nur wenn jemand eingeloggt ist.
	useEffect(() => {
		if (!me) return;
		(async () => {
			try {
				const today = new Date().toISOString().slice(0, 10);
				if ((await readToken('apk-hint-day')) === today) return;
				const apk = await checkApkUpdate(BASE_URL || 'https://matetraining.duckdns.org');
				if (!apk) return;
				Alert.alert(
					`Neue App-Version ${apk.version}`,
					`Es gibt eine neue Version mit Änderungen, die eine Installation brauchen (${Math.round(apk.sizeBytes / 1048576)} MB). Jetzt laden und installieren?`,
					[
						{
							text: 'Später',
							style: 'cancel',
							// Erst das Vertagen zählt als „heute erledigt". Vorher
							// abgehakt hiess: nach einem Fehlschlag kam den ganzen
							// Tag keine Nachfrage mehr.
							onPress: () => {
								writeToken('apk-hint-day', today).catch(() => {});
							}
						},
						{ text: 'Installieren', onPress: () => startApkInstall(apk) }
					]
				);
			} catch {
				/* Offline — morgen wieder */
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [me?.id]);

	// Push (FCM) einrichten, sobald jemand eingeloggt ist — nativer
	// Erlaubnis-Dialog beim ersten Mal, danach still. Ab APK 1.4 wirksam.
	useEffect(() => {
		if (!me) return;
		// Das Ziel wird nur GEMERKT. Sofort springen ginge schief: Während
		// des Splashs gibt es noch keine Navigation, und der Fehler nahm
		// die ganze App mit — Endlosschleife aus Absturz und Neustart.
		setupPush((url) => setPendingLink(appPathFromPortalUrl(url))).catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [me?.id]);

	// Erst wenn die Navigation wirklich steht, zum gemerkten Ziel springen.
	useEffect(() => {
		if (!ready || !splashDone || !me || !pendingLink) return;
		const target = pendingLink;
		setPendingLink(null);
		// Nach einer Startschleife bleibt die App bewusst auf der Startseite.
		if (bootLoopSuspected()) return;
		const t = setTimeout(() => {
			try {
				router.push(target as never);
			} catch {
				/* Ziel nicht erreichbar — Startseite ist gut genug */
			}
		}, 0);
		return () => clearTimeout(t);
	}, [ready, splashDone, me, pendingLink, router]);

	// Läuft die App sichtbar weiter, war es keine Schleife.
	useEffect(() => {
		if (!ready || !splashDone) return;
		const t = setTimeout(() => clearBootLoop(), 4000);
		return () => clearTimeout(t);
	}, [ready, splashDone]);

	// Routen-Wache: ohne Login nur /login, mit Login nie /login.
	useEffect(() => {
		if (!ready) return;
		const onLogin = segments[0] === 'login';
		if (!me && !onLogin) router.replace('/login');
		else if (me && onLogin) router.replace('/');
	}, [ready, me, segments]);

	const signOut = async () => {
		await logout();
		clearDataCache();
		setMe(null);
	};

	// Startanimation läuft, während Token und Schriften geladen werden.
	// Die Animation läuft IMMER — sie darf nie an einer Bedingung hängen.
	if (!ready || !splashDone) {
		return (
			<View style={{ flex: 1, backgroundColor: '#0d0d0f' }}>
				<Splash colors={colors} onDone={() => setSplashDone(true)} />
			</View>
		);
	}

	return (
		<SafeAreaProvider>
		<AuthContext.Provider value={{ me, setMe, signOut }}>
			<ThemeProvider themeId={themeId} setThemeId={setThemeId}>
			<ActivityProvider enabled={me !== null}>
				<StatusBar style={colors.dark ? 'light' : 'dark'} />
				<AppStack bg={colors.bg} />
				{installing !== null ? <InstallOverlay percent={installing} colors={colors} /> : null}
			</ActivityProvider>
			</ThemeProvider>
		</AuthContext.Provider>
		</SafeAreaProvider>
	);
}
