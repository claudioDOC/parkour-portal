import { useMemo } from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { getWebView } from './nativeModules';
import { useTheme } from './themeContext';

export type MapMarker = {
	id: number;
	name: string;
	city?: string;
	lat: number;
	lon: number;
	/** 'main' = der Spot selbst, 'parking' = Parkplatz, 'nearby' = Nachbar-Spot */
	kind: string;
};

/**
 * Karte mit eigenen Pins — läuft komplett in der App. Leaflet wird als
 * fertiges HTML in eine eingebettete Ansicht geladen; die Kacheln kommen
 * direkt von OpenStreetMap, es öffnet sich kein Browser.
 */
export function MiniMap({
	markers,
	height = 220,
	zoom = 16
}: {
	markers: MapMarker[];
	height?: number;
	zoom?: number;
}) {
	const { colors } = useTheme();

	const html = useMemo(() => {
		const main = markers.find((m) => m.kind === 'main') ?? markers[0];
		if (!main) return '';
		const pins = markers
			.map((m) => {
				const color =
					m.kind === 'main' ? colors.accent : m.kind === 'parking' ? '#47c5ff' : '#9ca3af';
				const label = m.kind === 'parking' ? 'P' : m.kind === 'main' ? '★' : '•';
				return `L.marker([${m.lat}, ${m.lon}], { icon: L.divIcon({
					className: '',
					html: '<div style="width:26px;height:26px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font:700 13px sans-serif;color:#111;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)">${label}</div>',
					iconSize: [26, 26],
					iconAnchor: [13, 13]
				}) }).addTo(map).bindPopup(${JSON.stringify(m.name)});`;
			})
			.join('\n');

		return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{margin:0;height:100%;background:${colors.bg}}
.leaflet-control-attribution{font-size:9px;opacity:.6}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('map', { zoomControl: true, attributionControl: true })
	.setView([${main.lat}, ${main.lon}], ${zoom});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
	maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);
${pins}
</script></body></html>`;
	}, [markers, colors, zoom]);

	if (!html) return null;

	const WebView = getWebView();
	if (!WebView) {
		// Ältere APK ohne Kartenmodul: Das lässt sich per Update nicht
		// nachrüsten — darum ein klarer Hinweis statt eines Browser-Sprungs.
		return (
			<View
				style={[styles.wrap, styles.fallback, { height: 150, backgroundColor: colors.hover }]}
			>
				<Text style={{ color: colors.fg, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
					Karte braucht App-Version 1.2
				</Text>
				<Text style={{ color: colors.fg, opacity: 0.6, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
					Einmal neu installieren, danach läuft alles wieder automatisch.
				</Text>
				<Pressable
					onPress={() => Linking.openURL('https://matetraining.duckdns.org/app')}
					style={{
						marginTop: 12,
						backgroundColor: colors.accent,
						borderRadius: 10,
						paddingHorizontal: 18,
						paddingVertical: 10
					}}
				>
					<Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: '700' }}>
						App herunterladen
					</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={[styles.wrap, { height, backgroundColor: colors.hover }]}>
			<WebView
				source={{ html }}
				style={{ flex: 1, backgroundColor: 'transparent' }}
				scrollEnabled={false}
				originWhitelist={['*']}
				javaScriptEnabled
				domStorageEnabled
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { borderRadius: 16, overflow: 'hidden' },
	fallback: { alignItems: 'center', justifyContent: 'center', padding: 16 }
});
