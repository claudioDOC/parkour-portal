import { useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { getWebView } from '../lib/nativeModules';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/themeContext';
import { TopBar } from '../lib/ui';
import { BASE_URL, getToken } from '../lib/api';

/**
 * Karte direkt in der App: die Portal-Karte läuft in einer eingebetteten
 * Ansicht — kein externer Browser, kein Verlassen der App. Das Token wird
 * als Cookie gesetzt, damit die Seite eingeloggt lädt.
 */
export default function MapScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const [loading, setLoading] = useState(true);
	const [token, setToken] = useState<string | null>(null);
	const asked = useRef(false);

	if (!asked.current) {
		asked.current = true;
		getToken().then(setToken);
	}

	const WebView = getWebView();

	return (
		<View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
			<View style={{ paddingHorizontal: 20 }}>
				<TopBar back kicker="Alle Spots" title="Karte" />
			</View>
			<View style={{ flex: 1, marginTop: 12 }}>
				{token && WebView ? (
					<WebView
						source={{
							uri: `${BASE_URL}/map`,
							headers: { Authorization: `Bearer ${token}` }
						}}
						style={{ flex: 1, backgroundColor: colors.bg }}
						onLoadEnd={() => setLoading(false)}
						// Session-Cookie aus dem Token setzen, damit die Karte eingeloggt lädt.
						injectedJavaScriptBeforeContentLoaded={`document.cookie = "session=${token}; path=/";`}
						sharedCookiesEnabled
						thirdPartyCookiesEnabled
						domStorageEnabled
						javaScriptEnabled
					/>
				) : null}
				{loading ? (
					<View style={styles.loading} pointerEvents="none">
						<ActivityIndicator color={colors.accent} size="large" />
					</View>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	loading: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: 'center',
		justifyContent: 'center'
	}
});
