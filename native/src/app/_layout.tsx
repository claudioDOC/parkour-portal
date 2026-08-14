import { useEffect, useState, createContext, useContext } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { useFonts } from 'expo-font';
import { Teko_500Medium, Teko_600SemiBold } from '@expo-google-fonts/teko';
import {
	PlusJakartaSans_400Regular,
	PlusJakartaSans_500Medium,
	PlusJakartaSans_600SemiBold,
	PlusJakartaSans_700Bold
} from '@expo-google-fonts/plus-jakarta-sans';
import { colors } from '../lib/theme';
import { getMe, getToken, logout, type Me } from '../lib/api';
import { clearDataCache } from '../lib/store';
import { ActivityProvider } from '../lib/activity';

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

export default function RootLayout() {
	const [me, setMe] = useState<Me | null>(null);
	const [ready, setReady] = useState(false);
	// Schriften der Website (Teko + Plus Jakarta Sans) — Teil der App-Identität.
	const [fontsLoaded] = useFonts({
		Teko_500Medium,
		Teko_600SemiBold,
		PlusJakartaSans_400Regular,
		PlusJakartaSans_500Medium,
		PlusJakartaSans_600SemiBold,
		PlusJakartaSans_700Bold
	});
	const segments = useSegments();
	const router = useRouter();

	useSelfHostedUpdates();

	useEffect(() => {
		(async () => {
			try {
				const token = await getToken();
				if (token) setMe(await getMe());
			} catch {
				// Token abgelaufen/ungültig → Login
			} finally {
				setReady(true);
			}
		})();
	}, []);

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

	if (!ready || !fontsLoaded) {
		return (
			<View
				style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}
			>
				<ActivityIndicator color={colors.accent} size="large" />
			</View>
		);
	}

	return (
		<AuthContext.Provider value={{ me, setMe, signOut }}>
			<ActivityProvider enabled={me !== null}>
				<StatusBar style="light" />
				<Stack
					screenOptions={{
						headerShown: false,
						contentStyle: { backgroundColor: colors.bg },
						animation: 'slide_from_right'
					}}
				>
					<Stack.Screen name="(tabs)" />
					<Stack.Screen name="login" options={{ animation: 'fade' }} />
					<Stack.Screen name="activity" options={{ animation: 'slide_from_bottom' }} />
				</Stack>
			</ActivityProvider>
		</AuthContext.Provider>
	);
}
