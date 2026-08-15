import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { useTheme } from './themeContext';
import { getNativeMap } from './nativeModules';
import { SafeRender } from './SafeRender';

export type MapMarker = {
	id: number;
	name: string;
	city?: string;
	lat: number;
	lon: number;
	/** 'main' = dieser Spot, 'parking' = Parkplatz, sonst Nachbar-Spot */
	kind: string;
};

/** Freier Vektorkarten-Stil ohne Konto und ohne Schlüssel. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Echte native Karte (MapLibre) — die Kacheln zeichnet Android selbst,
 * es läuft keine Webseite im Hintergrund. Fehlt das Modul (ältere
 * Installation), erscheint ein Hinweis mit Download-Link.
 */
export function NativeMap({
	markers,
	height = 240,
	zoom = 15
}: {
	markers: MapMarker[];
	height?: number;
	zoom?: number;
}) {
	const { colors } = useTheme();
	const main = markers.find((m) => m.kind === 'main') ?? markers[0];
	const maplibre = getNativeMap();
	// Bewusst KEINE Vorab-Erkennung mehr: die hat in beide Richtungen
	// falsch gelegen. Die Karte wird gezeichnet; klappt es nicht, greift
	// die Absturzsicherung und zeigt den Ersatzinhalt.

	const pins = useMemo(
		() =>
			markers.map((m) => ({
				...m,
				color: m.kind === 'main' ? colors.accent : m.kind === 'parking' ? '#47c5ff' : '#9ca3af'
			})),
		[markers, colors]
	);

	if (!main) return null;

	const fallback = (
		<View style={[styles.wrap, styles.fallback, { height: 150, backgroundColor: colors.hover }]}>
			<Text style={[styles.title, { color: colors.fg }]}>Native Karte ab App-Version 1.3</Text>
			<Text style={[styles.hint, { color: colors.fg }]}>
				Einmal neu installieren — danach zeichnet die App die Karte selbst.
			</Text>
			<Pressable
				onPress={() => Linking.openURL('https://matetraining.duckdns.org/app')}
				style={[styles.btn, { backgroundColor: colors.accent }]}
			>
				<Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: '700' }}>
					App herunterladen
				</Text>
			</Pressable>
		</View>
	);

	if (!maplibre) return fallback;

	// Exakte Namen dieser MapLibre-Version: Map, Marker (Prop lngLat), Camera.
	const { Map: LibreMap, Camera, Marker } = maplibre as {
		Map: React.ComponentType<Record<string, unknown>>;
		Camera: React.ComponentType<Record<string, unknown>>;
		Marker: React.ComponentType<Record<string, unknown>>;
	};
	if (!LibreMap || !Marker) return fallback;

	return (
		<SafeRender fallback={fallback}>
			<View style={[styles.wrap, { height, backgroundColor: colors.hover }]}>
				<LibreMap style={{ flex: 1 }} mapStyle={MAP_STYLE}>
					<Camera
						initialViewState={{ centerCoordinate: [main.lon, main.lat], zoomLevel: zoom }}
					/>
					{pins.map((p) => (
						<Marker key={`${p.kind}-${p.id}`} lngLat={[p.lon, p.lat]}>
							<View style={[styles.pin, { backgroundColor: p.color }]}>
								<Text style={styles.pinText}>
									{p.kind === 'parking' ? 'P' : p.kind === 'main' ? '★' : '•'}
								</Text>
							</View>
						</Marker>
					))}
				</LibreMap>
			</View>
		</SafeRender>
	);
}

const styles = StyleSheet.create({
	wrap: { borderRadius: 16, overflow: 'hidden' },
	fallback: { alignItems: 'center', justifyContent: 'center', padding: 16, gap: 6 },
	title: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
	hint: { fontSize: 13, opacity: 0.6, textAlign: 'center' },
	btn: { marginTop: 8, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
	pin: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#fff'
	},
	pinText: { color: '#111', fontSize: 13, fontWeight: '700' }
});
